function monotonicNow() {
  try {
    if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now();
  } catch(e) {}
  return Date.now();
}

export function makeTimerState(timerStartMs, elapsedBeforeStartMs) {
  const running = !!timerStartMs;
  const nowMono = monotonicNow();
  const elapsedCurrentRun = running ? Math.max(0, nowMono - Number(timerStartMs || 0)) : 0;
  const wallClockStartMs = running ? Math.max(0, Date.now() - elapsedCurrentRun) : null;
  return {
    timerStartMs: running ? Number(timerStartMs) : null,
    wallClockStartMs,
    elapsedBeforeStartMs: Number(elapsedBeforeStartMs || 0),
    isRunning: running,
    clockType: running ? "monotonic+wall" : "paused",
    savedAt: new Date().toISOString()
  };
}

const MAX_TIMER_ELAPSED_MS = 24 * 60 * 60 * 1000;

export function elapsedMsFromState(timerStartMs, elapsedBeforeStartMs, now = monotonicNow()) {
  const baseRaw = Number(elapsedBeforeStartMs || 0);
  const startRaw = Number(timerStartMs || 0);
  const nowRaw = Number(now || 0);
  const base = Number.isFinite(baseRaw) ? Math.max(0, baseRaw) : 0;
  const looksLikeWallClock = startRaw > 1000000000000;
  const comparableNow = looksLikeWallClock ? Date.now() : nowRaw;
  const currentRun = startRaw && Number.isFinite(startRaw) && Number.isFinite(comparableNow)
    ? Math.max(0, comparableNow - startRaw)
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



