export function createPressureSession({
  routineId,
  mode="streak",
  lives=3,
  targetStreak=5,
  suddenDeath=false,
  finalReps=3,
  escalationStep=2
} = {}) {
  return {
    active:true,
    routineId:routineId || "",
    mode,
    startedAt:new Date().toISOString(),
    attempts:0,
    makes:0,
    misses:0,
    weightedAttempts:0,
    weightedMakes:0,
    streak:0,
    bestStreak:0,
    resets:0,
    livesStart:Number(lives || 3),
    livesRemaining:Number(lives || 3),
    targetStreak:Number(targetStreak || 5),
    suddenDeath:!!suddenDeath,
    finalReps:Number(finalReps || 3),
    escalationStep:Number(escalationStep || 2),
    recoveryMode:false,
    recoveryAttempts:0,
    recoverySuccesses:0,
    escalationLevel:0,
    pressureEvents:0,
    clutchAttempts:0,
    clutchMakes:0,
    collapseEvents:0,
    fatigueRisk:0,
    eventHistory:[],
    completed:false
  };
}

function cloneSession(session) {
  return {...session, eventHistory:[...(session?.eventHistory || [])]};
}

export function pressureLevelLabel(level) {
  const n = Number(level || 0);
  if (n >= 5) return "Extreme";
  if (n >= 3) return "High";
  if (n >= 1) return "Medium";
  return "Low";
}

function isClutchZone(s) {
  if (!s) return false;
  if (s.mode === "streak") return (Number(s.targetStreak || 0) - Number(s.streak || 0)) <= Number(s.finalReps || 3);
  if (s.mode === "lives") return Number(s.livesRemaining || 0) <= Math.max(1, Math.min(2, Number(s.finalReps || 3)));
  return !!s.recoveryMode || Number(s.escalationLevel || 0) >= 3;
}

function eventWeight(s) {
  return isClutchZone(s) ? 2 : 1;
}

function updateEscalation(s) {
  const step = Math.max(1, Number(s.escalationStep || 2));
  const streakPressure = Math.floor((s.bestStreak || 0) / step);
  const livesPressure = s.mode === "lives" ? s.livesStart - s.livesRemaining : 0;
  const recoveryPressure = s.mode === "recovery" ? Math.min(3, s.recoveryAttempts) : 0;
  s.escalationLevel = Math.min(5, Math.max(streakPressure, livesPressure, recoveryPressure));
  return s;
}

function updateFatigueRisk(s) {
  const recent = (s.eventHistory || []).slice(-8);
  if (recent.length < 5) {
    s.fatigueRisk = 0;
    return s;
  }
  const misses = recent.filter(e => e.type === "miss" || e.type === "recovery_fail").length;
  const collapses = Number(s.collapseEvents || 0);
  s.fatigueRisk = Math.max(0, Math.min(100, Math.round((misses / recent.length) * 70 + Math.min(30, collapses * 5))));
  return s;
}

export function recordPressureEvent(session, type) {
  if (!session?.active) return session;
  const s = cloneSession(session);
  const clutchBefore = isClutchZone(s);
  const weight = eventWeight(s);

  s.eventHistory.push({
    type,
    at:new Date().toISOString(),
    streak:s.streak,
    livesRemaining:s.livesRemaining,
    recoveryMode:!!s.recoveryMode,
    clutch:clutchBefore,
    weight
  });

  if (type === "make") {
    s.attempts += 1;
    s.makes += 1;
    s.weightedAttempts += weight;
    s.weightedMakes += weight;
    if (clutchBefore) {
      s.clutchAttempts += 1;
      s.clutchMakes += 1;
    }
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.recoveryMode = false;
  } else if (type === "miss") {
    s.attempts += 1;
    s.misses += 1;
    s.weightedAttempts += weight;
    if (clutchBefore) s.clutchAttempts += 1;
    if (s.streak > 0) s.resets += 1;
    if ((s.eventHistory || []).slice(-2, -1)[0]?.type === "miss") s.collapseEvents += 1;
    s.streak = 0;
    if (s.mode === "lives") s.livesRemaining = Math.max(0, s.livesRemaining - 1);
    if (s.suddenDeath && clutchBefore) s.livesRemaining = 0;
    if (s.mode === "recovery") s.recoveryMode = true;
  } else if (type === "recovery_ok") {
    s.recoveryAttempts += 1;
    s.recoverySuccesses += 1;
    s.recoveryMode = false;
    if (clutchBefore) {
      s.clutchAttempts += 1;
      s.clutchMakes += 1;
    }
  } else if (type === "recovery_fail") {
    s.recoveryAttempts += 1;
    s.recoveryMode = false;
    s.collapseEvents += 1;
    if (clutchBefore) s.clutchAttempts += 1;
  }

  if (s.mode === "streak" && s.bestStreak >= s.targetStreak) s.completed = true;
  if ((s.mode === "lives" || s.suddenDeath) && s.livesRemaining <= 0) s.completed = true;
  updateEscalation(s);
  updateFatigueRisk(s);
  return s;
}

export function undoPressureEvent(session) {
  const history = [...(session?.eventHistory || [])];
  if (!history.length) return session;
  const initial = createPressureSession({
    routineId:session.routineId,
    mode:session.mode,
    lives:session.livesStart,
    targetStreak:session.targetStreak,
    suddenDeath:session.suddenDeath,
    finalReps:session.finalReps,
    escalationStep:session.escalationStep
  });
  history.pop();
  return history.reduce((s, ev) => recordPressureEvent(s, ev.type), initial);
}

export function calculatePressureScore(session) {
  if (!session) return 0;
  const attempts = Math.max(1, Number(session.attempts || 0));
  const weightedAttempts = Math.max(1, Number(session.weightedAttempts || attempts));
  const weightedRate = Number(session.weightedMakes || session.makes || 0) / weightedAttempts;
  const recoveryRate = session.recoveryAttempts ? session.recoverySuccesses / session.recoveryAttempts : 0;
  const clutchRate = session.clutchAttempts ? session.clutchMakes / session.clutchAttempts : weightedRate;
  const survivalBonus = session.mode === "lives" ? Number(session.livesRemaining || 0) * 8 : 0;
  const raw =
    (Number(session.bestStreak || 0) * 7) +
    (weightedRate * 32) +
    (clutchRate * 20) +
    (recoveryRate * 18) +
    survivalBonus -
    (Number(session.collapseEvents || 0) * 10) -
    (Number(session.resets || 0) * 2) -
    (Number(session.fatigueRisk || 0) * 0.12);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function pressureSummary(session) {
  const attempts = Math.max(1, Number(session?.attempts || 0));
  const weightedAttempts = Math.max(1, Number(session?.weightedAttempts || attempts));
  const recoveryRate = session?.recoveryAttempts ? session.recoverySuccesses / session.recoveryAttempts : 0;
  const clutchRate = session?.clutchAttempts ? session.clutchMakes / session.clutchAttempts : 0;
  return {
    pressureScore:calculatePressureScore(session),
    successRate:Number(session?.makes || 0) / attempts,
    weightedSuccessRate:Number(session?.weightedMakes || session?.makes || 0) / weightedAttempts,
    recoveryRate,
    clutchRate,
    collapseRate:Number(session?.collapseEvents || 0) / attempts,
    pressureLevel:pressureLevelLabel(session?.escalationLevel || 0),
    fatigueRisk:Number(session?.fatigueRisk || 0)
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
