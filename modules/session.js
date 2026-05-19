export function makeTimerState(timerStartMs, elapsedBeforeStartMs) {
  return {
    timerStartMs: timerStartMs || null,
    elapsedBeforeStartMs: Number(elapsedBeforeStartMs || 0),
    isRunning: !!timerStartMs,
    savedAt: new Date().toISOString()
  };
}

const MAX_TIMER_ELAPSED_MS = 24 * 60 * 60 * 1000;

export function elapsedMsFromState(timerStartMs, elapsedBeforeStartMs, now = Date.now()) {
  const baseRaw = Number(elapsedBeforeStartMs || 0);
  const startRaw = Number(timerStartMs || 0);
  const nowRaw = Number(now || 0);
  const base = Number.isFinite(baseRaw) ? Math.max(0, baseRaw) : 0;
  const currentRun = startRaw && Number.isFinite(startRaw) && Number.isFinite(nowRaw)
    ? Math.max(0, nowRaw - startRaw)
    : 0;
  return Math.min(MAX_TIMER_ELAPSED_MS, Math.max(0, base + currentRun));
}

export function elapsedMinutesFromState(timerStartMs, elapsedBeforeStartMs) {
  return Math.round((elapsedMsFromState(timerStartMs, elapsedBeforeStartMs) / 60000) * 10) / 10;
}

export function formatElapsedClock(totalMs) {
  const totalSeconds = Math.max(0, Math.floor(Number(totalMs || 0) / 1000));
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

export function readActiveSessionDraft(key, logError = () => {}) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.routineIds) || Number(s.index || 0) >= s.routineIds.length) return null;
    return s;
  } catch(e) {
    logError(e, "readActiveSessionDraft");
    try { localStorage.removeItem(key); } catch(removeError) { logError(removeError, "readActiveSessionDraft cleanup"); }
    return null;
  }
}

export function writeActiveSessionDraft(key, session, safeStorageSet, logError = () => {}) {
  try {
    if (!session) return false;
    const payload = JSON.stringify({...session, savedAt:new Date().toISOString()});
    if (typeof safeStorageSet === "function") return !!safeStorageSet(key, payload, "writeActiveSessionDraft");
    localStorage.setItem(key, payload);
    return true;
  } catch(e) {
    logError(e, "writeActiveSessionDraft");
    return false;
  }
}

export function clearActiveSessionDraft(key, logError = () => {}) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch(e) {
    logError(e, "clearActiveSessionDraft");
    return false;
  }
}



