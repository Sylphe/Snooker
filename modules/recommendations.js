export function recommendationMode(routine) {
  return ["active", "occasional", "excluded"].includes(routine?.recommendationMode) ? routine.recommendationMode : "active";
}

export function isRecommendationEligible(routine) {
  return recommendationMode(routine) !== "excluded";
}

export function recommendationRecencyCap(routine) {
  return recommendationMode(routine) === "occasional" ? 7 : 14;
}

export function recommendationUndertrainingMultiplier(routine) {
  return recommendationMode(routine) === "occasional" ? 0.35 : 1;
}

export function recommendationModeLabel(value) {
  return {
    active:"Active recommendation",
    occasional:"Occasional only",
    excluded:"Excluded from recommendations"
  }[value] || "Active recommendation";
}

export function cappedRecencyDays(days, routine) {
  return Math.min(Number(days || 0), recommendationRecencyCap(routine));
}

export function applyRecommendationCap(score, routine) {
  return recommendationMode(routine) === "occasional" ? Math.min(score, 75) : score;
}

export function recommendationScoreFloor(routine) {
  return recommendationMode(routine) === "excluded" ? -999 : 0;
}


export function adaptiveActionForState(state) {
  switch(state.phase) {
    case "baseline":
      return "Log baseline data with normal target. Do not adjust difficulty yet.";
    case "stabilize":
      return "Repeat current setup. Keep target stable and focus on consistency.";
    case "progress":
      return state.upgrade ? "Increase target or constraint. Apply target version if appropriate." : "Raise difficulty slightly or add a constraint.";
    case "vary":
      return "Inject one variation: position, distance, cushion, or random order.";
    case "recover":
      return "Use lighter block. Reduce duration or complexity; avoid target increase.";
    case "refresh":
      return "Re-test this drill to keep the dataset current.";
    default:
      return "Maintain current drill and collect more evidence.";
  }
}

export function scoreAdaptivePriority(state, goal="auto", undertrainedBonus=0) {
  let score = 0;
  const r = state.routine;
  if (!r) return -999;
  if (r.isAnchor) score += 18;
  if (state.hit !== null) score += Math.max(0, 75 - state.hit) * 0.4;
  if (state.psi && state.psi.psi < 70) score += (70 - state.psi.psi) * 0.35;
  if (state.drift && state.drift.deltaPct < 0) score += Math.min(20, Math.abs(state.drift.deltaPct));
  if (state.plateau && state.plateau.isPlateau) score += 14;
  if (state.days >= 7) score += Math.min(12, Math.min(state.days, recommendationRecencyCap(r)));
  if (undertrainedBonus) score += undertrainedBonus * 0.8 * recommendationUndertrainingMultiplier(r);

  if (goal === "stability") {
    if (state.phase === "stabilize" || r.isAnchor) score += 25;
  } else if (goal === "progression") {
    if (state.phase === "progress" || state.upgrade) score += 25;
  } else if (goal === "recovery") {
    if (state.phase === "recover" || (state.fatigue && state.fatigue.slope < 0)) score += 25;
  } else if (goal === "variety") {
    if (state.phase === "vary" || state.days >= 10) score += 25;
  }
  return applyRecommendationCap(score, r);
}

export function scoreMixedStrategyRoutine({routine, stats, strategy, days, undertrainedBonus}) {
  if (recommendationMode(routine) === "excluded") return -999;
  let score = Number(stats?.score || 0);
  const cappedDays = cappedRecencyDays(days, routine);
  const undertraining = Number(undertrainedBonus || 0) * recommendationUndertrainingMultiplier(routine);
  if (strategy === "exploit") {
    score += (stats.hit === null ? 5 : Math.max(0, 80 - stats.hit) * 0.55);
  } else if (strategy === "explore") {
    score += Math.min(24, cappedDays * 1.5);
    score += undertraining * 1.1;
  } else {
    score += Math.min(14, cappedDays);
    score += routine.isAnchor ? 8 : 0;
  }
  if (recommendationMode(routine) === "occasional") score -= 8;
  return score;
}


function renderRecommendationDiagnostics(candidates){
  try{
    const host=document.getElementById("recommendationDiagnosticsBox");
    if(!host)return;
    if(!Array.isArray(candidates)||!candidates.length){
      host.innerHTML='<div class="muted small">No recommendation diagnostics available yet.</div>';
      return;
    }
    host.innerHTML=candidates.slice(0,5).map((c,i)=>`
      <div class="diag-row">
        <div><strong>#${i+1} ${c.name||"Routine"}</strong></div>
        <div class="small muted">${c.reason||"Balanced recommendation"}</div>
        <div class="small">Priority: ${Math.round(c.score||0)}</div>
      </div>
    `).join('');
  }catch(err){
    console.warn(err);
  }
}


/* ===== v4.25 Unified Recommendation Foundation ===== */

function derivePerformanceSignal(log, routine){
  const attempts = Number(log.attempts || log.totalAttempts || 0);
  const made = Number(log.made || log.score || 0);

  let normalizedScore = 0;
  if(attempts > 0){
    normalizedScore = Math.max(0, Math.min(100, (made / attempts) * 100));
  }else{
    normalizedScore = Number(log.normalizedScore || made || 0);
  }

  const left = Number(log.leftSideScore || 0);
  const right = Number(log.rightSideScore || 0);

  const lrBalance = (left || right)
    ? 100 - Math.abs(left - right)
    : null;

  const issues = [];

  if(attempts < 0 || made < 0){
    issues.push("negative_values");
  }

  if(attempts > 0 && made > attempts){
    issues.push("score_exceeds_attempts");
  }

  return {
    normalizedScore,
    targetHit: normalizedScore >= Number(routine?.target || 70),
    effectiveAttempts: attempts,
    confidenceWeight: Math.min(1, attempts / 20),
    scoringFamily: routine?.scoringType || "generic",
    difficultyAdjustedScore: normalizedScore,
    leftRightBalance: lrBalance,
    dataQualityFlags: issues
  };
}

function evaluateRoutinePriority(routine, logs, context={}){
  const recent = (logs || []).slice(-10);

  let avg = 50;
  if(recent.length){
    avg = recent.reduce((a,l)=>a + (Number(l.normalizedScore || l.score || 0)),0)/recent.length;
  }

  const weaknessScore = 100 - avg;
  const undertrainingScore = Math.min(100, Number(context.daysSinceLast || 0) * 4);
  const uncertaintyScore = Math.max(0, 100 - recent.length * 10);
  const fatiguePenalty = Number(context.fatigueRisk || 0) * 10;

  const totalScore =
    weaknessScore * 0.45 +
    undertrainingScore * 0.30 +
    uncertaintyScore * 0.20 -
    fatiguePenalty * 0.05;

  const reasons = [];

  if(weaknessScore > 60) reasons.push("Weakness detected");
  if(undertrainingScore > 50) reasons.push("Undertrained recently");
  if(uncertaintyScore > 50) reasons.push("Low sample confidence");
  if(context.pressureNeed) reasons.push("Pressure adaptation needed");

  return {
    totalScore,
    weaknessScore,
    undertrainingScore,
    uncertaintyScore,
    fatiguePenalty,
    reasons
  };
}

function runDataQualityAudit(){
  const results = [];

  try{
    const logs = (window.data && data.logs) || [];
    const routines = (window.data && data.routines) || [];
    const routineIds = new Set(routines.map(r=>r.id));

    logs.forEach((log,idx)=>{
      if(log.routineId && !routineIds.has(log.routineId)){
        results.push({
          severity:"medium",
          type:"orphan_log",
          message:`Log ${idx+1} references deleted routine`
        });
      }

      if(Number(log.score || 0) < 0){
        results.push({
          severity:"high",
          type:"negative_score",
          message:`Negative score detected`
        });
      }

      if(Number(log.attempts || 0) > 0 &&
         Number(log.score || 0) > Number(log.attempts || 0)){
        results.push({
          severity:"high",
          type:"score_exceeds_attempts",
          message:`Score exceeds attempts`
        });
      }
    });

  }catch(err){
    console.warn(err);
  }

  return results;
}

function renderDataQualityAudit(){
  const host = document.getElementById("dataQualityAuditBox");
  if(!host) return;

  const issues = runDataQualityAudit();

  if(!issues.length){
    host.innerHTML = '<div class="small muted">No integrity issues detected.</div>';
    return;
  }

  host.innerHTML = issues.map(i=>`
    <div class="dq-item dq-${i.severity}">
      <strong>${i.type}</strong><br/>
      <span class="small">${i.message}</span>
    </div>
  `).join('');
}

/* ===== end v4.25 foundation ===== */
