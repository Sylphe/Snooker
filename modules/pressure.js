export function createPressureSession({routineId, mode="streak", lives=3, targetStreak=5} = {}) {
  return {
    active:true,
    routineId:routineId || "",
    mode,
    startedAt:new Date().toISOString(),
    attempts:0,
    makes:0,
    misses:0,
    streak:0,
    bestStreak:0,
    resets:0,
    livesStart:Number(lives || 3),
    livesRemaining:Number(lives || 3),
    targetStreak:Number(targetStreak || 5),
    recoveryMode:false,
    recoveryAttempts:0,
    recoverySuccesses:0,
    escalationLevel:0,
    pressureEvents:0,
    collapseEvents:0,
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

function updateEscalation(s) {
  s.escalationLevel = Math.min(5, Math.max(Math.floor((s.bestStreak || 0) / 2), s.livesStart - s.livesRemaining));
  return s;
}

export function recordPressureEvent(session, type) {
  if (!session?.active) return session;
  const s = cloneSession(session);
  s.eventHistory.push({
    type,
    at:new Date().toISOString(),
    streak:s.streak,
    livesRemaining:s.livesRemaining,
    recoveryMode:!!s.recoveryMode
  });

  if (type === "make") {
    s.attempts += 1;
    s.makes += 1;
    s.streak += 1;
    s.bestStreak = Math.max(s.bestStreak, s.streak);
    s.recoveryMode = false;
  } else if (type === "miss") {
    s.attempts += 1;
    s.misses += 1;
    if (s.streak > 0) s.resets += 1;
    if ((s.eventHistory || []).slice(-2, -1)[0]?.type === "miss") s.collapseEvents += 1;
    s.streak = 0;
    if (s.mode === "lives") s.livesRemaining = Math.max(0, s.livesRemaining - 1);
    if (s.mode === "recovery") s.recoveryMode = true;
  } else if (type === "recovery_ok") {
    s.recoveryAttempts += 1;
    s.recoverySuccesses += 1;
    s.recoveryMode = false;
  } else if (type === "recovery_fail") {
    s.recoveryAttempts += 1;
    s.recoveryMode = false;
    s.collapseEvents += 1;
  }

  if (s.mode === "streak" && s.bestStreak >= s.targetStreak) s.completed = true;
  if (s.mode === "lives" && s.livesRemaining <= 0) s.completed = true;
  updateEscalation(s);
  return s;
}

export function undoPressureEvent(session) {
  const history = [...(session?.eventHistory || [])];
  if (!history.length) return session;
  const initial = createPressureSession({
    routineId:session.routineId,
    mode:session.mode,
    lives:session.livesStart,
    targetStreak:session.targetStreak
  });
  history.pop();
  return history.reduce((s, ev) => recordPressureEvent(s, ev.type), initial);
}

export function calculatePressureScore(session) {
  if (!session) return 0;
  const attempts = Math.max(1, Number(session.attempts || 0));
  const recoveryRate = session.recoveryAttempts ? session.recoverySuccesses / session.recoveryAttempts : 0;
  const survivalBonus = session.mode === "lives" ? Number(session.livesRemaining || 0) * 8 : 0;
  const raw =
    (Number(session.bestStreak || 0) * 7) +
    (Number(session.makes || 0) / attempts * 35) +
    (recoveryRate * 25) +
    survivalBonus -
    (Number(session.collapseEvents || 0) * 10) -
    (Number(session.resets || 0) * 2);
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export function pressureSummary(session) {
  const attempts = Math.max(1, Number(session?.attempts || 0));
  const recoveryRate = session?.recoveryAttempts ? session.recoverySuccesses / session.recoveryAttempts : 0;
  return {
    pressureScore:calculatePressureScore(session),
    successRate:Number(session?.makes || 0) / attempts,
    recoveryRate,
    collapseRate:Number(session?.collapseEvents || 0) / attempts,
    pressureLevel:pressureLevelLabel(session?.escalationLevel || 0)
  };
}
