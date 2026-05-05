export function makeTimerState(timerStartMs, elapsedBeforeStartMs) {
  return {
    timerStartMs: timerStartMs || null,
    elapsedBeforeStartMs: Number(elapsedBeforeStartMs || 0),
    isRunning: !!timerStartMs,
    savedAt: new Date().toISOString()
  };
}

export function elapsedMsFromState(timerStartMs, elapsedBeforeStartMs, now = Date.now()) {
  return Number(elapsedBeforeStartMs || 0) + (timerStartMs ? now - Number(timerStartMs) : 0);
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
