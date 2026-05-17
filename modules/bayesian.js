export function betaPosterior(successes, attempts, priorAlpha=2, priorBeta=2) {
  const s = Math.max(0, Number(successes || 0));
  const n = Math.max(0, Number(attempts || 0));
  const alpha = priorAlpha + s;
  const beta = priorBeta + Math.max(0, n - s);
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / (Math.pow(alpha + beta, 2) * (alpha + beta + 1));
  const sd = Math.sqrt(Math.max(0, variance));
  return {
    alpha,
    beta,
    attempts:n,
    successes:s,
    mean,
    lower:Math.max(0, mean - 1.96 * sd),
    upper:Math.min(1, mean + 1.96 * sd),
    sd
  };
}

function bayesianLogUsesSideSplit(log) {
  const mode = log?.sideMode || log?.sideSplitMode || log?.sideSplit;
  return !!(log?.sideSplitEnabled || mode === "left_right" || mode === "lr" || mode === "side_split" || log?.sideScores || log?.leftSideScore !== undefined || log?.rightSideScore !== undefined || log?.sideLeftScore !== undefined || log?.sideRightScore !== undefined);
}

function bayesianAttemptMode(log) {
  const mode = log?.attemptMode || log?.sideAttemptMode || log?.leftRightAttemptMode;
  return mode === "per_side" || mode === "perSide" || mode === "side" ? "per_side" : "shared";
}

function bayesianEffectiveAttempts(log) {
  const attempts = Math.max(0, Number(log?.attempts || 0));
  return bayesianLogUsesSideSplit(log) && bayesianAttemptMode(log) === "per_side" ? attempts * 2 : attempts;
}

export const BAYESIAN_DECAY_HALF_LIFE_DAYS = 30;

export function aggregateSuccessRateLogs(logs, options = {}) {
  const now = Number(options.now || Date.now());
  const halfLifeDays = Number(options.halfLifeDays || BAYESIAN_DECAY_HALF_LIFE_DAYS);
  return (logs || []).reduce((acc, l) => {
    const attempts = bayesianEffectiveAttempts(l);
    const score = Math.max(0, Number(l.score || 0));
    if (attempts > 0) {
      const logDate = l.createdAt ? new Date(l.createdAt).getTime() : now;
      const daysOld = Number.isFinite(logDate) ? Math.max(0, (now - logDate) / 86400000) : 0;
      const weight = halfLifeDays > 0 ? Math.pow(0.5, daysOld / halfLifeDays) : 1;
      acc.attempts += attempts * weight;
      acc.successes += Math.min(score, attempts) * weight;
      acc.rawAttempts += attempts;
      acc.rawSuccesses += Math.min(score, attempts);
      acc.sessions += 1;
      acc.effectiveWeight += weight;
    }
    return acc;
  }, {successes:0, attempts:0, rawSuccesses:0, rawAttempts:0, sessions:0, effectiveWeight:0, halfLifeDays});
}

export function bayesianReliabilityLabel(posterior) {
  if (!posterior || posterior.attempts < 10) return {level:"low", label:"Low confidence", detail:"Not enough attempts yet."};
  const width = posterior.upper - posterior.lower;
  if (posterior.attempts >= 80 && width <= 0.18) return {level:"high", label:"High confidence", detail:"Stable enough for target decisions."};
  if (posterior.attempts >= 30 && width <= 0.28) return {level:"medium", label:"Medium confidence", detail:"Usable, but keep collecting data."};
  return {level:"low", label:"Low confidence", detail:"Wide uncertainty band."};
}

export function formatPercent(value, digits=1) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}

export function bayesianAdvice(posterior, targetPct=0) {
  if (!posterior || !posterior.attempts) return "Log more attempts before interpreting this drill.";
  const target = Number(targetPct || 0) / 100;
  const reliability = bayesianReliabilityLabel(posterior);
  if (reliability.level === "low") return "Repeat this drill to reduce uncertainty before changing difficulty.";
  if (target && posterior.lower >= target) return "Posterior confidence is above target; consider increasing difficulty or stretch target.";
  if (target && posterior.upper < target) return "Posterior confidence is below target; keep difficulty stable and rebuild consistency.";
  if (target) return "Credible interval overlaps target; keep the same target and collect more data.";
  return "Use this as a baseline ability estimate.";
}


export function bayesianRecommendationSignal({posterior, targetPct=0}) {
  if (!posterior || !posterior.attempts) {
    return {scoreDelta:8, label:"baseline needed", action:"repeat", reason:"no Bayesian baseline yet"};
  }
  const reliability = bayesianReliabilityLabel(posterior);
  const target = Number(targetPct || 0) / 100;
  const width = posterior.upper - posterior.lower;

  if (reliability.level === "low") {
    return {
      scoreDelta:16,
      label:"uncertainty high",
      action:"repeat",
      reason:`Bayesian uncertainty is high (${formatPercent(width)} interval width)`
    };
  }

  if (target && posterior.lower >= target) {
    return {
      scoreDelta:-6,
      label:"ready to progress",
      action:"progress",
      reason:"credible interval is above target"
    };
  }

  if (target && posterior.upper < target) {
    return {
      scoreDelta:14,
      label:"rebuild consistency",
      action:"stabilize",
      reason:"credible interval is below target"
    };
  }

  if (target) {
    return {
      scoreDelta:6,
      label:"target overlap",
      action:"hold",
      reason:"credible interval overlaps target"
    };
  }

  return {
    scoreDelta:0,
    label:"baseline valid",
    action:"hold",
    reason:"Bayesian baseline available"
  };
}


export function bayesianActionPolicy(signal, posterior, targetPct=0) {
  const action = signal?.action || "hold";
  const target = Number(targetPct || 0);
  const ability = posterior ? formatPercent(posterior.mean) : "N/A";
  const interval = posterior ? `${formatPercent(posterior.lower)}–${formatPercent(posterior.upper)}` : "N/A";

  if (action === "repeat") {
    return {
      action,
      title:"Repeat drill",
      instruction:"Repeat this drill before changing difficulty. The current evidence base is still too uncertain.",
      coaching:"Collect more attempts under the same setup so the estimate can tighten.",
      badge:"Repeat",
      detail:`Posterior ability ${ability}; credible interval ${interval}.`
    };
  }

  if (action === "progress") {
    return {
      action,
      title:"Increase difficulty",
      instruction:"Increase difficulty slightly: harder position, tighter constraint, fewer attempts, or higher target.",
      coaching:"Progress only one variable at a time so the next logs remain interpretable.",
      badge:"Progress",
      detail:`Posterior ability ${ability} is confidently above the ${target || "current"} target.`
    };
  }

  if (action === "stabilize" || action === "rebuild") {
    return {
      action:"rebuild",
      title:"Deload / rebuild",
      instruction:"Simplify the drill or deload the target until consistency recovers.",
      coaching:"Use easier positions or reduce constraints; rebuild mechanics before increasing pressure.",
      badge:"Rebuild",
      detail:`Posterior credible interval ${interval} is below target.`
    };
  }

  return {
    action:"hold",
    title:"Keep target",
    instruction:"Keep the current target and continue logging. The credible interval overlaps the target.",
    coaching:"Do not raise difficulty yet; collect more evidence at the same setup.",
    badge:"Hold",
    detail:`Posterior ability ${ability}; credible interval ${interval}.`
  };
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
