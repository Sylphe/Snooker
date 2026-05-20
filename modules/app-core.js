const STORAGE_KEY = "snookerPracticePWA.v3";
const OLD_KEYS = ["snookerPracticePWA.v1", "snookerPracticePWA.v2"];
const QUICK_RESUME_COLLAPSED_KEY = "snookerQuickResumeCollapsed";
const SMART_RECOMMENDATION_MODE_KEY = "snookerSmartRecommendationMode";
import { APP_VERSION, APP_BUILD_TIMESTAMP } from "./version.js?v=5.6.3";
import { smoothEvidence, shrinkageWeight, shrinkTowardPrior, thompsonRecommendationSample, kalmanCurrentFormEstimate, bayesianChangePointEstimate } from "./inference.js?v=5.6.3";
import {
  uuid,
  structuredCloneSafe,
  cssEscapeSafe,
  escapeHtml,
  escapeAttr,
  htmlText,
  attrText,
  jsArg,
  numText,
  numAttr,
  safeClassToken,
  sortedBy,
  safeMax,
  safeMin
} from "./utils.js?v=5.6.3";
import {
  THEME_MODE_KEY,
  SESSION_FOCUS_MODE_KEY,
  QUICK_LOG_AUTO_ADVANCE_KEY,
  DISPLAY_DENSITY_KEY,
  TIMER_AUTOSTART_KEY,
  TIMER_AUTOSTART_DELAY_KEY,
  WAKE_LOCK_KEY,
  normalizeInterfaceThemeMode,
  normalizeOnOff,
  normalizeDisplayDensity,
  normalizeTimerAutostart,
  normalizeTimerAutostartDelay,
  normalizeWakeLock,
  getRawStoredThemeMode,
  resolveThemeMode,
  applyThemeToDocument
} from "./settings.js?v=5.6.3";
import {
  avg,
  stdDev,
  correlation,
  corrText,
  rollingAverage,
  movingTrend,
  benchmarkText,
  progressVelocity,
  performanceDrift,
  plateauDetector,
  overtrainingSignal,
  fatigueSlope
  ,
  detectPlateauState,
  plateauActionRecommendation
  ,
  computeRoutineAllocationBalance,
  recommendedAllocationFocus,
  computePredictorContributions,
  predictorRecommendationLabel
} from "./analytics.js?v=5.6.3";
import {
  betaPosterior,
  aggregateSuccessRateLogs,
  bayesianReliabilityLabel,
  formatPercent,
  bayesianAdvice,
  bayesianRecommendationSignal,
  bayesianActionPolicy
} from "./bayesian.js?v=5.6.3";
import {
  makeTimerState,
  elapsedMsFromState,
  elapsedMinutesFromState,
  formatElapsedClock,
  readActiveSessionDraft,
  writeActiveSessionDraft,
  clearActiveSessionDraft
} from "./session.js?v=5.6.3";
import {
  createPressureSession,
  recordPressureEvent,
  undoPressureEvent,
  calculatePressureScore,
  pressureSummary,
  pressureLevelLabel
} from "./pressure.js?v=5.6.3";
import {
  recommendationMode,
  isRecommendationEligible,
  recommendationRecencyCap,
  recommendationUndertrainingMultiplier,
  recommendationModeLabel,
  cappedRecencyDays,
  applyRecommendationCap,
  adaptiveActionForState,
  scoreAdaptivePriority,
  scoreMixedStrategyRoutine
} from "./recommendations.js?v=5.6.3";
import {
  INDEXEDDB_LOG_STORE,
  INDEXEDDB_SESSION_STORE,
  INDEXEDDB_MIGRATION_KEY,
  openSnookerDB,
  idbGetAll,
  idbGetStores,
  idbDeleteDatabase,
  idbReplaceAll,
  idbReplaceStores,
  idbPut,
  idbPutBundle,
  idbDelete
} from "./store.js?v=5.6.3";



const ACTIVE_SESSION_KEY = "snookerPracticePWA.activeSessionDraft";
const LAST_VENUE_KEY = "snookerPracticePWA.lastVenueTable";
const LAST_TABLE_NOTE_KEY = "snookerPracticePWA.lastTableNote";


let indexedDBReady = false;
let indexedDBUnavailable = false;
let indexedDBSyncTimer = null;
let indexedDBHydrating = true;
let pendingPreHydrationLogs = [];
let pendingPreHydrationSessions = [];
let pendingPostHydrationSaveOptions = null;
let pendingFailedIndexedDBLogs = [];
let pendingFailedIndexedDBSessions = [];
let indexedDBRetryNoticeShown = false;
let externalStorageSyncInProgress = false;
let pendingExternalStorageSyncAfterSession = false;
let storageReadOnlyMode = false;
let storageReadOnlyNoticeShown = false;
let proactiveStorageNoticeShown = false;
const LOCALSTORAGE_WARN_BYTES = 3.5 * 1024 * 1024;
const LOCALSTORAGE_HARD_STOP_BYTES = 4.5 * 1024 * 1024;
const MAX_TIMER_ELAPSED_MS = 24 * 60 * 60 * 1000;
const MAX_SINGLE_DRILL_MINUTES = 240;

function isQuotaError(error) {
  return !!(error && (error.name === "QuotaExceededError" || String(error.message || "").toLowerCase().includes("quota")));
}
function enterStorageReadOnlyMode(context="storage") {
  storageReadOnlyMode = true;
  indexedDBUnavailable = true;
  indexedDBHydrating = false;
  if (!storageReadOnlyNoticeShown) {
    storageReadOnlyNoticeShown = true;
    notifyUser("Storage is full or unavailable. App is in read-only/export mode until space is freed or a backup is exported.", "warn");
  }
  try { logAppError(new Error("Storage read-only/export mode enabled"), context); } catch(_) {}
}


function buildCoreDataSnapshot(d, includeHighVolumeCollections=false) {
  const source = d || {};
  const core = {};
  Object.keys(source).forEach(key => {
    if (!includeHighVolumeCollections && (key === "logs" || key === "sessions")) return;
    core[key] = source[key];
  });
  core.appVersion = APP_VERSION;
  core.appBuildTimestamp = APP_BUILD_TIMESTAMP;
  if (!includeHighVolumeCollections) {
    core.logs = [];
    core.sessions = [];
  }
  return core;
}

function serializeCoreData(d) {
  const includeHighVolumeCollections = indexedDBUnavailable || !indexedDBReady;
  const core = buildCoreDataSnapshot(d, includeHighVolumeCollections);
  if (includeHighVolumeCollections) {
    const fullSize = estimateSerializedBytes(JSON.stringify(core));
    if (indexedDBUnavailable && fullSize >= LOCALSTORAGE_HARD_STOP_BYTES) {
      core.logs = [];
      core.sessions = [];
      core.indexedDBFallbackBuffer = {
        memoryOnly:true,
        omittedLogCount:Array.isArray(d?.logs) ? d.logs.length : 0,
        omittedSessionCount:Array.isArray(d?.sessions) ? d.sessions.length : 0,
        reason:"IndexedDB unavailable and full fallback would exceed safe localStorage quota. Keep the tab open and export a backup before adding more data."
      };
    }
    core.indexedDBStorage = {
      enabled: false,
      stores: [],
      migratedAt: localStorage.getItem(INDEXEDDB_MIGRATION_KEY) || "",
      note: indexedDBUnavailable
        ? "IndexedDB is unavailable; high-volume logs/sessions are kept in memory if localStorage fallback is unsafe."
        : "IndexedDB is still hydrating; full data is preserved in localStorage until IndexedDB is confirmed ready."
    };
    return core;
  }
  core.indexedDBStorage = {
    enabled: true,
    stores: [INDEXEDDB_LOG_STORE, INDEXEDDB_SESSION_STORE],
    migratedAt: localStorage.getItem(INDEXEDDB_MIGRATION_KEY) || "",
    note: "Logs and sessions are stored in IndexedDB; this localStorage object keeps low-volume app configuration only."
  };
  return core;
}

function estimateSerializedBytes(value) {
  try { return new Blob([String(value ?? "")]).size; }
  catch(e) { return String(value ?? "").length; }
}
function warnIfCoreStorageLarge(serialized, context="saveCoreData") {
  const bytes = estimateSerializedBytes(serialized);
  if (bytes >= LOCALSTORAGE_WARN_BYTES && !proactiveStorageNoticeShown) {
    proactiveStorageNoticeShown = true;
    notifyUser(`Storage warning: local core data is ${formatStorageBytes(bytes)}. Export a backup soon.`, "warn");
  }
  if (indexedDBUnavailable && bytes >= LOCALSTORAGE_HARD_STOP_BYTES) {
    notifyUser(`Storage limit risk: local fallback data is ${formatStorageBytes(bytes)}. Export backup or free space before saving more.`, "warn");
    enterStorageReadOnlyMode(`${context} proactive localStorage hard stop`);
    return false;
  }
  return true;
}
function saveCoreData(context="saveCoreData", force=false) {
  if (storageReadOnlyMode && !force) return false;
  try {
    const serialized = JSON.stringify(serializeCoreData(data));
    if (!force && !warnIfCoreStorageLarge(serialized, context)) return false;
    const ok = safeStorageSet(STORAGE_KEY, serialized, context, force);
    if (!ok && indexedDBUnavailable) enterStorageReadOnlyMode(`${context} localStorage fallback failed`);
    return ok;
  } catch(e) {
    logAppError(e, context);
    if (isQuotaError(e) && indexedDBUnavailable) enterStorageReadOnlyMode(context);
    return false;
  }
}

function queuePreHydrationState(options = {}) {
  pendingPreHydrationLogs = mergeById(data.logs || [], pendingPreHydrationLogs);
  pendingPreHydrationSessions = mergeById(data.sessions || [], pendingPreHydrationSessions);
  pendingPostHydrationSaveOptions = {...(pendingPostHydrationSaveOptions || {}), ...(options || {})};
}

function flushPostHydrationSaveQueue() {
  if (!pendingPostHydrationSaveOptions && !pendingPreHydrationLogs.length && !pendingPreHydrationSessions.length) return;
  const opts = pendingPostHydrationSaveOptions || {render:"none", immediateIDB:true};
  pendingPostHydrationSaveOptions = null;
  pendingPreHydrationLogs = [];
  pendingPreHydrationSessions = [];
  saveData({...opts, immediateIDB:true});
}

function notifyUser(message, tone="info") {
  if (typeof showTransientNotice === "function") showTransientNotice(message, tone);
  else console.warn(message);
}
function validationNotice(message) { notifyUser(message, "warn"); return false; }

const operationRateLimits = Object.create(null);
function allowRateLimitedOperation(key, maxOps=20, windowMs=60000, message="Too many rapid actions. Wait a moment and try again.") {
  const now = Date.now();
  const bucket = (operationRateLimits[key] || []).filter(ts => now - ts < windowMs);
  if (bucket.length >= maxOps) {
    notifyUser(message, "warn");
    operationRateLimits[key] = bucket;
    return false;
  }
  bucket.push(now);
  operationRateLimits[key] = bucket;
  return true;
}

const HEAVY_ANALYTICS_LOG_LIMIT = 500;
const HISTORY_RENDER_ROW_LIMIT = 150;
const HISTORY_RENDER_ROW_INCREMENT = 150;
let historyRenderRowLimit = HISTORY_RENDER_ROW_LIMIT;
let logsByRoutineCacheSignature = "";
let logsByRoutineCache = null;
const analyticsMemoCache = new Map();
const rankRoutineMemoCache = new Map();
const routineStatsMemoCache = new Map();
let undertrainedAllocationCacheKey = "";
let undertrainedAllocationCache = null;
let routineStatsWarmSignature = "";
let performanceCacheWarmInProgress = false;
function clearPerformanceMemoCaches() {
  analyticsMemoCache.clear();
  rankRoutineMemoCache.clear();
  routineStatsMemoCache.clear();
  undertrainedAllocationCacheKey = "";
  undertrainedAllocationCache = null;
  routineStatsWarmSignature = "";
}
function memoKeyForLogs(label, logs, extra = "") {
  return `${label}|${extra}|${logsSignature(logs || [])}`;
}
function memoizedAnalytics(label, logs, extra, compute) {
  const windowed = analyticsWindow(logs || []);
  const key = memoKeyForLogs(label, windowed, extra);
  if (analyticsMemoCache.has(key)) return analyticsMemoCache.get(key);
  const value = compute(windowed);
  if (analyticsMemoCache.size > 80) analyticsMemoCache.clear();
  analyticsMemoCache.set(key, value);
  return value;
}
function cachedFatigueSlope(logs) {
  return memoizedAnalytics("fatigueSlope", logs, "", sample => fatigueSlope(sample));
}
function analyticsWindow(logs, limit = HEAVY_ANALYTICS_LOG_LIMIT) {
  const arr = Array.isArray(logs) ? logs.filter(Boolean) : [];
  return arr.length > limit ? arr.slice(-limit) : arr;
}
function logsSignature(logs) {
  const arr = Array.isArray(logs) ? logs : [];
  return `${arr.length}|${data?.updatedAt || ""}|${arr[0]?.id || ""}|${arr[arr.length - 1]?.id || ""}`;
}
function getLogsByRoutineMap(logs = data.logs || []) {
  const arr = Array.isArray(logs) ? logs : [];
  const sig = logsSignature(arr);
  if (logsByRoutineCache && logsByRoutineCacheSignature === sig) return logsByRoutineCache;
  const grouped = Object.create(null);
  arr.forEach(log => {
    const rid = String(log?.routineId || "");
    if (!rid) return;
    if (!grouped[rid]) grouped[rid] = [];
    grouped[rid].push(log);
  });
  // Parent log arrays are maintained chronologically; grouping in iteration order preserves sequence without per-routine resorting.
  logsByRoutineCacheSignature = sig;
  logsByRoutineCache = grouped;
  return grouped;
}
function invalidateLogsByRoutineCache() {
  logsByRoutineCacheSignature = "";
  logsByRoutineCache = null;
  clearPerformanceMemoCaches();
}
function debounce(fn, delay = 150) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
const debouncedRenderAll = debounce(() => renderAll(), 150);
const debouncedRenderStats = debounce(() => renderStats(), 150);
const debouncedRenderRoutineList = debounce(() => renderRoutineList(), 120);

function sanitizeTagToken(value, maxLen=32) {
  return String(value || "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .trim()
    .slice(0, maxLen);
}
function roundStoredMinutes(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}
function validRoutineIds(ids) {
  const active = new Set(activeRoutines().map(r => r.id));
  return (ids || []).filter(id => active.has(id));
}
function localDateFromKey(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}
function queueFailedLogDelta(log) {
  if (!log || !log.id) return;
  pendingFailedIndexedDBLogs = mergeById([log], pendingFailedIndexedDBLogs);
  if (!indexedDBRetryNoticeShown) {
    indexedDBRetryNoticeShown = true;
    notifyUser("Save warning: local copy kept; IndexedDB sync will retry. Export backup if this repeats.", "warn");
  }
}
function queueFailedSessionDelta(session) {
  if (!session || !session.id) return;
  pendingFailedIndexedDBSessions = mergeById([session], pendingFailedIndexedDBSessions);
  if (!indexedDBRetryNoticeShown) {
    indexedDBRetryNoticeShown = true;
    notifyUser("Save warning: session kept locally; IndexedDB sync will retry. Export backup if this repeats.", "warn");
  }
}
function purgePendingIndexedDBDelta(type, id) {
  if (!id) return;
  if (type === "log") {
    pendingFailedIndexedDBLogs = pendingFailedIndexedDBLogs.filter(l => l?.id !== id);
    pendingPreHydrationLogs = pendingPreHydrationLogs.filter(l => l?.id !== id);
  } else if (type === "session") {
    pendingFailedIndexedDBSessions = pendingFailedIndexedDBSessions.filter(s => s?.id !== id);
    pendingPreHydrationSessions = pendingPreHydrationSessions.filter(s => s?.id !== id);
  }
}
async function flushFailedIndexedDBDeltas(context="flushFailedIndexedDBDeltas") {
  if (indexedDBUnavailable || !indexedDBReady) return false;
  const logs = pendingFailedIndexedDBLogs.slice();
  const sessions = pendingFailedIndexedDBSessions.slice();
  if (!logs.length && !sessions.length) return true;
  try {
    for (const log of logs) await idbPut(INDEXEDDB_LOG_STORE, log);
    for (const session of sessions) await idbPut(INDEXEDDB_SESSION_STORE, session);
    pendingFailedIndexedDBLogs = [];
    pendingFailedIndexedDBSessions = [];
    indexedDBRetryNoticeShown = false;
    notifyUser("Pending data sync completed.", "ok");
    return true;
  } catch(e) {
    logAppError(e, context);
    return false;
  }
}
function persistLogDelta(log, context="persistLogDelta") {
  if (indexedDBUnavailable || !log || !log.id) return Promise.resolve(false);
  if (!indexedDBReady) {
    pendingPreHydrationLogs = mergeById([log], pendingPreHydrationLogs);
    return Promise.resolve(true);
  }
  return idbPut(INDEXEDDB_LOG_STORE, log)
    .then(() => { flushFailedIndexedDBDeltas("persistLogDelta retry"); return true; })
    .catch(e => { logAppError(e, context); queueFailedLogDelta(log); return false; });
}
function persistSessionDelta(session, context="persistSessionDelta") {
  if (indexedDBUnavailable || !session || !session.id) return Promise.resolve(false);
  if (!indexedDBReady) {
    pendingPreHydrationSessions = mergeById([session], pendingPreHydrationSessions);
    return Promise.resolve(true);
  }
  return idbPut(INDEXEDDB_SESSION_STORE, session)
    .then(() => { flushFailedIndexedDBDeltas("persistSessionDelta retry"); return true; })
    .catch(e => { logAppError(e, context); queueFailedSessionDelta(session); return false; });
}
function persistLogSessionBundle(logs = [], sessions = [], context="persistLogSessionBundle") {
  const logRows = (Array.isArray(logs) ? logs : [logs]).filter(row => row && row.id);
  const sessionRows = (Array.isArray(sessions) ? sessions : [sessions]).filter(row => row && row.id);
  if (indexedDBUnavailable || (!logRows.length && !sessionRows.length)) return Promise.resolve(false);
  if (!indexedDBReady) {
    if (logRows.length) pendingPreHydrationLogs = mergeById(logRows, pendingPreHydrationLogs);
    if (sessionRows.length) pendingPreHydrationSessions = mergeById(sessionRows, pendingPreHydrationSessions);
    return Promise.resolve(true);
  }
  return idbPutBundle(logRows, sessionRows)
    .then(() => { flushFailedIndexedDBDeltas("persistLogSessionBundle retry"); return true; })
    .catch(e => {
      logAppError(e, context);
      logRows.forEach(queueFailedLogDelta);
      sessionRows.forEach(queueFailedSessionDelta);
      return false;
    });
}
function deleteLogDelta(id, context="deleteLogDelta") {
  if (indexedDBUnavailable || !id) return Promise.resolve(false);
  return idbDelete(INDEXEDDB_LOG_STORE, id).catch(e => { logAppError(e, context); return false; });
}
async function persistIndexedDBCollections(context="persistIndexedDBCollections") {
  if (indexedDBUnavailable) return false;
  try {
    if (typeof idbReplaceStores === "function") await idbReplaceStores(data.logs || [], data.sessions || []);
    else {
      await idbReplaceAll(INDEXEDDB_LOG_STORE, data.logs || []);
      await idbReplaceAll(INDEXEDDB_SESSION_STORE, data.sessions || []);
    }
    indexedDBReady = true;
    indexedDBHydrating = false;
    pendingFailedIndexedDBLogs = [];
    pendingFailedIndexedDBSessions = [];
    indexedDBRetryNoticeShown = false;
    return true;
  } catch(e) {
    indexedDBHydrating = false;
    indexedDBUnavailable = true;
    logAppError(e, context);
    if (isQuotaError(e)) enterStorageReadOnlyMode(`${context} IndexedDB quota failure`);
    return false;
  }
}
function scheduleIndexedDBSync(context="scheduleIndexedDBSync", immediate=false) {
  if (storageReadOnlyMode || indexedDBUnavailable) return;
  clearTimeout(indexedDBSyncTimer);
  indexedDBSyncTimer = null;
  if (immediate) {
    persistIndexedDBCollections(context);
    return;
  }
  indexedDBSyncTimer = setTimeout(() => {
    indexedDBSyncTimer = null;
    persistIndexedDBCollections(context);
  }, 80);
}
function flushPendingIndexedDBSync(context="flushPendingIndexedDBSync") {
  if (storageReadOnlyMode || indexedDBUnavailable) return;
  if (indexedDBSyncTimer) {
    clearTimeout(indexedDBSyncTimer);
    indexedDBSyncTimer = null;
    persistIndexedDBCollections(context);
  }
}
function mergeById(primary, fallback) {
  const map = new Map();
  (fallback || []).forEach(x => { if (x && x.id) map.set(x.id, x); });
  (primary || []).forEach(x => { if (x && x.id) map.set(x.id, x); });
  return [...map.values()];
}
async function hydrateIndexedDBData(retryAfterReset=false, options={}) {
  const readOnlySync = !!options.readOnlySync || externalStorageSyncInProgress;
  if (storageReadOnlyMode || indexedDBUnavailable) return false;
  try {
    const localLogs = Array.isArray(data.logs) ? data.logs : [];
    const localSessions = Array.isArray(data.sessions) ? data.sessions : [];
    // Open IndexedDB once during startup and read both stores in a single transaction.
    // This avoids parallel open/upgrade races on Android Chrome/PWA installs.
    const idbStores = await idbGetStores([INDEXEDDB_LOG_STORE, INDEXEDDB_SESSION_STORE]);
    const idbLogs = idbStores[INDEXEDDB_LOG_STORE] || [];
    const idbSessions = idbStores[INDEXEDDB_SESSION_STORE] || [];
    const logs = mergeById(pendingPreHydrationLogs, mergeById(idbLogs, localLogs)).sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
    const sessions = mergeById(pendingPreHydrationSessions, mergeById(idbSessions, localSessions)).sort((a,b)=>new Date(a.startedAt||a.endedAt||0)-new Date(b.startedAt||b.endedAt||0));
    data.logs = logs;
    data.sessions = sessions;
    if (logs.length > 15000) {
      console.warn("Large snooker dataset detected. Consider exporting and archiving older sessions to keep mobile hydration responsive.");
    }
    indexedDBReady = true;
    indexedDBHydrating = false;
    if (!readOnlySync && (localLogs.length || localSessions.length || logs.length !== idbLogs.length || sessions.length !== idbSessions.length)) {
      await persistIndexedDBCollections("hydrateIndexedDBData migration write");
      try { localStorage.setItem(INDEXEDDB_MIGRATION_KEY, new Date().toISOString()); } catch(e) { if (isQuotaError(e)) enterStorageReadOnlyMode("hydrateIndexedDBData migration marker"); else logAppError(e, "hydrateIndexedDBData migration marker"); }
    }
    if (!readOnlySync) {
      saveCoreData("hydrateIndexedDBData core save");
      flushPostHydrationSaveQueue();
    }
    return true;
  } catch(e) {
    logAppError(e, retryAfterReset ? "hydrateIndexedDBData retry failed" : "hydrateIndexedDBData");
    if (!retryAfterReset) {
      try {
        await idbDeleteDatabase();
        indexedDBReady = false;
        indexedDBHydrating = true;
        indexedDBUnavailable = false;
        return await hydrateIndexedDBData(true, options);
      } catch(resetError) {
        logAppError(resetError, "hydrateIndexedDBData reset database");
      }
    }
    indexedDBUnavailable = true;
    indexedDBHydrating = false;
    notifyUser("IndexedDB could not initialize. Continuing in memory/export mode; export a backup before adding more logs.", "warn");
    saveCoreData("hydrateIndexedDBData memory-safe fallback core save");
    throw e;
  }
}
async function bootstrapIndexedDBStorage() {
  let hydrated = false;
  try {
    hydrated = await hydrateIndexedDBData();
  } catch (error) {
    indexedDBUnavailable = true;
    indexedDBHydrating = false;
    try { logAppError(error, "bootstrapIndexedDBStorage hydrate"); } catch (_) { console.error(error); }
  }
  if (!hydrated && indexedDBUnavailable) {
    warmRoutineStatsCache("bootstrap fallback warm routine stats");
    await safeRenderAll("bootstrap renderAll fallback");
    return;
  }
  let bootstrapMutated = false;
  safeCall("bootstrap ensureTablesDatabase", () => { bootstrapMutated = !!ensureTablesDatabase?.({repairLegacy:true}) || bootstrapMutated; });
  safeCall("bootstrap refreshReferenceNames", () => { bootstrapMutated = !!refreshReferenceNames?.() || bootstrapMutated; });
  if (bootstrapMutated) {
    scheduleIndexedDBSync("bootstrap memory migration sync", true);
    saveCoreData("bootstrap memory migration core save");
  }
  warmRoutineStatsCache("bootstrap warm routine stats");
  safeRenderAll("bootstrap renderAll");
}



function applyThemeModeEarly() {
  applyThemeToDocument(getRawStoredThemeMode(STORAGE_KEY));
}
applyThemeModeEarly();



const SKILL_TAXONOMY_VERSION = "v4.26";
const DEFAULT_SKILLS = [
  {id:"cueing", label:"Cueing", group:"Technical", aliases:["cue action","cue delivery","technique"]},
  {id:"long_potting", label:"Long potting", group:"Technical", aliases:["long pot","long pots","distance potting"]},
  {id:"cue_ball_control", label:"Cue-ball control", group:"Technical", aliases:["cue ball","cueball","white control","cueball control"]},
  {id:"cue_ball_speed", label:"Cue-ball speed", group:"Technical", aliases:["cue ball speed","cueball speed","cue-ball speed","speed control","pace of white"]},
  {id:"pace_control", label:"Pace control", group:"Technical", aliases:["speed","weight","touch","pace"]},
  {id:"stun_screw_side", label:"Stun / screw / side", group:"Technical", aliases:["stun","screw","side","spin"]},
  {id:"rail_shots", label:"Rail / cushion shots", group:"Technical", aliases:["cushion shots","rail shot","cushion"]},
  {id:"rest_play", label:"Rest play", group:"Technical", aliases:["rest","mechanical bridge"]},
  {id:"bridging", label:"Bridging", group:"Technical", aliases:["bridge","awkward bridge"]},
  {id:"break_building", label:"Break-building", group:"Break-building", aliases:["break building","breaks","clearance"]},
  {id:"transition_play", label:"Transition play", group:"Break-building", aliases:["transition","blue to black","blue-to-black"]},
  {id:"positional_play", label:"Positional play", group:"Break-building", aliases:["position","positional","position play"]},
  {id:"recovery", label:"Recovery", group:"Break-building", aliases:["recovery shots","out of position","short-side recovery"]},
  {id:"cluster_management", label:"Cluster management", group:"Break-building", aliases:["cluster","pack","cannon"]},
  {id:"safety", label:"Safety", group:"Safety / tactical", aliases:["safe","snooker","containing safety"]},
  {id:"tactical_decision_making", label:"Tactical decision-making", group:"Safety / tactical", aliases:["tactics","shot selection","decision making"]},
  {id:"escape_shots", label:"Escape shots", group:"Safety / tactical", aliases:["escape","escapes","snooker escape"]},
  {id:"pressure_resilience", label:"Pressure resilience", group:"Mental", aliases:["pressure","match pressure","pressure mode"]},
  {id:"focus_consistency", label:"Focus consistency", group:"Mental", aliases:["focus","concentration","attention"]},
  {id:"confidence_stability", label:"Confidence stability", group:"Mental", aliases:["confidence","belief","confidence control"]},
  {id:"stamina", label:"Stamina", group:"Physical", aliases:["endurance","fatigue resistance","fatigue"]}
];
let activeSkillTaxonomyForNormalization = null;
let skillLibraryCacheSource = null;
let skillLibraryCacheAll = null;
let skillLibraryCacheActive = null;
let skillAliasMapCacheSource = null;
let skillAliasMapCache = null;
function invalidateSkillLibraryCache(){
  skillLibraryCacheSource = null;
  skillLibraryCacheAll = null;
  skillLibraryCacheActive = null;
  skillAliasMapCacheSource = null;
  skillAliasMapCache = null;
}
function ensureSkillTaxonomyReady(){
  if(!data || typeof data !== "object") return;
  const tax = data.skillTaxonomy;
  if(!tax || !Array.isArray(tax.skills) || tax.version !== SKILL_TAXONOMY_VERSION){
    data.skillTaxonomy = normalizeSkillTaxonomy(tax || defaultSkillTaxonomy());
    activeSkillTaxonomyForNormalization = data.skillTaxonomy; invalidateSkillLibraryCache();
    return;
  }
  if(activeSkillTaxonomyForNormalization !== tax){
    activeSkillTaxonomyForNormalization = tax;
    invalidateSkillLibraryCache();
  }
}
function activeTemplatesPanelName(){
  const active = document.querySelector('[data-templates-panel].active:not(.hidden)');
  return active?.dataset?.templatesPanel || null;
}
function canonicalSkillKey(value){
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
  return cleaned || "custom_skill";
}
function skillIdFromLabel(label){ return canonicalSkillKey(label || "custom_skill"); }
function normalizeSkillRecord(skill){
  const id = skillIdFromLabel(skill?.id || skill?.label || "custom_skill");
  return {
    id,
    label: String(skill?.label || id.replaceAll("_"," ")).trim() || id,
    group: String(skill?.group || "Custom").trim() || "Custom",
    aliases: [...new Set((Array.isArray(skill?.aliases) ? skill.aliases : String(skill?.aliases || "").split(/[;,]/)).map(x => String(x || "").trim()).filter(Boolean))],
    active: skill?.active === false ? false : true,
    transferTargets: normalizeRawSkillIdList(skill?.transferTargets || [])
  };
}
function mergeSkillLibraries(customSkills){
  const map = new Map();
  DEFAULT_SKILLS.forEach(s => map.set(s.id, normalizeSkillRecord({...s, active:true})));
  (Array.isArray(customSkills) ? customSkills : []).forEach(s => {
    const rec = normalizeSkillRecord(s);
    const prior = map.get(rec.id);
    map.set(rec.id, prior ? {...prior, ...rec, aliases:[...new Set([...(prior.aliases||[]), ...(rec.aliases||[])])]} : rec);
  });
  return [...map.values()].sort((a,b)=>String(a.group).localeCompare(String(b.group)) || String(a.label).localeCompare(String(b.label)));
}
function normalizeSkillTaxonomy(taxonomy){
  return {version: SKILL_TAXONOMY_VERSION, skills: mergeSkillLibraries(taxonomy?.skills || DEFAULT_SKILLS)};
}
function defaultSkillTaxonomy(){ return normalizeSkillTaxonomy({skills:DEFAULT_SKILLS}); }
function currentSkillLibrary(options={}){
  const source = activeSkillTaxonomyForNormalization?.skills || DEFAULT_SKILLS;
  if(skillLibraryCacheSource !== source || !skillLibraryCacheAll){
    skillLibraryCacheSource = source;
    skillLibraryCacheAll = (Array.isArray(source) ? source : DEFAULT_SKILLS).slice().sort((a,b)=>String(a.group).localeCompare(String(b.group)) || String(a.label).localeCompare(String(b.label)));
    skillLibraryCacheActive = skillLibraryCacheAll.filter(s => s.active !== false);
  }
  return options.includeArchived === false ? skillLibraryCacheActive : skillLibraryCacheAll;
}
function skillAliasMap(){
  const source = activeSkillTaxonomyForNormalization?.skills || DEFAULT_SKILLS;
  if (skillAliasMapCacheSource === source && skillAliasMapCache) return skillAliasMapCache;
  const map = Object.create(null);
  currentSkillLibrary({includeArchived:true}).forEach(skill => {
    [skill.id, skill.label, ...(skill.aliases || [])].forEach(value => {
      const key = canonicalSkillKey(value);
      if (key) map[key] = skill.id;
    });
  });
  skillAliasMapCacheSource = source;
  skillAliasMapCache = map;
  return map;
}
function normalizeRawSkillIdList(value){
  const arr = Array.isArray(value) ? value : String(value||"").split(/[;,]/);
  return [...new Set(arr.map(x => canonicalSkillKey(x)).filter(Boolean))];
}
function skillLabel(id){ return (currentSkillLibrary({includeArchived:true}).find(s=>s.id===id)?.label) || String(id||"").replaceAll("_"," "); }
function normalizeSkillId(value){
  const raw = canonicalSkillKey(value);
  return skillAliasMap()[raw] || raw || "uncategorized";
}
function normalizeSkillList(value){
  const arr = Array.isArray(value) ? value : String(value||"").split(/[;,]/);
  const valid = new Set(currentSkillLibrary({includeArchived:true}).map(s=>s.id));
  return [...new Set(arr.map(normalizeSkillId).filter(x => x && valid.has(x)))];
}
function setSkillHiddenValue(id, values){ const el=$(id); if(el) el.value = normalizeSkillList(values).join(", "); }
function getSkillHiddenValue(id){ return normalizeSkillList($(id)?.value || ""); }
function renderPrimarySkillOptions(selectedValue=""){
  const select = $("routinePrimarySkill");
  if(!select) return;
  const selected = normalizeSkillId(selectedValue || select.value || "cueing");
  const groups = Object.create(null);
  currentSkillLibrary({includeArchived:false}).forEach(skill => { (groups[skill.group] = groups[skill.group] || []).push(skill); });
  select.innerHTML = Object.entries(groups).map(([group, skills]) => `<optgroup label="${attrText(group)}">${skills.map(skill => `<option value="${attrText(skill.id)}">${htmlText(skill.label)}</option>`).join("")}</optgroup>`).join("");
  select.value = currentSkillLibrary({includeArchived:true}).some(s=>s.id===selected) ? selected : "cueing";
}
function renderSkillChipGroup(containerId, hiddenInputId, selectedValues){
  const box = $(containerId);
  if(!box) return;
  const selected = new Set(normalizeSkillList(selectedValues));
  setSkillHiddenValue(hiddenInputId, [...selected]);
  const groups = Object.create(null);
  currentSkillLibrary({includeArchived:false}).forEach(skill => { (groups[skill.group] = groups[skill.group] || []).push(skill); });
  box.innerHTML = Object.entries(groups).map(([group, skills]) => `
    <div class="skill-chip-section">
      <div class="skill-chip-heading">${htmlText(group)}</div>
      <div class="skill-chip-row">${skills.map(skill => {
        const active = selected.has(skill.id);
        return `<button type="button" class="skill-select-chip ${active ? "active" : ""}" aria-pressed="${active ? "true" : "false"}" data-action="toggle-skill-chip" data-target="${attrText(hiddenInputId)}" data-container="${attrText(containerId)}" data-skill-id="${attrText(skill.id)}">${htmlText(skill.label)}</button>`;
      }).join("")}</div>
    </div>`).join("");
}
function renderRoutineSkillChips(skillMap){
  renderSkillChipGroup("routineSecondarySkillChips", "routineSecondarySkills", skillMap?.secondarySkills || []);
  renderSkillChipGroup("routineTransferSkillChips", "routineTransferTags", skillMap?.transferTags || []);
}
function toggleSkillChip(targetId, containerId, skillId){
  const current = new Set(getSkillHiddenValue(targetId));
  const clean = normalizeSkillId(skillId);
  if(current.has(clean)) current.delete(clean); else current.add(clean);
  renderSkillChipGroup(containerId, targetId, [...current]);
  hapticFeedback("tap");
}
function inferRoutineSkillMap(routine){
  const text = `${routine?.name||""} ${routine?.category||""} ${routine?.folder||""} ${routine?.subfolder||""} ${routine?.description||""}`.toLowerCase();
  const add=[];
  const has=(...xs)=>xs.some(x=>text.includes(x));
  let primary = "cueing";
  if(has("safety","snooker","contain","escape")) primary="safety";
  else if(has("line-up","lineup","break","clearance","red colour","red-colour")) primary="break_building";
  else if(has("position","positional","cue ball","cue-ball","transition","blue to black","blue-to-black")) primary="cue_ball_control";
  else if(has("long","distance")) primary="long_potting";
  else if(has("rest")) primary="rest_play";
  else if(has("pressure","match","1-attempt","one attempt")) primary="pressure_resilience";
  if(has("long")) add.push("long_potting");
  if(has("cue ball","cue-ball","position","positional","stun","screw","side","pace","cushion","black from")) add.push("cue_ball_control","pace_control");
  if(has("line-up","lineup","break","clearance","transition","blue to black")) add.push("break_building","transition_play","positional_play");
  if(has("safety","snooker","escape")) add.push("safety","tactical_decision_making");
  if(has("rest")) add.push("rest_play","bridging");
  if(has("pressure","match","1-attempt","one attempt")) add.push("pressure_resilience","confidence_stability");
  if(has("recovery","short side","short-side")) add.push("recovery","cue_ball_control");
  if(has("stamina","endurance","fatigue")) add.push("stamina","focus_consistency");
  const secondary=[...new Set(add.map(normalizeSkillId).filter(x=>x && x!==primary))].slice(0,5);
  const transfer=[...new Set([...(primary==="safety"?["cue_ball_control","tactical_decision_making"]:[]),...(secondary.includes("cue_ball_control")?["break_building"]:[]),...(secondary.includes("pressure_resilience")?["focus_consistency"]:[])])].filter(x=>x!==primary).slice(0,4);
  return {primarySkill:primary, secondarySkills:secondary, transferTags:transfer, source:"auto", updatedAt:new Date().toISOString()};
}
function normalizeRoutineSkillMap(routine, existing){
  const inferred = inferRoutineSkillMap(routine);
  const src = existing || routine?.skillMap || {};
  const validSkills = new Set(currentSkillLibrary({includeArchived:true}).map(s=>s.id));
  const primary = normalizeSkillId(src.primarySkill || routine?.primarySkill || inferred.primarySkill);
  return {
    primarySkill: validSkills.has(primary) ? primary : inferred.primarySkill,
    secondarySkills: normalizeSkillList(src.secondarySkills || routine?.secondarySkills || inferred.secondarySkills),
    transferTags: normalizeSkillList(src.transferTags || routine?.transferTags || inferred.transferTags),
    source: src.source || routine?.skillMapSource || "auto",
    updatedAt: src.updatedAt || routine?.skillMapUpdatedAt || new Date().toISOString()
  };
}
function getRoutineSkillMap(routine){
  if(!routine) return inferRoutineSkillMap({});
  data.routineSkillMap = data.routineSkillMap || {};
  if(!data.routineSkillMap[routine.id]) data.routineSkillMap[routine.id] = normalizeRoutineSkillMap(routine, routine.skillMap);
  return data.routineSkillMap[routine.id];
}
function skillSnapshotForRoutine(routine, skillMap){
  const m = normalizeRoutineSkillMap(routine || {}, skillMap || getRoutineSkillMap(routine));
  return {
    primarySkill: m.primarySkill,
    secondarySkills: normalizeSkillList(m.secondarySkills),
    transferTags: normalizeSkillList(m.transferTags),
    skillMapSource: m.source || "manual",
    skillMapUpdatedAt: m.updatedAt || new Date().toISOString()
  };
}
function applySkillSnapshotToLog(log, routine, skillMap){
  if(!log || !routine) return log;
  const snap = skillSnapshotForRoutine(routine, skillMap);
  log.primarySkill = snap.primarySkill;
  log.secondarySkills = snap.secondarySkills;
  log.transferTags = snap.transferTags;
  log.skillMapSource = snap.skillMapSource;
  log.skillMapUpdatedAt = snap.skillMapUpdatedAt;
  return log;
}
function syncRoutineSkillMapToHistoricalLogs(routineId, skillMap, options = {}){
  const rid = String(routineId || "");
  if(!rid || !Array.isArray(data.logs)) return 0;
  const routine = routineById(rid) || (data.routines || []).find(r => String(r.id) === rid);
  if(!routine) return 0;
  const map = normalizeRoutineSkillMap(routine, skillMap || data.routineSkillMap?.[rid] || routine.skillMap);
  let changed = 0;
  data.logs.forEach(log => {
    if(String(log.routineId || "") !== rid) return;
    const before = JSON.stringify([log.primarySkill, log.secondarySkills, log.transferTags, log.skillMapUpdatedAt]);
    applySkillSnapshotToLog(log, routine, map);
    const after = JSON.stringify([log.primarySkill, log.secondarySkills, log.transferTags, log.skillMapUpdatedAt]);
    if(before !== after) changed += 1;
  });
  if(changed && options.persist !== false && indexedDBReady && !indexedDBUnavailable){
    data.logs
      .filter(log => String(log.routineId || "") === rid)
      .forEach(log => idbPut(INDEXEDDB_LOG_STORE, log).catch(e => logAppError(e, "syncRoutineSkillMapToHistoricalLogs idbPut")));
  }
  return changed;
}
function routineSkillBadges(routine){
  const m=getRoutineSkillMap(routine);
  const sec=(m.secondarySkills||[]).slice(0,3).map(skillLabel).join(" · ");
  return `<span class="badge skill-badge">Primary: ${htmlText(skillLabel(m.primarySkill))}</span>${sec?`<span class="badge skill-badge">Secondary: ${htmlText(sec)}</span>`:""}`;
}
function skillReasonText(routine){
  const m=getRoutineSkillMap(routine);
  const parts=[`skill focus: ${skillLabel(m.primarySkill)}`];
  if((m.transferTags||[]).length) parts.push(`transfer: ${(m.transferTags||[]).slice(0,2).map(skillLabel).join(" / ")}`);
  const transfer = routineGraphTransferProfile(routine);
  if(transfer.topDownstream.length) parts.push(`downstream: ${transfer.topDownstream.slice(0,2).map(x=>skillLabel(x.skill)).join(" / ")}`);
  return parts.join("; ");
}

const SKILL_TRANSFER_MODEL_VERSION = "v4.29";
const SKILL_TRANSFER_GRAPH = {
  cueing: { long_potting:0.30, cue_ball_control:0.25, confidence_stability:0.20, focus_consistency:0.15 },
  cue_ball_speed: { pace_control:0.55, cue_ball_control:0.45, positional_play:0.30, safety:0.18 },
  pace_control: { cue_ball_control:0.48, positional_play:0.38, safety:0.25, recovery:0.20 },
  cue_ball_control: { positional_play:0.45, break_building:0.38, recovery:0.30, safety:0.22 },
  positional_play: { break_building:0.45, transition_play:0.32, recovery:0.25 },
  transition_play: { break_building:0.42, positional_play:0.28, confidence_stability:0.14 },
  long_potting: { confidence_stability:0.25, pressure_resilience:0.20, break_building:0.16 },
  break_building: { confidence_stability:0.22, pressure_resilience:0.18, focus_consistency:0.14 },
  safety: { tactical_decision_making:0.48, cue_ball_control:0.26, pace_control:0.24, pressure_resilience:0.18 },
  tactical_decision_making: { safety:0.35, break_building:0.18, pressure_resilience:0.16 },
  escape_shots: { safety:0.32, cue_ball_control:0.22, pressure_resilience:0.20 },
  rest_play: { cueing:0.22, long_potting:0.18, confidence_stability:0.12 },
  bridging: { cueing:0.20, rest_play:0.18, confidence_stability:0.10 },
  pressure_resilience: { confidence_stability:0.35, focus_consistency:0.25, break_building:0.18, safety:0.16 },
  focus_consistency: { pressure_resilience:0.22, cueing:0.18, break_building:0.16 },
  confidence_stability: { pressure_resilience:0.24, long_potting:0.16, break_building:0.16 },
  stamina: { focus_consistency:0.28, pressure_resilience:0.20, break_building:0.18 }
};
function routineSkillWeights(routineOrLog){
  const source = routineOrLog || {};
  let map;
  if (source.routineId && !source.name) {
    map = {primarySkill:source.primarySkill, secondarySkills:source.secondarySkills || [], transferTags:source.transferTags || []};
    if(!map.primarySkill) map = getRoutineSkillMap(routineById(source.routineId));
  } else {
    map = getRoutineSkillMap(source);
  }
  const out = {};
  const add = (skill, weight) => { const id = normalizeSkillId(skill); if(id && id !== "uncategorized") out[id] = Math.max(out[id] || 0, weight); };
  add(map.primarySkill, 1.00);
  (map.secondarySkills || []).forEach(s => add(s, 0.65));
  (map.transferTags || []).forEach(s => add(s, 0.35));
  return out;
}
function routineGraphTransferProfile(routine){
  const direct = routineSkillWeights(routine);
  const downstream = {};
  Object.entries(direct).forEach(([from, directWeight]) => {
    const edges = SKILL_TRANSFER_GRAPH[from] || {};
    Object.entries(edges).forEach(([to, edgeWeight]) => {
      if(to === from) return;
      downstream[to] = (downstream[to] || 0) + directWeight * edgeWeight;
    });
  });
  const topDownstream = Object.entries(downstream)
    .map(([skill, weight]) => ({skill, weight}))
    .sort((a,b)=>b.weight-a.weight);
  const totalWeight = topDownstream.reduce((a,b)=>a+b.weight,0);
  const breadth = topDownstream.filter(x => x.weight >= 0.12).length;
  return {version:SKILL_TRANSFER_MODEL_VERSION, direct, topDownstream, totalWeight, breadth};
}
function skillPerformanceSummary(logs=(data.logs || []), window=120){
  const rows = (logs || []).slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).slice(-window);
  const acc = {};
  rows.forEach(log => {
    const score = Number(log.normalizedScore ?? normalizeScore(log));
    if(!Number.isFinite(score)) return;
    const weights = routineSkillWeights(log);
    Object.entries(weights).forEach(([skill, weight]) => {
      const bucket = acc[skill] || (acc[skill] = {skill, n:0, weighted:0, weight:0, scores:[]});
      bucket.n += 1;
      bucket.weighted += score * weight;
      bucket.weight += weight;
      bucket.scores.push(score);
    });
  });
  Object.values(acc).forEach(x => {
    x.avg = x.weight ? x.weighted / x.weight : null;
    const split = Math.max(1, Math.floor(x.scores.length / 2));
    const prior = x.scores.slice(0, split);
    const recent = x.scores.slice(split);
    x.recentAvg = recent.length ? avg(recent) : x.avg;
    x.priorAvg = prior.length ? avg(prior) : x.avg;
    x.trend = (x.recentAvg ?? 0) - (x.priorAvg ?? 0);
  });
  return acc;
}
function evidenceStrength(n=0){
  // v4.39.0: smooth Bayesian-style shrinkage instead of abrupt sample-size steps.
  const e = smoothEvidence(n, { priorStrength: 8 });
  // Keep a small display/action floor so early but non-empty signals remain visible without hard jumps.
  const displayFloor = Number(n || 0) > 0 ? 0.12 : 0;
  return {...e, factor: Math.max(displayFloor, Number(e.factor || 0))};
}
function evidenceBadge(n=0, extra=""){
  const e = evidenceStrength(n);
  const suffix = extra ? ` · ${htmlText(extra)}` : "";
  const label = getInsightLanguageSetting() === "friendly" ? uiSignalLabel(e) : e.label;
  return `<span class="evidence-badge evidence-${attrText(e.level)}">${htmlText(label)} · n=${Number(n||0)}${suffix}</span>`;
}
function dampenByEvidence(value, n=0){
  const v = Number(value || 0);
  return Math.round(v * evidenceStrength(n).factor * 10) / 10;
}
function safePercentChange(recent, prior){
  const r = Number(recent);
  const p = Number(prior);
  if(!Number.isFinite(r) || !Number.isFinite(p)) return 0;
  if(p === 0) return r > 0 ? 100 : r < 0 ? -100 : 0;
  return ((r - p) / Math.abs(p)) * 100;
}
function wholeNumberOrNull(value){
  if(value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if(!Number.isFinite(n)) return null;
  return Math.round(n);
}
function validateWholeNumberField(value, label, {required=false, min=0, max=null}={}){
  if(value === "" || value === null || value === undefined){
    if(required) return {error:`${label} is required.`};
    return {value:""};
  }
  const n = Number(value);
  if(!Number.isFinite(n)) return {error:`${label} must be a valid number.`};
  if(!Number.isInteger(n)) return {error:`${label} must be a whole number.`};
  if(n < min) return {error:`${label} must be ${min} or greater.`};
  if(max !== null && n > max) return {error:`${label} cannot exceed ${max}.`};
  return {value:n};
}
function cautiousActionText(base, n=0){
  const e = evidenceStrength(n);
  if(e.level === "strong" || e.level === "moderate") return base;
  if(String(base).includes("outperforming")) return "Early positive signal. Keep difficulty stable unless this repeats.";
  if(String(base).includes("underperforming")) return "Early negative signal. Check fatigue/context before changing the drill.";
  return "Early signal. Keep collecting data before changing targets.";
}
function signalLabelFromScore(score){
  const x=Number(score||0);
  if(x >= 70) return "Severe";
  if(x >= 50) return "High";
  if(x >= 30) return "Moderate";
  return "Low";
}


/* ===== v5.2.0 Adaptive Session Periodization ===== */
function skillDecayAndMaintenanceSummary(logs=(data.logs || []), options={}){
  try{
    const horizonDays = Number(options.horizonDays || 90);
    const minExposure = Number(options.minExposure || 2);
    const ordered = (logs || []).slice().sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
    const now = Date.now();
    const buckets = {};
    ordered.forEach(log => {
      const score = safeNormalizedLogScore(log);
      if(!Number.isFinite(score)) return;
      const created = new Date(log.createdAt || Date.now());
      const t = created.getTime();
      if(!Number.isFinite(t)) return;
      const weights = routineSkillWeights(log);
      Object.entries(weights).forEach(([skill, weight]) => {
        if(!skill || skill === "uncategorized" || Number(weight || 0) <= 0) return;
        const b = buckets[skill] || (buckets[skill] = {skill, logs:[], exposure:0, recentExposure:0, lastDate:null});
        b.logs.push({score, createdAt:created, weight:Number(weight || 0), routineId:log.routineId});
        b.exposure += Number(weight || 0);
        if((now - t) / 86400000 <= horizonDays) b.recentExposure += Number(weight || 0);
        if(!b.lastDate || created > b.lastDate) b.lastDate = created;
      });
    });
    const rows = Object.values(buckets).map(b => {
      const vals = b.logs.map(x=>x.score).filter(Number.isFinite);
      const lastDays = b.lastDate ? Math.max(0, Math.round((now - b.lastDate.getTime()) / 86400000)) : 999;
      const recentVals = vals.slice(-Math.min(6, vals.length));
      const priorVals = vals.slice(-Math.min(12, vals.length), -Math.min(6, vals.length));
      const recentAvg = recentVals.length ? avg(recentVals) : null;
      const priorAvg = priorVals.length ? avg(priorVals) : null;
      const trendDelta = (recentAvg !== null && priorAvg !== null) ? recentAvg - priorAvg : 0;
      const exposureGap = Math.max(0, minExposure - Number(b.recentExposure || 0));
      const recencyPressure = Math.max(0, (lastDays - 21) / 7);
      const fadingPressure = trendDelta < -4 ? Math.min(18, Math.abs(trendDelta) * 1.4) : 0;
      const undertrainedPressure = exposureGap * 8;
      const evidence = evidenceStrength(vals.length);
      const score = Math.round(Math.max(0, recencyPressure * 5 + undertrainedPressure + fadingPressure) * (0.55 + 0.45 * evidence.factor) * 10) / 10;
      let state = "maintain";
      let label = "Maintenance watch";
      if(score >= 45){ state = "urgent"; label = "Maintenance due"; }
      else if(score >= 25){ state = "watch"; label = "Schedule soon"; }
      else if(score >= 10){ state = "light"; label = "Light touch"; }
      else { state = "fresh"; label = "Recently covered"; }
      const reasons = [];
      if(lastDays > 21) reasons.push(`${lastDays}d since last exposure`);
      if(exposureGap > 0) reasons.push(`low ${horizonDays}d exposure`);
      if(fadingPressure > 0) reasons.push(`recent trend ${trendDelta.toFixed(1)}`);
      if(!reasons.length) reasons.push("covered recently");
      return {...b, n:vals.length, lastDays, recentAvg, priorAvg, trendDelta, exposureGap, score, state, label, evidence, reasons:reasons.slice(0,3)};
    }).sort((a,b)=>b.score-a.score);
    return {rows, horizonDays, minExposure};
  }catch(e){
    logAppError?.(e, "skillDecayAndMaintenanceSummary");
    return {rows:[], horizonDays:Number(options.horizonDays || 90), minExposure:Number(options.minExposure || 2), error:true};
  }
}
function maintenanceFitForRoutine(routine, summary=null){
  try{
    const decay = summary || skillDecayAndMaintenanceSummary(data.logs || []);
    const rowMap = new Map((decay.rows || []).map(r => [r.skill, r]));
    const weights = routineSkillWeights(routine);
    let score = 0;
    const reasons = [];
    Object.entries(weights).forEach(([skill, weight]) => {
      const row = rowMap.get(skill);
      if(!row) return;
      const contribution = Number(row.score || 0) * Number(weight || 0);
      score += contribution;
      if(contribution >= 8) reasons.push(`${skillLabel(skill)} ${row.label.toLowerCase()}`);
    });
    const top = Object.entries(weights).map(([skill, weight]) => ({skill, weight, row:rowMap.get(skill)})).filter(x=>x.row).sort((a,b)=>Number(b.row.score||0)-Number(a.row.score||0))[0];
    return {score:Math.round(score * 10) / 10, reasons:[...new Set(reasons)].slice(0,3), topSkill:top?.skill || null, topRow:top?.row || null};
  }catch(e){
    logAppError?.(e, "maintenanceFitForRoutine");
    return {score:0, reasons:[], topSkill:null, topRow:null};
  }
}
function maintenanceReasonForRoutine(routine, fit=null){
  const m = fit || maintenanceFitForRoutine(routine);
  if(!m || Number(m.score || 0) <= 0) return "maintenance: no urgent decay signal";
  if(m.topSkill && m.topRow) return `maintenance: ${skillLabel(m.topSkill)} ${m.topRow.label.toLowerCase()} (${m.topRow.reasons.join(" · ")})`;
  return "maintenance: useful exposure for undertrained skills";
}
function maintenanceSchedulerInsight(logs){
  try{
    const summary = skillDecayAndMaintenanceSummary(logs || data.logs || []);
    const rows = (summary.rows || []).filter(r => r.score >= 10).slice(0,4);
    const routines = activeRoutines().map(r => ({routine:r, fit:maintenanceFitForRoutine(r, summary)})).filter(x => x.fit.score > 0).sort((a,b)=>b.fit.score-a.fit.score).slice(0,3);
    if(!rows.length) return `<div class="insight-card good"><strong>${htmlText(uiLabel("maintenanceScheduler"))}</strong><div class="muted small">No material skill-decay signal in this scope. Keep rotating core skills.</div></div>`;
    return `<div class="insight-card watch"><strong>${htmlText(uiLabel("maintenanceScheduler"))}</strong><div class="muted small">Detects undertrained or fading skills before the decline becomes obvious. Scores are evidence-weighted and should be treated as scheduling prompts.</div>${rows.map(r=>`<div class="context-row"><span>${htmlText(skillLabel(r.skill))}<br><span class="muted">${htmlText(r.reasons.join(" · "))}</span></span><strong>${htmlText(r.label)}</strong><span>${Number(r.score || 0).toFixed(1)}</span></div>`).join("")}${routines.length ? `<div class="adaptive-rationale"><strong>${htmlText(getInsightLanguageSetting()==="friendly"?"Refresh blocks:":"Suggested maintenance blocks:")}</strong> ${routines.map(x=>htmlText(x.routine.name)).join(" · ")}</div>` : ""}</div>`;
  }catch(e){
    logAppError?.(e, "maintenanceSchedulerInsight");
    return `<div class="insight-card watch"><strong>${htmlText(uiLabel("maintenanceScheduler"))}</strong><div class="muted small">Maintenance signal unavailable for this scope.</div></div>`;
  }
}
/* ===== end v5.2.0 Adaptive Session Periodization ===== */


/* ===== v5.2.0 Adaptive Session Periodization ===== */
const PERIODIZATION_BLOCK_TARGETS = {
  acquisition: 0.24,
  consolidation: 0.24,
  pressure: 0.16,
  recovery: 0.14,
  maintenance: 0.22
};
function periodizationBlockForRoutine(routine){
  try{
    const skills = Object.keys(routineSkillWeights(routine || {}));
    const name = String(routine?.name || "").toLowerCase();
    const cat = String(routine?.category || "").toLowerCase();
    if(skills.includes("pressure_resilience") || name.includes("pressure") || cat.includes("pressure")) return "pressure";
    if(skills.includes("confidence_stability") || skills.includes("cueing") || skills.includes("pace_control") || routine?.isAnchor) return "recovery";
    if(skills.includes("break_building") || skills.includes("transition_play") || skills.includes("positional_play")) return "consolidation";
    if(skills.includes("cue_ball_control") || skills.includes("long_potting") || skills.includes("rest_play") || skills.includes("safety")) return "acquisition";
    return "maintenance";
  }catch(e){
    logAppError?.(e, "periodizationBlockForRoutine");
    return "maintenance";
  }
}
function periodizationBlockForLog(log){
  const r = routineById(log?.routineId) || log || {};
  return periodizationBlockForRoutine(r);
}
function periodizationBlockLabel(block){
  return ({acquisition:"Acquisition", consolidation:"Consolidation", pressure:"Pressure", recovery:"Recovery", maintenance:"Maintenance"})[block] || "Maintenance";
}
function adaptiveSessionPeriodizationSummary(logs=(data.logs || []), options={}){
  try{
    const horizonDays = Number(options.horizonDays || 7);
    const now = Date.now();
    const recent = (logs || []).filter(l => {
      const t = new Date(l.createdAt || 0).getTime();
      return Number.isFinite(t) && (now - t) / 86400000 <= horizonDays;
    });
    const blockCounts = {acquisition:0, consolidation:0, pressure:0, recovery:0, maintenance:0};
    const blockMinutes = {acquisition:0, consolidation:0, pressure:0, recovery:0, maintenance:0};
    recent.forEach(log => {
      const block = periodizationBlockForLog(log);
      const minutes = Math.max(1, Number(log.durationMin || log.minutes || log.duration || 1));
      blockCounts[block] = (blockCounts[block] || 0) + 1;
      blockMinutes[block] = (blockMinutes[block] || 0) + minutes;
    });
    const total = Object.values(blockMinutes).reduce((a,b)=>a+Number(b||0),0) || Object.values(blockCounts).reduce((a,b)=>a+Number(b||0),0) || 0;
    const rows = Object.keys(PERIODIZATION_BLOCK_TARGETS).map(block => {
      const actual = total ? Number(blockMinutes[block] || 0) / total : 0;
      const target = PERIODIZATION_BLOCK_TARGETS[block];
      const gap = target - actual;
      const need = Math.max(0, gap) * 100;
      let state = "balanced";
      if(gap >= 0.12) state = "underweighted";
      else if(gap <= -0.12) state = "overweighted";
      return {block, label:periodizationBlockLabel(block), target, actual, gap, need, state, count:blockCounts[block] || 0, minutes:blockMinutes[block] || 0};
    }).sort((a,b)=>b.need-a.need);
    const topNeeds = rows.filter(r=>r.need >= 5).slice(0,3);
    const maintenance = skillDecayAndMaintenanceSummary(logs || data.logs || []);
    const hasMaintenancePressure = (maintenance.rows || []).some(r=>Number(r.score||0) >= 25);
    const weeklyTheme = topNeeds[0]?.block || (hasMaintenancePressure ? "maintenance" : "consolidation");
    return {rows, topNeeds, weeklyTheme, horizonDays, totalMinutes:total, recentLogs:recent.length, hasMaintenancePressure};
  }catch(e){
    logAppError?.(e, "adaptiveSessionPeriodizationSummary");
    return {rows:[], topNeeds:[], weeklyTheme:"consolidation", horizonDays:Number(options.horizonDays || 7), totalMinutes:0, recentLogs:0, error:true};
  }
}
function periodizationFitForRoutine(routine, summary=null){
  try{
    const p = summary || adaptiveSessionPeriodizationSummary(data.logs || []);
    const block = periodizationBlockForRoutine(routine);
    const row = (p.rows || []).find(r=>r.block === block);
    const blockNeed = row ? Math.max(0, Number(row.gap || 0)) * 100 : 0;
    const maintenance = maintenanceFitForRoutine(routine);
    let score = blockNeed * 0.55;
    const reasons = [];
    if(row?.state === "underweighted") reasons.push(`${periodizationBlockLabel(block)} underweighted this week`);
    if(block === p.weeklyTheme) { score += 4; reasons.push(`weekly theme: ${periodizationBlockLabel(block)}`); }
    if(block === "maintenance" && Number(maintenance.score || 0) >= 8) { score += Math.min(10, Number(maintenance.score || 0) * 0.25); reasons.push("maintenance pressure"); }
    if(block === "recovery"){
      const mode = inferTrainingStateMode();
      if(mode?.mode === "recovery") { score += 6; reasons.push("recovery state fit"); }
    }
    return {score:Math.round(score*10)/10, block, row, weeklyTheme:p.weeklyTheme, reasons:[...new Set(reasons)].slice(0,3)};
  }catch(e){
    logAppError?.(e, "periodizationFitForRoutine");
    return {score:0, block:"maintenance", row:null, weeklyTheme:"consolidation", reasons:[]};
  }
}
function periodizationReasonForRoutine(routine, fit=null){
  const f = fit || periodizationFitForRoutine(routine);
  if(!f || Number(f.score || 0) <= 0) return "periodization: balanced weekly mix";
  return `periodization: ${periodizationBlockLabel(f.block)} block fit${f.reasons.length ? ` (${f.reasons.join(" · ")})` : ""}`;
}
function adaptiveSessionPeriodizationInsight(logs){
  try{
    const summary = adaptiveSessionPeriodizationSummary(logs || data.logs || []);
    const rows = (summary.rows || []).slice().sort((a,b)=>b.need-a.need).slice(0,5);
    if(!summary.recentLogs) return `<div class="insight-card watch"><strong>${htmlText(uiLabel("adaptivePeriodization"))}</strong><div class="muted small">No recent logs in the 7-day window. Next week should start with acquisition and calibration blocks before pressure work.</div></div>`;
    const theme = periodizationBlockLabel(summary.weeklyTheme);
    return `<div class="insight-card watch"><strong>${htmlText(uiLabel("adaptivePeriodization"))}</strong><div class="muted small">Week-level balance across acquisition, consolidation, pressure, recovery, and maintenance. Current weekly theme: ${htmlText(theme)}.</div>${rows.map(r=>`<div class="context-row"><span>${htmlText(r.label)}<br><span class="muted">actual ${(r.actual*100).toFixed(0)}% · target ${(r.target*100).toFixed(0)}%</span></span><strong>${htmlText(r.state === "underweighted" ? "Add" : r.state === "overweighted" ? "Reduce" : "Balanced")}</strong><span>${htmlText(r.minutes ? `${Math.round(r.minutes)}m` : `${r.count} logs`)}</span></div>`).join("")}${summary.topNeeds.length ? `<div class="adaptive-rationale"><strong>${htmlText(getInsightLanguageSetting()==="friendly"?"Next session should lean toward:":"Next-session bias:")}</strong> ${summary.topNeeds.map(r=>htmlText(r.label)).join(" · ")}</div>` : `<div class="adaptive-rationale">Weekly training mix is broadly balanced. Use recommendations for skill-specific prioritization.</div>`}</div>`;
  }catch(e){
    logAppError?.(e, "adaptiveSessionPeriodizationInsight");
    return `<div class="insight-card watch"><strong>${htmlText(uiLabel("adaptivePeriodization"))}</strong><div class="muted small">Periodization signal unavailable for this scope.</div></div>`;
  }
}
/* ===== end v5.2.0 Adaptive Session Periodization ===== */

/* ===== v5.2.0 Adaptive Session Periodization ===== */
function changePointSeverityLabel(score){
  const x = Math.abs(Number(score || 0));
  if(x >= 0.75) return "High probability";
  if(x >= 0.55) return "Moderate probability";
  if(x >= 0.35) return "Early probability";
  return "Low probability";
}
function legacyWindowChangePoint(values, options={}){
  const minN = Number(options.minN || 10);
  if(values.length < minN) return {state:"insufficient", label:"Insufficient data", n:values.length, detail:"Need more logs before change-point detection is meaningful.", severity:0};
  const window = Math.max(4, Math.min(Number(options.window || 6), Math.floor(values.length / 2)));
  const prior = values.slice(-window * 2, -window);
  const recent = values.slice(-window);
  if(prior.length < 4 || recent.length < 4) return {state:"insufficient", label:"Insufficient data", n:values.length, detail:"Need two comparable windows before detecting breakthroughs or slumps.", severity:0};
  const priorAvg = avg(prior);
  const recentAvg = avg(recent);
  const delta = recentAvg - priorAvg;
  const pooledStd = Math.max(6, avg([stdDev(prior) || 0, stdDev(recent) || 0]) || 6);
  const rawEffect = delta / pooledStd;
  const reliability = evidenceStrength(values.length);
  const effect = rawEffect * reliability.factor;
  const volatility = stdDev(values.slice(-Math.min(values.length, window * 2))) || 0;
  const flat = Math.abs(delta) <= Math.max(3, pooledStd * 0.18);
  let state = "mixed";
  let label = "No confirmed shift";
  if(effect >= 0.75){ state = "breakthrough"; label = "Possible breakthrough"; }
  else if(effect <= -0.75){ state = "slump"; label = "Possible slump"; }
  else if(flat && volatility <= 18){ state = "plateau"; label = "Possible plateau"; }
  else if(volatility > 24){ state = "volatile"; label = "Volatile / noisy"; }
  return {state, label, n:values.length, priorAvg, recentAvg, delta, effect, probability:Math.min(0.7, Math.abs(effect)/2), probabilityPct:Math.round(Math.min(0.7, Math.abs(effect)/2)*100), volatility, evidence:reliability, severity:Math.abs(effect), detail:`Fallback window model: recent ${recentAvg.toFixed(1)} vs prior ${priorAvg.toFixed(1)} (${delta >= 0 ? "+" : ""}${delta.toFixed(1)} raw). ${reliability.label}.`};
}
function normalizeBayesianChangeState(state){
  if(state === "possible_breakthrough") return "breakthrough";
  if(state === "possible_slump") return "slump";
  return state || "mixed";
}
function detectSeriesChangePoint(series, options={}){
  const values = (series || []).map(v => Number(v)).filter(Number.isFinite);
  const minN = Number(options.minN || 10);
  if(values.length < minN) return {state:"insufficient", label:"Insufficient data", n:values.length, detail:"Need more logs before Bayesian change-point scoring is meaningful.", severity:0, probability:0, probabilityPct:0};
  try{
    const bayes = bayesianChangePointEstimate(values, {minN, minSide:options.minSide || 4, priorStrength:options.priorStrength || 4, minAbsDelta:options.minAbsDelta || 3, maxWindow:options.maxWindow || 150});
    if(!bayes || bayes.state === "insufficient") return bayes || legacyWindowChangePoint(values, options);
    const reliability = evidenceStrength(values.length);
    const adjustedProbability = Math.max(0, Math.min(0.98, Number(bayes.probability || 0) * (0.55 + 0.45 * Number(reliability.factor || 0.5))));
    let state = normalizeBayesianChangeState(bayes.state);
    let label = bayes.label;
    if(adjustedProbability < 0.42 && state !== "plateau") { state = "mixed"; label = "No confirmed shift"; }
    const probabilityPct = Math.round(adjustedProbability * 100);
    const directionText = bayes.direction === "positive" ? "positive" : bayes.direction === "negative" ? "negative" : "flat";
    const detail = `${probabilityPct}% adjusted probability of a ${directionText} structural shift near log ${bayes.bestIndex ?? "n/a"}. Estimated windows: ${Number(bayes.priorAvg || 0).toFixed(1)} → ${Number(bayes.recentAvg || 0).toFixed(1)}. ${reliability.label}.`;
    return {...bayes, state, label, probability:adjustedProbability, probabilityPct, evidence:reliability, severity:adjustedProbability, effect:adjustedProbability, detail, model:"bayesian"};
  }catch(e){
    logAppError?.(e,"detectSeriesChangePoint.bayesian");
    return {...legacyWindowChangePoint(values, options), model:"fallback"};
  }
}
function skillChangePointRows(logs){
  const rows = {};
  (logs || []).slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).forEach(log => {
    const score = safeNormalizedLogScore(log);
    if(!Number.isFinite(score)) return;
    const weights = routineSkillWeights(log);
    Object.entries(weights).forEach(([skill, weight]) => {
      if(!skill || skill === "uncategorized" || Number(weight || 0) <= 0) return;
      const bucket = rows[skill] || (rows[skill] = {skill, values:[]});
      bucket.values.push(score);
    });
  });
  return Object.values(rows)
    .filter(x => x.values.length >= 10)
    .map(x => ({...x, change:detectSeriesChangePoint(x.values, {minN:10, window:5})}))
    .filter(x => x.change.state !== "insufficient")
    .sort((a,b)=>b.change.severity-a.change.severity)
    .slice(0,4);
}
function changePointInsight(logs){
  const values = (logs || []).slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).map(l => safeNormalizedLogScore(l)).filter(Number.isFinite);
  const overall = detectSeriesChangePoint(values, {minN:12, window:6});
  const skillRows = skillChangePointRows(logs);
  const cls = overall.state === "breakthrough" ? "good" : overall.state === "slump" ? "risk" : "watch";
  return `<div class="insight-card ${cls}"><strong>${htmlText(uiLabel("bayesianChangePoint"))}</strong>
    <div class="context-row"><span>Overall state</span><strong>${htmlText(overall.label)}</strong><span>${htmlText(overall.probabilityPct !== undefined ? `${overall.probabilityPct}%` : (overall.evidence?.label || `n=${overall.n}`))}</span></div>
    <div class="adaptive-rationale">${htmlText(overall.detail)}</div>
    ${skillRows.length ? `<div class="adaptive-rationale"><strong>${htmlText(getInsightLanguageSetting()==="friendly"?"Skill shifts:":"Skill-level shifts:")}</strong></div>${skillRows.map(x=>`<div class="context-row"><span>${htmlText(skillLabel(x.skill))}<br><span class="muted">${htmlText(x.change.detail)}</span></span><strong>${htmlText(x.change.label)}</strong><span>${htmlText(x.change.probabilityPct !== undefined ? `${x.change.probabilityPct}%` : changePointSeverityLabel(x.change.effect))}</span></div>`).join("")}` : `<div class="muted">No reliable skill-level change points yet.</div>`}
    <div class="adaptive-rationale">${htmlText(uiAdvancedText("Bayesian probabilities are guarded by sample-size evidence and fall back to the legacy window detector if needed."))}</div>
  </div>`;
}
/* ===== end v5.2.0 Adaptive Session Periodization ===== */


/* ===== v4.39.0 Kalman-style Current Form ===== */
function linearSlope(values){
  const vals=(values||[]).map(Number).filter(Number.isFinite);
  if(vals.length<3) return 0;
  const n=vals.length;
  const meanX=(n-1)/2;
  const meanY=avg(vals);
  const den=(n*(n*n-1))/12 || 1;
  let num=0;
  for(let i=0;i<n;i+=1){ num += (i-meanX)*(vals[i]-meanY); }
  return num/den;
}
function latestSessionReflectionForLogs(logs){
  const ids=new Set((logs||[]).map(l=>l.sessionId).filter(Boolean));
  return (data.sessions||[]).filter(s=>ids.has(s.id)&&s.reflection).sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
}
function reflectionRatingSeries(sessions, key){
  return (sessions||[]).map(s=>Number(s.reflection?.[key] ?? s.reflection?.[key+"Rating"])).filter(Number.isFinite);
}
function reflectionContextForLogs(logs){
  const ids=new Set((logs||[]).map(l=>l.sessionId).filter(Boolean));
  const byId={};
  (data.sessions||[]).forEach(s=>{ if(ids.has(s.id) && s.reflection) byId[s.id]=s.reflection; });
  return byId;
}
function safeNormalizedLogScore(log){
  try{
    const direct=Number(log?.normalizedScore);
    if(Number.isFinite(direct)) return direct;
    const computed=Number(normalizeScore(log));
    return Number.isFinite(computed) ? computed : null;
  }catch(e){
    logAppError?.(e,"safeNormalizedLogScore");
    return null;
  }
}
function estimateCurrentFormForLogs(logs, options={}){
  const ordered=(logs||[]).slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const minN=Number(options.minN||6);
  const reflections=reflectionContextForLogs(ordered);
  let prevDate=null;
  const observations=[];
  ordered.forEach(log=>{
    const score=safeNormalizedLogScore(log);
    if(!Number.isFinite(score)) return;
    const d=new Date(log.createdAt||Date.now());
    const daysGap=prevDate ? Math.max(0,(d-prevDate)/86400000) : 0;
    prevDate=d;
    const ref=reflections[log.sessionId]||{};
    observations.push({
      score,
      daysGap,
      fatigue:Number(ref.fatigue ?? ref.fatigueRating),
      focus:Number(ref.focus ?? ref.focusRating),
      confidence:Number(ref.confidence ?? ref.confidenceRating)
    });
  });
  if(observations.length<minN) return {state:"insufficient", label:"Insufficient form data", n:observations.length, detail:"Need more logs before separating current form from long-term level.", evidence:evidenceStrength(observations.length), index:null, adjustedDelta:0};
  try{
    const kalman=kalmanCurrentFormEstimate(observations,{minN, processNoise:2.1, observationNoise:11});
    const evidence=evidenceStrength(observations.length);
    const sessions=latestSessionReflectionForLogs(ordered.slice(-Math.min(ordered.length,14)));
    const confidenceVals=reflectionRatingSeries(sessions,"confidence");
    const fatigueVals=reflectionRatingSeries(sessions,"fatigue");
    const focusVals=reflectionRatingSeries(sessions,"focus");
    const confidenceMomentum=confidenceVals.length>=3 ? linearSlope(confidenceVals.slice(-6)) : 0;
    const fatigueAvg=fatigueVals.length ? avg(fatigueVals.slice(-6)) : null;
    const focusAvg=focusVals.length ? avg(focusVals.slice(-6)) : null;
    const volatility=stdDev(observations.slice(-Math.min(observations.length,12)).map(x=>x.score)) || 0;
    const adjustedDelta=Number(kalman.adjustedDelta||0) * evidence.factor;
    let state=kalman.state, label=kalman.label;
    if(Math.abs(adjustedDelta)<3 && state!=="volatile"){ state="stable"; label="Stable form"; }
    const direction=Number(kalman.delta||0)>=0?"above":"below";
    const fatigueTxt=fatigueAvg!==null?` Fatigue/focus are treated as observation-noise inputs (${fatigueAvg.toFixed(1)}/5 recent fatigue).`:"";
    return {
      ...kalman,
      state,
      label,
      evidence,
      volatility,
      confidenceMomentum,
      fatigueAvg,
      focusAvg,
      rawDelta:Number(kalman.delta||0),
      adjustedDelta,
      index:Math.round(Math.max(0,Math.min(100,50+adjustedDelta*2))),
      detail:`Kalman-style current form is ${Math.abs(Number(kalman.delta||0)).toFixed(1)} pts ${direction} baseline (${Number(kalman.current||0).toFixed(1)} vs ${Number(kalman.baseline||0).toFixed(1)}). ${evidence.label}; uncertainty ${Number(kalman.uncertainty||0).toFixed(1)} pts.${fatigueTxt}`
    };
  }catch(e){
    logAppError?.(e,"estimateCurrentFormForLogs");
    const scores=observations.map(x=>x.score);
    const recentN=Math.max(4, Math.min(8, Math.ceil(scores.length*0.35)));
    const recent=scores.slice(-recentN);
    const prior=scores.slice(0,-recentN);
    const baseline=prior.length>=4 ? avg(prior) : avg(scores);
    const recentAvg=avg(recent);
    const rawDelta=recentAvg-baseline;
    const evidence=evidenceStrength(scores.length);
    const adjustedDelta=rawDelta*evidence.factor;
    let state="stable", label="Stable form";
    if(adjustedDelta>=5){state="positive"; label="Positive current form";}
    else if(adjustedDelta<=-5){state="negative"; label="Negative current form";}
    return {state,label,n:scores.length,baseline,current:recentAvg,recentAvg,rawDelta,adjustedDelta,volatility:stdDev(scores)||0,evidence,index:Math.round(50+adjustedDelta*2),detail:`Fallback form estimate: recent ${recentAvg.toFixed(1)} vs baseline ${baseline.toFixed(1)}. ${evidence.label}.`};
  }
}
function skillCurrentFormRows(logs){
  const rows={};
  (logs||[]).slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).forEach(log=>{
    const weights=routineSkillWeights(log);
    Object.entries(weights).forEach(([skill,weight])=>{
      if(!skill || skill==="uncategorized" || Number(weight||0)<=0) return;
      (rows[skill]||(rows[skill]={skill,logs:[]})).logs.push(log);
    });
  });
  return Object.values(rows).map(x=>({skill:x.skill, form:estimateCurrentFormForLogs(x.logs,{minN:5})}))
    .filter(x=>x.form.state!=="insufficient")
    .sort((a,b)=>Math.abs(b.form.adjustedDelta||0)-Math.abs(a.form.adjustedDelta||0))
    .slice(0,4);
}
function currentFormInsight(logs){
  const form=estimateCurrentFormForLogs(logs||[]);
  const rows=skillCurrentFormRows(logs||[]);
  const cls=form.state==="positive"?"good":form.state==="negative"?"risk":"watch";
  return `<div class="insight-card ${cls}"><strong>${htmlText(uiLabel("currentForm"))}</strong>
    <div class="context-row"><span>${htmlText(uiLabel("currentForm"))}</span><strong>${htmlText(form.label)}</strong><span>${form.index===null?"N/A":form.index+"/100"}</span></div>
    <div class="adaptive-rationale">${htmlText(form.detail)}</div>
    ${form.confidenceMomentum?`<div class="context-row"><span>Confidence momentum</span><strong>${form.confidenceMomentum>=0?"+":""}${form.confidenceMomentum.toFixed(2)}</strong><span>recent reflection slope</span></div>`:""}
    ${rows.length?`<div class="adaptive-rationale"><strong>Skill-specific form:</strong></div>${rows.map(x=>`<div class="context-row"><span>${htmlText(skillLabel(x.skill))}<br><span class="muted">${htmlText(x.form.detail)}</span></span><strong>${htmlText(x.form.label)}</strong><span>${x.form.index}/100</span></div>`).join("")}`:`<div class="muted">No reliable skill-specific form estimate yet.</div>`}
    <div class="adaptive-rationale">${htmlText(uiAdvancedText("Kalman-style current form separates estimated underlying form from noisy daily scores; fatigue and focus increase observation noise rather than automatically lowering baseline ability."))}</div>
  </div>`;
}
function currentFormAdjustmentForRoutine(routine, globalForm=estimateCurrentFormForLogs(data.logs||[])){
  const map=getRoutineSkillMap(routine);
  const skills=[map.primarySkill,...(map.secondarySkills||[]),...(map.transferTags||[])].filter(Boolean);
  let score=0; const reasons=[];
  if(globalForm.state==="negative"){
    const preserving=skills.some(s=>["cueing","pace_control","confidence_stability","focus_consistency"].includes(s));
    if(preserving){ score+=5; reasons.push("current form recovery fit"); }
    if(skills.includes("pressure_resilience")){ score-=4; reasons.push("reduced pressure load while form is weak"); }
  } else if(globalForm.state==="positive"){
    if(skills.some(s=>["break_building","pressure_resilience","positional_play","transition_play"].includes(s))){ score+=5; reasons.push("positive form supports progression test"); }
  } else if(globalForm.state==="volatile"){
    if(routine?.isAnchor || skills.includes("cueing") || skills.includes("pace_control")){ score+=4; reasons.push("stabilizes volatile form"); }
  }
  return {score,reasons,form:globalForm};
}
/* ===== end v4.39.0 Kalman-style Current Form ===== */

/* ===== v4.32.2 Target Credible Intervals / Bayesian Calibration v1 ===== */
function clampNumber(value, min=0, max=100){
  const v=Number(value);
  if(!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, v));
}
function safeLogScoreForTargetInterval(log){
  try{
    const direct=Number(log?.normalizedScore);
    if(Number.isFinite(direct)) return direct;
    const computed=Number(normalizeScore(log));
    return Number.isFinite(computed) ? computed : null;
  }catch(err){
    console.warn("Skipped malformed log in target credible interval", err, log);
    return null;
  }
}
function targetCredibleIntervalForLogs(logs, options={}){
  try{
    const ordered=(logs||[]).slice().sort((a,b)=>new Date(a?.createdAt||0)-new Date(b?.createdAt||0));
    const scores=ordered.map(safeLogScoreForTargetInterval).filter(Number.isFinite);
    const n=scores.length;
  const priorMean=Number(options.priorMean ?? 50);
  const priorWeight=Number(options.priorWeight ?? 6);
  const evidence=evidenceStrength(n);
  if(!n){
    return {n, evidence, state:"insufficient", label:"No target range yet", mean:priorMean, expected:priorMean, lower:null, upper:null, width:null, volatility:null, recommendation:"Log more attempts before changing the target.", badge:"Insufficient data"};
  }
  const sampleMean=avg(scores);
  const recent=scores.slice(-Math.min(8,n));
  const recentMean=avg(recent);
  const volatility=Math.max(6, stdDev(scores.slice(-Math.min(14,n))) || 10);
  const shrinkWeight=priorWeight/(priorWeight+n);
  const posteriorMean=(sampleMean*n + priorMean*priorWeight)/(n+priorWeight);
  const expected=(posteriorMean*0.55 + recentMean*0.45);
  const uncertainty=(volatility/Math.sqrt(Math.max(1,n))) + (18*shrinkWeight);
  const intervalRadius=Math.max(5, Math.min(28, uncertainty*1.28));
  const rawLower = expected - intervalRadius;
  const rawUpper = expected + intervalRadius;
  const width = Math.max(0, rawUpper - rawLower);
  const lower=clampNumber(rawLower,0,100);
  const upper=clampNumber(rawUpper,0,100);
  let state="stable", label="Stable target range", recommendation="Keep the target stable and collect more evidence.";
  if(n<5){ state="early"; label="Early target estimate"; recommendation="Do not increase difficulty yet; use this as a rough calibration range."; }
  else if(width>28){ state="wide"; label="Wide uncertainty"; recommendation="Avoid aggressive target changes until volatility narrows."; }
  else if(recentMean>upper-4 && evidence.factor>=0.5){ state="raise_cautiously"; label="Cautious progression candidate"; recommendation="Consider a modest target increase or one added constraint, not both."; }
  else if(recentMean<lower+4 && evidence.factor>=0.5){ state="reduce_cautiously"; label="Cautious regression candidate"; recommendation="Simplify the drill slightly or reduce pressure constraints until execution stabilizes."; }
    const badge = `${evidence.label} · ${width>24?"wide interval":width>14?"moderate interval":"tight interval"}`;
    return {n,evidence,state,label,mean:sampleMean,recentMean,posteriorMean,expected,lower,upper,width,volatility,shrinkWeight,recommendation,badge};
  }catch(err){
    console.warn("Target credible interval calculation skipped", err);
    const priorMean=Number(options.priorMean ?? 50);
    return {n:0, evidence:evidenceStrength(0), state:"insufficient", label:"Target range unavailable", mean:priorMean, expected:priorMean, lower:null, upper:null, width:null, volatility:null, recommendation:"Target range unavailable for this data set; continue logging normally.", badge:"Unavailable"};
  }
}
function targetCredibleIntervalForRoutine(routine){
  const logs=(data.logs||[]).filter(l=>l.routineId===routine?.id);
  return targetCredibleIntervalForLogs(logs);
}
function targetIntervalReasonForRoutine(routine){
  try{
    const t=targetCredibleIntervalForRoutine(routine);
    if(!t || !t.n || !Number.isFinite(t.lower) || !Number.isFinite(t.upper)) return "target range not estimated yet";
    const range=`target range ${t.lower.toFixed(0)}–${t.upper.toFixed(0)}`;
    if(t.state==="raise_cautiously") return `${range}; cautious progression only`;
    if(t.state==="reduce_cautiously") return `${range}; simplify if execution remains low`;
    if(t.state==="wide") return `${range}; uncertainty still wide`;
    if(t.state==="early") return `${range}; early low-N estimate`;
    return `${range}; target stable`;
  }catch(err){
    console.warn("Target interval reason skipped", err);
    return "target range not estimated yet";
  }
}
function targetCredibleIntervalInsight(logs){
  try{
    const t=targetCredibleIntervalForLogs(logs||[]);
    const cls=t.state==="raise_cautiously"?"good":t.state==="reduce_cautiously"?"risk":"watch";
    const rangeTxt=(t.lower===null || t.upper===null || !Number.isFinite(t.lower) || !Number.isFinite(t.upper))?"N/A":`${t.lower.toFixed(1)} – ${t.upper.toFixed(1)}`;
    const expectedTxt=Number.isFinite(t.expected)?t.expected.toFixed(1):"N/A";
    const volatilityTxt=Number.isFinite(t.volatility)?t.volatility.toFixed(1):"N/A";
    return `<div class="insight-card ${cls}"><strong>${htmlText(uiLabel("targetCredibleIntervals"))}</strong>
      <div class="context-row"><span>${htmlText(uiLabel("expectedRange"))}</span><strong>${htmlText(rangeTxt)}</strong><span>${htmlText(t.badge)}</span></div>
      <div class="context-row"><span>${htmlText(uiLabel("shrinkageEstimate"))}</span><strong>${htmlText(expectedTxt)}</strong><span>${htmlText(getInsightLanguageSetting()==="friendly"?"consistency risk":"volatility")} ${htmlText(volatilityTxt)}</span></div>
      <div class="adaptive-rationale">${htmlText(uiAdvancedText(t.recommendation))} ${htmlText(uiAdvancedText("Low-sample observations are shrunk toward a neutral prior so early hot/cold streaks do not overdrive target advice."))}</div>
    </div>`;
  }catch(err){
    console.warn("Target credible interval insight skipped", err);
    return `<div class="insight-card watch"><strong>${htmlText(uiLabel("targetCredibleIntervals"))}</strong><div class="muted small">Target range unavailable for the current data set.</div></div>`;
  }
}
/* ===== end v4.32.2 Target Credible Intervals / Bayesian Calibration v1 ===== */

/* ===== v4.36.2 Dynamic Difficulty Adjustment v1 ===== */
function safeDynamicDifficultyScore(log){
  try{
    const direct=Number(log?.normalizedScore);
    if(Number.isFinite(direct)) return direct;
    const computed=Number(normalizeScore(log));
    return Number.isFinite(computed) ? computed : null;
  }catch(err){
    console.warn("Skipped malformed log in dynamic difficulty adjustment", err, log);
    return null;
  }
}
function dynamicDifficultyAdjustmentForLogs(logs, routine=null){
  try{
    const arr=(logs||[]).slice().sort((a,b)=>new Date(a?.createdAt||0)-new Date(b?.createdAt||0));
    const n=arr.length;
    const evidence=evidenceStrength(n);
    const hit=targetHitRate(arr);
    const range=targetCredibleIntervalForLogs(arr);
    const form=estimateCurrentFormForLogs(arr,{minN:6});
    const recentScores=arr.slice(-Math.min(8,n)).map(safeDynamicDifficultyScore).filter(Number.isFinite);
    const recentAvg=recentScores.length?avg(recentScores):null;
    const volatility=recentScores.length>=4 ? stdDev(recentScores) : null;
    const fatigueFlags=arr.slice(-Math.min(10,n)).filter(l=>Number(l?.reflectionFatigue ?? l?.fatigue ?? 0)>=4).length;
    if(n<4){
      return {state:"collect", label:"Hold difficulty", action:"collect evidence", severity:"low", score:0, evidence, hit, range, form, recentAvg, volatility, reason:"Too few logs to change difficulty safely. Keep the drill stable and collect a baseline.", constraints:[]};
    }
    let state="maintain", label="Maintain difficulty", action="keep current setup", severity="low", score=0;
    const constraints=[];
    const reasons=[];
    if(hit!==null && Number.isFinite(Number(hit))){
      if(hit>=82 && evidence.factor>=0.45 && range?.state!=="wide"){
        state="progress"; label="Progress difficulty"; action="increase one constraint"; severity="high"; score+=16;
        reasons.push(`hit rate ${Number(hit).toFixed(0)}% is above the progression band`);
        constraints.push("raise target slightly", "add one positional constraint", "reduce allowed attempts");
      }else if(hit<=35 && evidence.factor>=0.35){
        state="regress"; label="Regress difficulty"; action="simplify setup"; severity="high"; score-=16;
        reasons.push(`hit rate ${Number(hit).toFixed(0)}% is below the productive band`);
        constraints.push("reduce distance or angle", "remove pressure condition", "increase allowed attempts");
      }else if(hit>=68 && hit<82 && evidence.factor>=0.35){
        state="pressure_ready"; label="Add controlled pressure"; action="add pressure constraint only"; severity="moderate"; score+=8;
        reasons.push(`hit rate ${Number(hit).toFixed(0)}% is stable enough for controlled pressure`);
        constraints.push("add scored target", "add short timer", "finish with one pressure repeat");
      }else{
        reasons.push(`hit rate ${Number(hit).toFixed(0)}% sits inside the maintenance band`);
      }
    }else{
      reasons.push("no usable target hit-rate signal yet");
    }
    if(range?.state==="raise_cautiously" && state!=="regress"){
      state="progress"; label="Cautious progression"; action="increase one constraint only"; severity="high"; score+=8;
      reasons.push("credible range supports modest progression");
      if(!constraints.length) constraints.push("raise target slightly", "add one mild constraint");
    }
    if(range?.state==="reduce_cautiously"){
      state="regress"; label="Cautious regression"; action="simplify one constraint"; severity="high"; score-=8;
      reasons.push("credible range supports simplification");
      constraints.length=0; constraints.push("lower target", "simplify layout", "remove pressure condition");
    }
    if(range?.state==="wide" && state==="progress"){
      state="maintain"; label="Hold progression"; action="do not progress yet"; severity="moderate"; score-=10;
      reasons.push("target interval remains too wide for aggressive progression");
      constraints.length=0; constraints.push("repeat same target until range tightens");
    }
    if(form?.state==="negative" || fatigueFlags>=3){
      if(state==="progress" || state==="pressure_ready"){
        state="preserve_confidence"; label="Preserve confidence"; action="finish easier, do not escalate"; severity="high"; score-=12;
        reasons.push(form?.state==="negative"?"current form is below baseline":"recent fatigue flags are elevated");
        constraints.length=0; constraints.push("keep familiar setup", "end with a high-success version", "avoid adding pressure today");
      }
    }
    if(Number.isFinite(volatility) && volatility>22 && state==="progress"){
      state="stabilize"; label="Stabilize before progressing"; action="repeat same setup"; severity="moderate"; score-=8;
      reasons.push("recent volatility is high");
      constraints.length=0; constraints.push("same setup for another block", "reduce switching", "track quality of misses");
    }
    return {state,label,action,severity,score,evidence,hit,range,form,recentAvg,volatility,reason:reasons.slice(0,3).join("; ") || "No strong difficulty-change signal.",constraints};
  }catch(err){
    console.warn("Dynamic difficulty adjustment skipped", err);
    return {state:"unavailable", label:"Difficulty signal unavailable", action:"continue normal logging", severity:"low", score:0, evidence:evidenceStrength(0), hit:null, range:null, form:null, recentAvg:null, volatility:null, reason:"Difficulty adjustment could not be calculated for this data set.", constraints:[]};
  }
}
function dynamicDifficultyAdjustmentForRoutine(routine){
  try{
    const logs=(data.logs||[]).filter(l=>String(l?.routineId)===String(routine?.id));
    return dynamicDifficultyAdjustmentForLogs(logs,routine);
  }catch(err){
    console.warn("Routine dynamic difficulty adjustment skipped", err, routine);
    return {state:"unavailable", label:"Difficulty signal unavailable", action:"continue normal logging", severity:"low", score:0, evidence:evidenceStrength(0), hit:null, range:null, form:null, recentAvg:null, volatility:null, reason:"Difficulty adjustment unavailable for this routine.", constraints:[]};
  }
}
function difficultyAdjustmentReasonForRoutine(routine){
  const d=dynamicDifficultyAdjustmentForRoutine(routine);
  if(!d) return "difficulty signal unavailable";
  if(d.state==="progress") return "difficulty: progress one constraint";
  if(d.state==="pressure_ready") return "difficulty: add controlled pressure";
  if(d.state==="regress") return "difficulty: simplify one constraint";
  if(d.state==="preserve_confidence") return "difficulty: preserve confidence today";
  if(d.state==="stabilize") return "difficulty: stabilize before progressing";
  if(d.state==="collect") return "difficulty: hold until baseline grows";
  if(d.state==="unavailable") return "difficulty signal unavailable";
  return "difficulty: maintain current setup";
}
function dynamicDifficultyInsight(logs){
  try{
    const d=dynamicDifficultyAdjustmentForLogs(logs||[]);
    const cls=(d.state==="progress"||d.state==="pressure_ready")?"good":(d.state==="regress"||d.state==="preserve_confidence")?"risk":"watch";
    const hitTxt=d.hit===null||d.hit===undefined||!Number.isFinite(Number(d.hit))?"N/A":`${Number(d.hit).toFixed(0)}%`;
    const lower=d.range?.lower, upper=d.range?.upper;
    const rangeTxt=Number.isFinite(Number(lower))&&Number.isFinite(Number(upper))?`${Number(lower).toFixed(0)}–${Number(upper).toFixed(0)}`:"N/A";
    return `<div class="insight-card ${cls}"><strong>${htmlText(uiLabel("dynamicDifficulty"))}</strong>
      <div class="context-row"><span>${htmlText(getInsightLanguageSetting()==="friendly"?"What to do":"Recommended action")}</span><strong>${htmlText(d.label)}</strong><span>${htmlText(d.action)}</span></div>
      <div class="context-row"><span>${htmlText(getInsightLanguageSetting()==="friendly"?"Hit-rate / expected range":"Hit-rate / target range")}</span><strong>${htmlText(hitTxt)}</strong><span>${htmlText(rangeTxt)} · ${htmlText(d.evidence?.label||"low evidence")}</span></div>
      <div class="adaptive-rationale">${htmlText(d.reason)} Target changes are one-step only: increase target, add pressure, or simplify setup, but not several changes at once.</div>
      ${d.constraints?.length?`<div class="adaptive-rationale"><strong>Suggested constraint:</strong> ${d.constraints.slice(0,3).map(htmlText).join(" · ")}</div>`:""}
    </div>`;
  }catch(err){
    console.warn("Dynamic difficulty insight skipped", err);
    return `<div class="insight-card watch"><strong>${htmlText(uiLabel("dynamicDifficulty"))}</strong><div class="muted small">Difficulty signal unavailable for the current data set.</div></div>`;
  }
}
/* ===== end v4.36.2 Dynamic Difficulty Adjustment v1 ===== */



function transferNeedScoreForRoutine(routine, skillSummary=skillPerformanceSummary()){
  const profile = routineGraphTransferProfile(routine);
  let score = 0;
  const reasons = [];
  profile.topDownstream.slice(0,6).forEach(edge => {
    const perf = skillSummary[edge.skill];
    const avgScore = perf?.avg;
    const weaknessGap = avgScore === null || avgScore === undefined ? 8 : Math.max(0, 72 - Number(avgScore));
    const trendPenalty = perf?.trend < -3 ? Math.min(6, Math.abs(perf.trend)) : 0;
    const n = Number(perf?.n || 0);
    const contribution = dampenByEvidence((weaknessGap + trendPenalty) * edge.weight * 0.35, n);
    score += contribution;
    if(contribution >= 1.4) reasons.push(`${skillLabel(edge.skill)} downstream need (${evidenceStrength(n).label.toLowerCase()})`);
  });
  if(profile.breadth >= 4) { score += 3; reasons.push("broad transfer graph"); }
  return {score:Math.round(score * 10) / 10, reasons:[...new Set(reasons)].slice(0,3), profile};
}
function transferAwareReasonText(routine, transferNeed=null){
  const t = transferNeed || transferNeedScoreForRoutine(routine);
  const top = t.profile.topDownstream.slice(0,3);
  if(!top.length) return "Limited transfer profile.";
  const downstream = top.map(x=>skillLabel(x.skill)).join(" / ");
  const need = t.reasons.length ? ` Current need: ${t.reasons.join(" · ")}.` : "";
  return `Primary transfer targets: ${downstream}.${need}`;
}

function transferModelInsight(logs){
  const summary = skillPerformanceSummary(logs || data.logs || []);
  const routines = activeRoutines();
  if(!routines.length) return `<div class="insight-card watch"><strong>${htmlText(uiLabel("transferModel"))}</strong><div class="muted">No active routines available.</div></div>`;
  const upstream = routines.map(r => { const t=transferNeedScoreForRoutine(r, summary); return {routine:r, ...t}; })
    .sort((a,b)=>(b.score + b.profile.totalWeight * 5) - (a.score + a.profile.totalWeight * 5))
    .slice(0,3);
  const weakSkills = Object.values(summary).filter(x => x.n >= 2).map(x=>{
      const avgScore = Number(x.avg || 0);
      const weaknessIndex = Math.max(0, 100 - avgScore);
      return {...x, weaknessIndex, evidence:evidenceStrength(x.n)};
    }).sort((a,b)=>b.weaknessIndex-a.weaknessIndex).slice(0,3);
  return `<div class="insight-card watch"><strong>${htmlText(uiLabel("transferModel"))}</strong>
    <div class="adaptive-rationale">Indirect transfer signals are evidence-weighted. Low-sample relationships are shown, but dampened in recommendation scoring.</div>
    ${upstream.map(x=>`<div class="context-row"><span>${htmlText(x.routine.name)}<br><span class="muted">${htmlText(transferAwareReasonText(x.routine, x))}</span><br>${evidenceBadge(safeMax(x.profile.topDownstream.slice(0,3).map(e=>Number(summary[e.skill]?.n||0)), 0), "transfer basis")}</span><strong>${Number(x.score || 0).toFixed(1)}</strong></div>`).join("")}
    ${weakSkills.length?`<div class="adaptive-rationale"><strong>${htmlText(getInsightLanguageSetting()==="friendly"?"Main constraints:":"Bottleneck severity:")}</strong> ${weakSkills.map(x=>`${htmlText(skillLabel(x.skill))} — ${signalLabelFromScore(x.weaknessIndex)} (${htmlText(x.evidence.label.toLowerCase())})`).join(" · ")}</div>`:""}
  </div>`;
}

function parseRating(id){ const v=Number($(id)?.value||0); return Number.isFinite(v)&&v>0 ? v : null; }
function sessionPerformanceForReflection(session){
  const ids=new Set((session?.logIds||[]).filter(Boolean));
  const logs=(data.logs||[]).filter(l=>ids.has(l.id) || (session?.id && l.sessionId===session.id));
  const vals=logs.map(l=>Number(l.normalizedScore)).filter(Number.isFinite);
  return vals.length ? avg(vals) : null;
}
function classifyReflectionPerformance(session){
  const ref=session?.reflection||{};
  const perf=sessionPerformanceForReflection(session);
  const subjective=[ref.focusRating, ref.confidenceRating, ref.cueingRating, ref.mentalSharpnessRating].map(Number).filter(Number.isFinite);
  const quality=subjective.length ? avg(subjective) : null;
  const fatigue=Number(ref.fatigueRating||0) || null;
  const flags=[];
  if(perf!==null && quality!==null){
    if(perf>=70 && quality<=2.5) flags.push("good_score_bad_feel");
    if(perf<=45 && quality>=4) flags.push("bad_score_good_feel");
  }
  if(fatigue!==null && fatigue>=4) flags.push("fatigue_risk");
  return {performance:perf, subjectiveQuality:quality, fatigue, flags};
}
function reflectionIntelligenceSummary(logs){
  const scoped=new Set((logs||[]).map(l=>l.sessionId).filter(Boolean));
  const scopedSessionCount = scoped.size;
  const sessions=(data.sessions||[]).filter(s=>scoped.has(s.id)&&s.reflection);
  if(!sessions.length) return `<div class="insight-card watch"><strong>${htmlText(uiLabel("sessionFeel"))}</strong><div class="muted">No structured reflection ratings in this scope yet.</div><div class="adaptive-rationale">Coverage: 0 / ${scopedSessionCount || 0} sessions.</div></div>`;
  const classified=sessions.map(s=>({session:s,...classifyReflectionPerformance(s)}));
  const fatigue=classified.map(x=>x.fatigue).filter(Number.isFinite);
  const quality=classified.map(x=>x.subjectiveQuality).filter(Number.isFinite);
  const perf=classified.map(x=>x.performance).filter(Number.isFinite);
  const divGood=classified.filter(x=>x.flags.includes("good_score_bad_feel")).length;
  const divBad=classified.filter(x=>x.flags.includes("bad_score_good_feel")).length;
  const fatigueRisk=classified.filter(x=>x.flags.includes("fatigue_risk")).length;
  const coverage = scopedSessionCount ? `${sessions.length} / ${scopedSessionCount}` : `${sessions.length}`;
  return `<div class="insight-card watch"><strong>${htmlText(uiLabel("sessionFeel"))}</strong>
    <div class="context-row"><span>Reflection coverage</span><strong>${coverage}</strong><span>${evidenceStrength(sessions.length).label}</span></div>
    <div class="context-row"><span>Avg subjective quality</span><strong>${quality.length?avg(quality).toFixed(1)+"/5":"N/A"}</strong><span>${quality.length}/${sessions.length} rated</span></div>
    <div class="context-row"><span>Avg fatigue</span><strong>${fatigue.length?avg(fatigue).toFixed(1)+"/5":"N/A"}</strong><span>${fatigueRisk} high-fatigue flags</span></div>
    <div class="context-row"><span>Avg performance</span><strong>${perf.length?avg(perf).toFixed(1):"N/A"}</strong><span>reflection-linked logs</span></div>
    <div class="adaptive-rationale">Divergence flags: ${divGood} good-score/bad-feel · ${divBad} bad-score/good-feel. These are context signals, not hard overrides.</div>
  </div>`;
}

function skillMapInsight(logs){
  const counts={};
  (logs||[]).forEach(l=>{
    const r=routineById(l.routineId);
    const primary = normalizeSkillId(l.primarySkill || (r ? getRoutineSkillMap(r).primarySkill : ""));
    if(!primary || primary === "uncategorized") return;
    const mins=Number(l.timeMinutes||0)||1;
    counts[primary]=(counts[primary]||0)+mins;
  });
  const rows=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if(!rows.length) return `<div class="insight-card watch"><strong>${htmlText(uiLabel("skillMix"))}</strong><div class="muted">No skill-mapped logs in this scope yet.</div></div>`;
  const total=rows.reduce((a,b)=>a+b[1],0);
  return `<div class="insight-card watch"><strong>${htmlText(uiLabel("skillMix"))}</strong>${rows.map(([k,v])=>`<div class="context-row"><span>${htmlText(skillLabel(k))}</span><strong>${total?((v/total)*100).toFixed(0):0}%</strong><span>${Math.round(v)} min-weighted</span></div>`).join("")}<div class="adaptive-rationale">Primary routine skills now provide the semantic layer for recommendation reasons and later transfer modelling.</div></div>`;
}

const defaultData = {
  appVersion: APP_VERSION,
  appBuildTimestamp: APP_BUILD_TIMESTAMP,
  routines: [
    {
      id: uuid(), name: "Line-up", scoring: "raw", attempts: "", duration: 20, target: 50, stretchTarget: 65,
      category: "break-building", folder: "Break-building", subfolder: "Line-up",
      description: "Standard line-up drill. Log highest continuous score or agreed score metric."
    },
    {
      id: uuid(), name: "Long potting — 10 attempts", scoring: "success_rate", attempts: 10, duration: 10, target: 70, stretchTarget: 85,
      category: "potting", folder: "Potting", subfolder: "Long pots",
      description: "Ten long pots. Log made balls out of attempts. Normalized score is success percentage."
    },
    {
      id: uuid(), name: "Black from spot", scoring: "success_rate", attempts: 10, duration: 10, target: 80, stretchTarget: 90,
      category: "potting", folder: "Potting", subfolder: "Colours",
      description: "Ten black-ball attempts from defined cue-ball positions. Normalized score is success percentage."
    },
    {
      id: uuid(), name: "Safety drill", scoring: "points", attempts: "", duration: 15, target: 10, stretchTarget: 15,
      category: "safety", folder: "Safety", subfolder: "General",
      description: "Use a points system, e.g. +1 good leave, -1 poor leave."
    }
  ],
  plans: [],
  sessions: [],
  logs: [],
  tagHistory: [],
  skillTaxonomy: defaultSkillTaxonomy(),
  routineSkillMap: {},
  skillTrendCache: {},
  recommendationFeedback: [],
  routinePackImports: [],
  smartSessionBuilder: {version:"v2"}
};

let data = loadData();
activeSkillTaxonomyForNormalization = normalizeSkillTaxonomy(data.skillTaxonomy || defaultSkillTaxonomy());
data.skillTaxonomy = activeSkillTaxonomyForNormalization;
ensureTablesDatabase();
refreshReferenceNames();
// Core data is compacted after IndexedDB hydration/migration succeeds.
let planDraft = [];
let activeSession = null;
let isResumingActiveSession = false;
let timerInterval = null;
let timerStartMs = null;
let elapsedBeforeStartMs = 0;
function monotonicNowMs() { try { if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now(); } catch(e) {} return Date.now(); }
let suppressTimerPersistence = false;
let timerAutostartDelayInterval = null;
let timerAutostartDelayEndsAt = null;

// v4.39.0 Focus-mode UX: local touch controls should avoid native keyboard friction.
let focusNumpadTargetId = "scoreValue";
let focusStepHoldStartTimer = null;
let focusStepHoldRepeatTimer = null;
let focusStepHoldAccelerationTimer = null;
let focusStepFiredByHold = false;
let focusSwipeStartX = 0;
let focusSwipeStartY = 0;
let focusSwipeStartTime = 0;
let focusSwipeArmed = false;

function cancelFocusStepHold() {
  if (focusStepHoldStartTimer) clearTimeout(focusStepHoldStartTimer);
  if (focusStepHoldRepeatTimer) clearInterval(focusStepHoldRepeatTimer);
  if (focusStepHoldAccelerationTimer) clearTimeout(focusStepHoldAccelerationTimer);
  document.querySelectorAll?.(".focus-hold-active").forEach(el => el.classList.remove("focus-hold-active"));
  focusStepHoldStartTimer = null;
  focusStepHoldRepeatTimer = null;
  focusStepHoldAccelerationTimer = null;
}

function normalizeFocusNumpadTarget(id) {
  const allowed = ["scoreValue","leftSideScoreValue","rightSideScoreValue","attemptsValue","manualTimeValue","bestAttemptValue","completionCountValue","highestBreakValue","sessionTotalUnitsValue"];
  return allowed.includes(id) && $(id) ? id : "scoreValue";
}

function setFocusNumpadTarget(id) {
  focusNumpadTargetId = normalizeFocusNumpadTarget(id || focusNumpadTargetId);
  document.querySelectorAll(".focus-score-inline-row").forEach(row => row.classList.toggle("focus-numpad-active-row", !!row.querySelector(`#${cssEscapeSafe(focusNumpadTargetId)}`)));
  const panel = document.querySelector(".focus-score-cockpit");
  if (panel) {
    const row = $(focusNumpadTargetId)?.closest("div");
    const label = row?.querySelector("label")?.textContent?.trim() || "Score";
    const labelEl = panel.querySelector(".focus-cockpit-label");
    if (labelEl) labelEl.textContent = label;
  }
}

function focusModeFlash(selectorOrEl, className = "focus-control-pulse") {
  try {
    const el = typeof selectorOrEl === "string" ? document.querySelector(selectorOrEl) : selectorOrEl;
    if (!el) return;
    el.classList.remove(className);
    void el.offsetWidth;
    el.classList.add(className);
    setTimeout(() => el.classList.remove(className), 220);
  } catch(e) {}
}

function focusModeScoreFeedback(inputId) {
  if (!document.body?.classList.contains("session-focus-active")) return;
  const el = $(normalizeFocusNumpadTarget(inputId || focusNumpadTargetId));
  if (el) focusModeFlash(el, "focus-score-pulse");
  focusModeFlash($("activeSession"), "focus-card-pulse");
}


function applyFocusModeInputLocks() {
  if (!document.body?.classList.contains("session-focus-active")) return;
  const ids = ["scoreValue","leftSideScoreValue","rightSideScoreValue","attemptsValue","manualTimeValue","bestAttemptValue","completionCountValue","highestBreakValue","sessionTotalUnitsValue"];
  ids.forEach(id => {
    const el = $(id);
    if (!el) return;
    const step = String(el.getAttribute("step") || "");
    const needsDecimals = step.includes(".");
    if (needsDecimals) {
      el.readOnly = false;
      el.setAttribute("inputmode", "decimal");
      el.classList.remove("focus-readonly-input");
    } else {
      el.readOnly = true;
      el.setAttribute("inputmode", "none");
      el.classList.add("focus-readonly-input");
    }
    el.addEventListener("focus", () => setFocusNumpadTarget(id), {once:false});
    el.addEventListener("click", () => setFocusNumpadTarget(id), {once:false});
  });
  setFocusNumpadTarget(focusNumpadTargetId);
}

function renderFocusNumpad(r) {
  const box = $("scoreInputs");
  if (!box || !document.body?.classList.contains("session-focus-active")) return;
  box.querySelector(".focus-numpad-panel")?.remove();
  const candidates = ["scoreValue","leftSideScoreValue","rightSideScoreValue","bestAttemptValue","completionCountValue","highestBreakValue"].filter(id => $(id));
  if (!candidates.length) return;
  focusNumpadTargetId = normalizeFocusNumpadTarget(candidates.includes(focusNumpadTargetId) ? focusNumpadTargetId : candidates[0]);
  const targetLabel = (() => {
    const row = $(focusNumpadTargetId)?.closest("div");
    return row?.querySelector("label")?.textContent?.trim() || "Score";
  })();
  const buttons = ["1","2","3","4","5","6","7","8","9","⌫","0","✓"];
  box.insertAdjacentHTML("beforeend", `<div class="focus-numpad-panel focus-score-cockpit" aria-label="Focus mode score cockpit">
    <div class="focus-cockpit-header">
      <span class="focus-cockpit-label">${htmlText(targetLabel)}</span>
      <span class="focus-cockpit-hint">tap score · ✓ saves</span>
    </div>
    <div class="focus-numpad-grid">${buttons.map(label => {
      const action = label === "⌫" ? "backspace" : label === "✓" ? "enter" : "digit";
      const value = action === "digit" ? label : "";
      return `<button type="button" class="secondary" data-action="focus-numpad" data-numpad-action="${action}" data-value="${value}">${label}</button>`;
    }).join("")}</div>
    <div class="focus-numpad-footer">
      <button type="button" class="secondary" data-action="same-as-last">Same time</button>
      <button type="button" class="secondary" data-action="repeat-last-score-setup">Repeat last setup</button>
    </div>
  </div>`);
}

function handleFocusNumpad(action, value) {
  const el = $(normalizeFocusNumpadTarget(focusNumpadTargetId));
  if (!el) return;
  if (action === "enter") {
    focusModeFlash($("saveNextBtn"), "focus-control-pulse");
    saveCurrentRoutine();
    return;
  }
  let current = String(el.value || "");
  if (action === "clear") current = "";
  else if (action === "backspace") current = current.slice(0, -1);
  else if (action === "digit") current = `${current}${String(value || "")}`.replace(/^0+(?=\d)/, "");
  el.value = current;
  el.dispatchEvent(new Event("input", {bubbles:true}));
  setFocusNumpadTarget(el.id);
  focusModeScoreFeedback(el.id);
  refreshCurrentRoutineLivePerformance();
}
let wakeLockSentinel = null;
let wakeLockRequestInFlight = false;
let wakeLockPermanentlyFailed = false;
let deferredInstallPrompt = null;
const STATS_MODE_KEY = "snookerPracticePWA.statsMode";
const EXERCISE_FORM_MODE_KEY = "snookerPracticePWA.exerciseFormMode";
const STATS_DETAIL_MODE_KEY = "snookerPracticePWA.statsDetailMode";
const STATS_MODES = new Set(["overview", "trends", "graphs", "routines", "pressure", "insights", "bayesian", "ab", "counterfactual", "tournament"]);
function normalizeStatsMode(value) {
  const v = String(value || "overview");
  if (v === "advanced") return "trends";
  return STATS_MODES.has(v) ? v : "overview";
}
let statsMode = normalizeStatsMode(localStorage.getItem(STATS_MODE_KEY) || "overview");
const STATS_ROUTINE_FILTER_KEY = "snookerPracticePWA.statsRoutineFilter";
let statsRoutineFilterId = localStorage.getItem(STATS_ROUTINE_FILTER_KEY) || "all";

function $(id) { return document.getElementById(id); }


/* v5.4.0 Friendly / Analytical UI language foundation */
const INSIGHT_LANGUAGE_KEY = "snookerPracticePWA.insightLanguage";
const UI_LABELS = {
  friendly: {
    maintenanceScheduler:"Maintenance Plan",
    adaptivePeriodization:"Weekly Balance",
    bayesianChangePoint:"Performance Shifts",
    currentForm:"Current Form",
    targetCredibleIntervals:"Expected Target Range",
    dynamicDifficulty:"Difficulty Guidance",
    transferModel:"Skill Transfer",
    personalizedPriors:"Personalized Baselines",
    bayesianOptimization:"Smart Practice Balance",
    contextEffects:"Table & Time Effects",
    contextNormalized:"Context-Adjusted Performance",
    coachingEngine:"Coaching Plan",
    weaknessConcentration:"Main Weak Spots",
    performanceStability:"Consistency Score",
    staminaDropoff:"Stamina Pattern",
    secondOrderAnalytics:"Training Signals",
    signalConfidence:"Signal Confidence",
    trueSkill:"True Skill",
    statsInsights:"Insights",
    statsGraphs:"Graphs",
    pressure:"Pressure",
    tournamentPrep:"Tournament Preparation",
    abComparison:"A/B Comparison",
    drillComparison:"Drill Comparison",
    recommendationLearning:"What Works For You",
    trainingPatterns:"Training Patterns",
    aboveBelowExpectation:"Above / Below Expectation",
    bestPerformanceWindow:"Best Performance Window",
    tableTimeEffects:"Table & Time Effects",
    sessionFeel:"Session Feel",
    reflectionPatterns:"Session Themes",
    skillMix:"Skill Mix",
    performanceShifts:"Performance Shifts",
    expectedRange:"Expected Range",
    smartPracticeBalance:"Smart Practice Balance",
    difficultyGuidance:"Difficulty Guidance",
    mainWeakSpots:"Main Weak Spots",
    consistencyRisk:"Consistency Risk",
    tooEarly:"Too early",
    earlySignal:"Early signal",
    moderateSignal:"Moderate signal",
    strongSignal:"Strong signal",
    smartSessionBuilder:"Smart Session Builder",
    mentalLoad:"Mental Load",
    energyCost:"Energy Cost",
    confidenceRisk:"Confidence Risk",
    switchingCost:"Switching Cost",
    warmupCalibration:"Warm-up",
    primarySkillBlock:"Main Skill Block",
    carryoverBlock:"Carryover Block",
    pressureBlock:"Pressure Block",
    finishStrong:"Finish Strong",
    recoveryCalibration:"Recovery Start",
    lowSwitchPrimaryBlock:"Low-Switch Main Block",
    completionBlock:"Fill-In Block",
    recommendationMode:"Recommendation Style",
    drillSlots:"drill slots",
    targetDuration:"Target",
    loadedEstimate:"Planned",
    advancedAnalytics:"Advanced Signals",
    posteriorUncertainty:"Confidence range",
    posteriorDraw:"Test draw",
    thompsonSampling:"Exploration draw",
    hierarchicalPriors:"Personalized baselines",
    kalmanCurrentForm:"Current form tracker",
    bayesianChangeProbability:"Shift likelihood",
    credibleIntervalWidth:"Range width",
    shrinkageEstimate:"Stabilized estimate",
    observationNoise:"Daily noise",
    betaPosterior:"Success estimate",
    explorationBonus:"Explore boost",
    priorSource:"Baseline source",
    feedbackTracked:"Feedback tracked",
    accepted:"accepted",
    skipped:"skipped",
    completed:"completed"
  },
  analytical: {
    maintenanceScheduler:"Skill Decay & Maintenance Scheduler",
    adaptivePeriodization:"Adaptive Periodization",
    bayesianChangePoint:"Bayesian Change-Point Detection",
    currentForm:"Latent Current Form Estimate",
    targetCredibleIntervals:"Target Credible Intervals v1",
    dynamicDifficulty:"Dynamic Difficulty Adjustment v1",
    transferModel:"Transfer Model v1",
    personalizedPriors:"Hierarchical Bayesian Priors",
    bayesianOptimization:"Bayesian Practice Optimization",
    contextEffects:"Context Effects",
    contextNormalized:"Context-Normalized Performance v1",
    coachingEngine:"Coaching Engine",
    weaknessConcentration:"Weakness Concentration",
    performanceStability:"Performance Stability",
    staminaDropoff:"Stamina Drop-Off",
    secondOrderAnalytics:"Second-Order Analytics",
    signalConfidence:"Evidence Strength",
    trueSkill:"True Skill",
    statsInsights:"Insights",
    statsGraphs:"Graphs",
    pressure:"Pressure",
    tournamentPrep:"Tournament Preparation",
    abComparison:"A/B Comparison",
    drillComparison:"Drill Comparison",
    recommendationLearning:"Recommendation Learning v2",
    trainingPatterns:"Phase 1 Training Insights",
    aboveBelowExpectation:"Expected vs Actual Residuals",
    bestPerformanceWindow:"Session Peak Window",
    tableTimeEffects:"Context Effects",
    sessionFeel:"Reflection Intelligence",
    reflectionPatterns:"Reflection Patterns",
    skillMix:"Skill Map",
    performanceShifts:"Bayesian Change-Point Detection",
    expectedRange:"Target Credible Interval",
    smartPracticeBalance:"Bayesian Practice Optimization",
    difficultyGuidance:"Dynamic Difficulty Adjustment",
    mainWeakSpots:"Weakness Concentration",
    consistencyRisk:"Volatility Profile",
    tooEarly:"Insufficient evidence",
    earlySignal:"Low evidence",
    moderateSignal:"Moderate evidence",
    strongSignal:"Strong evidence",
    smartSessionBuilder:"Smart Session Builder v2",
    mentalLoad:"Cognitive Load",
    energyCost:"Fatigue Load",
    confidenceRisk:"Confidence Risk",
    switchingCost:"Context Switches",
    warmupCalibration:"Warm-up / Calibration",
    primarySkillBlock:"Primary Skill Block",
    carryoverBlock:"Transfer Block",
    pressureBlock:"Pressure / Robustness Block",
    finishStrong:"Confidence Finish",
    recoveryCalibration:"Recovery Calibration",
    lowSwitchPrimaryBlock:"Low-Switch Primary Block",
    completionBlock:"Completion Block",
    recommendationMode:"Recommendation Mode",
    drillSlots:"drill slots",
    targetDuration:"Target duration",
    loadedEstimate:"Loaded estimate",
    advancedAnalytics:"Advanced Analytics",
    posteriorUncertainty:"Posterior Uncertainty",
    posteriorDraw:"Posterior Draw",
    thompsonSampling:"Thompson Sampling",
    hierarchicalPriors:"Hierarchical Bayesian Priors",
    kalmanCurrentForm:"Kalman-Style Current Form",
    bayesianChangeProbability:"Bayesian Change Probability",
    credibleIntervalWidth:"Credible Interval Width",
    shrinkageEstimate:"Shrinkage Estimate",
    observationNoise:"Observation Noise",
    betaPosterior:"Beta Posterior",
    explorationBonus:"Exploration Bonus",
    priorSource:"Prior Source",
    feedbackTracked:"Feedback tracked",
    accepted:"accepted",
    skipped:"skipped",
    completed:"completed"
  }
};
const UI_EXPLANATIONS = {
  friendly: {
    insightLanguage:"Friendly uses coaching language. Analytical keeps the original model terminology.",
    bayesianOptimization:"Balances reliable routines with a controlled amount of useful exploration.",
    targetCredibleIntervals:"Shows the score range you should reasonably expect before changing difficulty.",
    currentForm:"Separates today's form from your longer-term ability.",
    adaptivePeriodization:"Checks whether your week is balanced across learning, testing, recovery, and maintenance.",
    maintenanceScheduler:"Flags skills that need a short refresh before they fade.",
    advancedAnalytics:"Shows the deeper model signals behind the coaching advice, using simpler language.",
    thompsonSampling:"Lets the app occasionally test useful drills when the upside is uncertain.",
    hierarchicalPriors:"Uses related skill history to set a fair starting baseline for low-sample drills.",
    kalmanCurrentForm:"Tracks current playing form without overreacting to one noisy session.",
    bayesianChangeProbability:"Estimates whether a recent shift looks real or just normal variation."
  },
  analytical: {
    insightLanguage:"Switches visible labels between coaching copy and technical analytics terminology.",
    bayesianOptimization:"Uses uncertainty-aware ranking and exploration/exploitation weighting.",
    targetCredibleIntervals:"Displays shrinkage-adjusted target ranges and uncertainty context.",
    currentForm:"Uses a guarded Kalman-style current-form estimate with observation noise adjustments.",
    adaptivePeriodization:"Compares recent block allocation with target periodization mix.",
    maintenanceScheduler:"Uses skill exposure, recency, and fading signals to estimate maintenance need.",
    advancedAnalytics:"Technical language for Bayesian, Kalman, Thompson, prior, and posterior components.",
    thompsonSampling:"Samples posterior upside to balance exploration and exploitation.",
    hierarchicalPriors:"Initializes drill-level estimates from skill-family and global user priors.",
    kalmanCurrentForm:"Uses a guarded Kalman-style filter where fatigue/focus affect observation noise.",
    bayesianChangeProbability:"Uses Bayesian-style change-point probability scoring with legacy fallback."
  }
};
function normalizeInsightLanguage(value){
  const v = String(value || "friendly").trim().toLowerCase();
  return v === "analytical" ? "analytical" : "friendly";
}
function getInsightLanguageSetting(){
  try { return normalizeInsightLanguage(localStorage.getItem(INSIGHT_LANGUAGE_KEY) || data?.interfaceSettings?.insightLanguage || "friendly"); }
  catch(e){ return "friendly"; }
}
function uiLabel(key){
  const mode = getInsightLanguageSetting();
  return (UI_LABELS[mode] && UI_LABELS[mode][key]) || (UI_LABELS.analytical && UI_LABELS.analytical[key]) || String(key || "");
}
function uiExplain(key){
  const mode = getInsightLanguageSetting();
  return (UI_EXPLANATIONS[mode] && UI_EXPLANATIONS[mode][key]) || (UI_EXPLANATIONS.analytical && UI_EXPLANATIONS.analytical[key]) || "";
}


/* v5.5.5 Recommendation explanation wording layer */
const UI_RECOMMENDATION_COPY = {
  friendly: {
    logicTitle: "Why this is suggested",
    nextFocusPrefix: "Try this next",
    reasonLabel: "Coach view",
    detailsLabel: "More detail",
    noHistoryTitle: "Start with one logged session.",
    noHistoryText: "Once you log a few drills, the app will suggest what to train next.",
    noEligible: "No suitable recommendation yet. Log more active routines or check exercise eligibility.",
    modeHeuristic: "Stable picks based on recent results, weak areas, and training balance.",
    modeThompson: "Adds controlled exploration so useful but less-tested drills are not ignored.",
    modeHybrid: "Blends reliable choices with a small amount of useful exploration.",
    fallbackReason: "balanced rotation"
  },
  analytical: {
    logicTitle: "Context-aware recommendation logic",
    nextFocusPrefix: "Recommended next focus",
    reasonLabel: "Reason",
    detailsLabel: "Model detail",
    noHistoryTitle: "Start logging exercises.",
    noHistoryText: "Recommendation will use target hit rate, recent trend, training allocation, and recommendation mode once you have history.",
    noEligible: "No eligible routine-level history yet. Check recommendation eligibility settings or log more active routines.",
    modeHeuristic: "Heuristic: stable ranking based on weakness, recency, undertraining, context, and True Skill signals.",
    modeThompson: "Thompson Sampling: samples each drill's upside and naturally balances confirmed weaknesses with useful exploration.",
    modeHybrid: "Hybrid: blends stable heuristic scoring, Thompson-style exploration, and Bayesian optimization guardrails so recommendations do not become too repetitive.",
    fallbackReason: "balanced rotation"
  }
};
function uiRecommendationCopy(key){
  const mode = getInsightLanguageSetting();
  return (UI_RECOMMENDATION_COPY[mode] && UI_RECOMMENDATION_COPY[mode][key]) || (UI_RECOMMENDATION_COPY.analytical && UI_RECOMMENDATION_COPY.analytical[key]) || String(key || "");
}

/* v5.5.5 Insight cards and stats language pass */
function uiSignalLabel(evidence){
  const level = typeof evidence === "string" ? evidence : String(evidence?.level || evidence?.label || "").toLowerCase();
  if (getInsightLanguageSetting() !== "friendly") return typeof evidence === "string" ? evidence : (evidence?.label || "Low evidence");
  if (level.includes("strong") || level.includes("reliable")) return uiLabel("strongSignal");
  if (level.includes("moderate")) return uiLabel("moderateSignal");
  if (level.includes("low") || level.includes("weak") || level.includes("early")) return uiLabel("earlySignal");
  return uiLabel("tooEarly");
}
function uiNoDataMessage(context="view"){
  return getInsightLanguageSetting() === "friendly"
    ? `No ${context} data yet. Complete a practice session to unlock coaching signals.`
    : `No data available for this ${context}. Log more observations to generate analytics.`;
}
function uiAdvancedTerm(term){
  if (getInsightLanguageSetting() !== "friendly") return term;
  const key = String(term || "").trim().toLowerCase();
  const map = {
    "bayesian practice optimization": uiLabel("smartPracticeBalance"),
    "bayesian optimization": uiLabel("smartPracticeBalance"),
    "thompson sampling": uiLabel("thompsonSampling"),
    "posterior draw": uiLabel("posteriorDraw"),
    "posterior uncertainty": uiLabel("posteriorUncertainty"),
    "posterior confidence": uiLabel("signalConfidence"),
    "posterior": uiLabel("betaPosterior"),
    "credible interval": uiLabel("expectedRange"),
    "credible intervals": uiLabel("expectedRange"),
    "target credible interval": uiLabel("expectedRange"),
    "hierarchical bayesian priors": uiLabel("hierarchicalPriors"),
    "personalized prior": uiLabel("priorSource"),
    "skill-family prior": uiLabel("priorSource"),
    "generic beta(2,2) prior": "generic baseline",
    "beta posterior": uiLabel("betaPosterior"),
    "kalman-style current form": uiLabel("kalmanCurrentForm"),
    "kalman-style": "form-tracking",
    "bayesian change-point detection": uiLabel("performanceShifts"),
    "bayesian probabilities": "shift likelihoods",
    "change-point probability": uiLabel("bayesianChangeProbability"),
    "posterior trend": "trend signal",
    "uncertainty": uiLabel("posteriorUncertainty"),
    "shrinkage": "stabilization",
    "shrunk estimate": uiLabel("shrinkageEstimate"),
    "observation noise": uiLabel("observationNoise"),
    "volatility": "consistency risk",
    "exploration bonus": uiLabel("explorationBonus")
  };
  return map[key] || term;
}
function uiAdvancedText(text){
  if (getInsightLanguageSetting() !== "friendly") return String(text || "");
  let out = String(text || "");
  const replacements = [
    [/Bayesian Practice Optimization/g, uiLabel("smartPracticeBalance")],
    [/Bayesian optimization/g, uiLabel("smartPracticeBalance")],
    [/Thompson Sampling/g, uiLabel("thompsonSampling")],
    [/Thompson-style/g, "exploration-style"],
    [/posterior draw/gi, uiLabel("posteriorDraw")],
    [/posterior uncertainty/gi, uiLabel("posteriorUncertainty")],
    [/posterior confidence/gi, uiLabel("signalConfidence")],
    [/credible interval width/gi, uiLabel("credibleIntervalWidth")],
    [/Target Credible Intervals v1/g, uiLabel("expectedRange")],
    [/Target credible interval/g, uiLabel("expectedRange")],
    [/credible interval/gi, uiLabel("expectedRange")],
    [/Hierarchical Bayesian Priors/g, uiLabel("hierarchicalPriors")],
    [/hierarchical priors/gi, uiLabel("hierarchicalPriors")],
    [/Personalized prior/gi, uiLabel("priorSource")],
    [/Skill-family prior/gi, uiLabel("priorSource")],
    [/Generic Beta\(2,2\) prior/gi, "generic baseline"],
    [/Beta\(2,2\)/g, "generic baseline"],
    [/Beta posterior/gi, uiLabel("betaPosterior")],
    [/Kalman-style current form/g, uiLabel("kalmanCurrentForm")],
    [/Kalman-style/gi, "form-tracking"],
    [/Bayesian Change-Point Detection/g, uiLabel("performanceShifts")],
    [/Bayesian probabilities/g, "shift likelihoods"],
    [/change-point scoring/gi, "shift scoring"],
    [/change-point detection/gi, "shift detection"],
    [/posterior trend/gi, "trend signal"],
    [/uncertainty-aware/gi, "confidence-aware"],
    [/uncertainty/gi, uiLabel("posteriorUncertainty")],
    [/shrinkage-adjusted/gi, "stabilized"],
    [/shrinkage/gi, "stabilization"],
    [/shrunk estimate/gi, uiLabel("shrinkageEstimate")],
    [/observation noise/gi, uiLabel("observationNoise")],
    [/volatility/gi, "consistency risk"],
    [/exploration bonus/gi, uiLabel("explorationBonus")],
    [/exploration\/exploitation/gi, "testing vs reinforcing"]
  ];
  return replacements.reduce((acc,[pattern,repl]) => acc.replace(pattern, String(repl)), out);
}

function uiInsightLanguageHtml(html){
  if (getInsightLanguageSetting() !== "friendly") return html;
  const replacements = [
    [/Phase 1 Training Insights/g, uiLabel("trainingPatterns")],
    [/Expected vs actual residuals/g, uiLabel("aboveBelowExpectation")],
    [/Expected vs actual/g, uiLabel("aboveBelowExpectation")],
    [/Session peak window/g, uiLabel("bestPerformanceWindow")],
    [/Peak window/g, uiLabel("bestPerformanceWindow")],
    [/Context effects/g, uiLabel("tableTimeEffects")],
    [/Reflection intelligence/g, uiLabel("sessionFeel")],
    [/Reflection patterns/g, uiLabel("reflectionPatterns")],
    [/Skill map/g, uiLabel("skillMix")],
    [/Bayesian Change-Point Detection/g, uiLabel("performanceShifts")],
    [/Change-point/g, uiLabel("performanceShifts")],
    [/Target Credible Intervals v1/g, uiLabel("expectedRange")],
    [/Target credible interval/g, uiLabel("expectedRange")],
    [/Dynamic Difficulty Adjustment v1/g, uiLabel("difficultyGuidance")],
    [/Dynamic difficulty/g, uiLabel("difficultyGuidance")],
    [/Bayesian Practice Optimization/g, uiLabel("smartPracticeBalance")],
    [/Thompson Sampling/g, uiLabel("thompsonSampling")],
    [/Posterior Uncertainty/g, uiLabel("posteriorUncertainty")],
    [/Posterior Draw/g, uiLabel("posteriorDraw")],
    [/Hierarchical Bayesian Priors/g, uiLabel("hierarchicalPriors")],
    [/Kalman-style Current Form/g, uiLabel("kalmanCurrentForm")],
    [/Bayesian Change Probability/g, uiLabel("bayesianChangeProbability")],
    [/Credible Interval Width/g, uiLabel("credibleIntervalWidth")],
    [/Shrinkage Estimate/g, uiLabel("shrinkageEstimate")],
    [/Observation Noise/g, uiLabel("observationNoise")],
    [/Beta Posterior/g, uiLabel("betaPosterior")],
    [/Exploration Bonus/g, uiLabel("explorationBonus")],
    [/Weakness Concentration/g, uiLabel("mainWeakSpots")],
    [/Performance Stability/g, uiLabel("performanceStability")],
    [/Second-order analytics/g, uiLabel("secondOrderAnalytics")],
    [/Evidence Strength/g, uiLabel("signalConfidence")],
    [/low evidence/gi, uiLabel("earlySignal")],
    [/moderate evidence/gi, uiLabel("moderateSignal")],
    [/strong evidence/gi, uiLabel("strongSignal")],
    [/insufficient evidence/gi, uiLabel("tooEarly")]
  ];
  return replacements.reduce((acc,[pattern,repl]) => acc.replace(pattern, htmlText(repl)), html);
}
function recommendationModeSummaryForUI(mode) {
  if (getInsightLanguageSetting() === "friendly") {
    if (mode === "thompson") return uiRecommendationCopy("modeThompson");
    if (mode === "hybrid") return uiRecommendationCopy("modeHybrid");
    return uiRecommendationCopy("modeHeuristic");
  }
  return recommendationModeSummary(mode);
}
function friendlySelectionType(value){
  const v = String(value || "").toLowerCase();
  if (v.includes("exploration")) return "Explore";
  if (v.includes("exploitation")) return "Reinforce";
  if (v.includes("data")) return "Build evidence";
  return value || "Balanced";
}
function friendlyEvidenceLabel(value){
  const v = String(value || "").toLowerCase();
  if (v.includes("strong")) return "Reliable signal";
  if (v.includes("moderate")) return "Moderate signal";
  if (v.includes("low") || v.includes("early")) return "Early signal";
  return value || "Signal building";
}
function friendlyRecommendationReason(reason){
  const raw = String(reason || "").trim();
  const r = raw.toLowerCase();
  if (!raw) return "";
  if (r.includes("maintenance") || r.includes("decay") || r.includes("undertrained") || r.includes("low exposure")) return "Refresh this skill before it fades.";
  if (r.includes("transfer") || r.includes("upstream") || r.includes("downstream")) return "This drill should carry over into other useful skills.";
  if (r.includes("confidence") && (r.includes("low") || r.includes("risk") || r.includes("preserv"))) return "Good choice for rebuilding confidence without too much risk.";
  if (r.includes("volatility") && r.includes("high")) return "Use with care: this drill can swing results sharply.";
  if (r.includes("volatility")) return "Stable enough for today’s training state.";
  if (r.includes("fatigue") || r.includes("energy")) return "Fits your current energy level.";
  if (r.includes("recovery")) return "Selected to keep the session controlled and confidence-safe.";
  if (r.includes("pressure")) return "Useful pressure test at the right point in the session.";
  if (r.includes("target") || r.includes("difficulty") || r.includes("progression")) return "Difficulty looks ready for adjustment.";
  if (r.includes("regression") || r.includes("simplify")) return "Make the drill easier until execution stabilizes.";
  if (r.includes("post-recommendation") || r.includes("recommendation learning") || r.includes("completed recommendations")) return "Your previous feedback suggests this type of recommendation is useful.";
  if (r.includes("context") || r.includes("table") || r.includes("time")) return "The current context supports this choice.";
  if (r.includes("thompson") || r.includes("exploration") || r.includes("uncertainty")) return "Worth testing because the upside is still uncertain.";
  if (r.includes("skill") || r.includes("weak")) return "Targets a current weak area.";
  return raw;
}
function recommendationReasonListForUI(reasons, max=3){
  const mode = getInsightLanguageSetting();
  const source = Array.isArray(reasons) ? reasons : [];
  const mapped = source.map(r => mode === "friendly" ? friendlyRecommendationReason(r) : String(r || "").trim()).filter(Boolean);
  return [...new Set(mapped)].slice(0, max);
}
function primaryRecommendationAction(top){
  if (!top) return "Train this next.";
  if (getInsightLanguageSetting() !== "friendly") return null;
  if (top.maintenanceFit && Number(top.maintenanceFit.score || 0) > 8) return "Refresh this before it fades.";
  if (top.transferNeed && Number(top.transferNeed.score || 0) > 8) return "Use this as a high-carryover drill.";
  if (top.selectionType === "exploration") return "Test this today with controlled volume.";
  if (top.selectionType === "exploitation") return "Reinforce this because the signal is reliable.";
  if ((top.volatilityProfile?.level || "") === "high") return "Use this carefully and keep the set short.";
  return "Use this as the next focused block.";
}
function setInsightLanguageSetting(value){
  const clean = normalizeInsightLanguage(value);
  try { localStorage.setItem(INSIGHT_LANGUAGE_KEY, clean); } catch(e) {}
  try {
    data.interfaceSettings = data.interfaceSettings || {};
    data.interfaceSettings.insightLanguage = clean;
    if (typeof saveCoreData === "function") saveCoreData("insight language setting save");
  } catch(e) { try { logAppError(e, "setInsightLanguageSetting"); } catch(_){} }
  return clean;
}

// v4.39.0 hardening: keep missing/renamed DOM nodes and fragile panels from killing bootstrap.
function safeOn(id, eventName, handler, options) {
  const el = typeof id === "string" ? $(id) : id;
  if (!el || typeof el.addEventListener !== "function") return false;
  el.addEventListener(eventName, handler, options);
  return true;
}
function safeCall(label, fn, fallback) {
  try {
    return typeof fn === "function" ? fn() : fallback;
  } catch (error) {
    try { logAppError(error, label || "safeCall"); } catch (_) { console.error(label || "safeCall", error); }
    return fallback;
  }
}
function finiteOr(value, fallback=0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function safeRenderAll(context="safeRenderAll") {
  try {
    renderAll();
    return true;
  } catch (error) {
    try { logAppError(error, context); } catch (_) { console.error(context, error); }
    return false;
  }
}
function normalizeStatsRoutineFilter(value) {
  const v = String(value || "all");
  return v && v !== "" ? v : "all";
}
function setStatsRoutineFilter(value, options = {}) {
  statsRoutineFilterId = normalizeStatsRoutineFilter(value);
  localStorage.setItem(STATS_ROUTINE_FILTER_KEY, statsRoutineFilterId);
  const select = $("statsRoutineSelect");
  if (select && select.value !== statsRoutineFilterId) {
    select.value = statsRoutineFilterId;
    if (select.value !== statsRoutineFilterId) {
      const opt = document.createElement("option");
      opt.value = statsRoutineFilterId;
      const r = routineById(statsRoutineFilterId);
      opt.textContent = r ? r.name : "Selected exercise";
      select.appendChild(opt);
      select.value = statsRoutineFilterId;
    }
  }
  if (!options.silent) {
    renderStats();
    renderPhaseOneInsights();
  }
}

function migrateData(d) {
  d.appVersion = APP_VERSION;
  d.routinePackImports = Array.isArray(d.routinePackImports) ? d.routinePackImports : [];
  d.routines = (d.routines || []).map(r => ({
    ...r,
    folder: r.folder || r.category || "Unfiled",
    subfolder: r.subfolder || "General",
    category: r.category || "uncategorized",
    stretchTarget: r.stretchTarget || "",
    canonicalId: normalizeRoutineCanonicalId(r.canonicalId || r.catalogueId || r.packRoutineId || r.id || r.name),
    routinePackSource: r.routinePackSource || r.packSource || "",
    routinePackVersion: r.routinePackVersion || r.packVersion || "",
    metadataVersion: Number(r.metadataVersion || 1),
    isCatalogueRoutine: !!(r.isCatalogueRoutine || r.canonicalId || r.catalogueId),
    isDeleted: !!r.isDeleted,
    deletedAt: r.deletedAt || "",
    sideMode: normalizeSideMode(r.sideMode || r.sideSplitMode || r.sideSplit || "none"),
    attemptMode: routineUsesSideSplit(r) ? normalizeAttemptMode(r.attemptMode || r.sideAttemptMode || r.leftRightAttemptMode || "shared") : "shared"
  }));
  d.routines = (d.routines || []).map(r => ensureTargetHistory(r));
  d.plans = d.plans || [];
  d.tagHistory = d.tagHistory || [];
  d.interfaceSettings = d.interfaceSettings || {};
  // Interface settings are intentionally stored both as top-level localStorage keys
  // and inside the main data object. Top-level keys take priority because they
  // survive data imports and prevent old JSON backups from reverting the UI.
  d.interfaceSettings.themeMode = normalizeInterfaceThemeMode(localStorage.getItem(THEME_MODE_KEY) || d.interfaceSettings.themeMode || "system");
  d.interfaceSettings.sessionFocusMode = localStorage.getItem(SESSION_FOCUS_MODE_KEY) || d.interfaceSettings.sessionFocusMode || "on";
  d.interfaceSettings.quickLogAutoAdvance = localStorage.getItem(QUICK_LOG_AUTO_ADVANCE_KEY) || d.interfaceSettings.quickLogAutoAdvance || "on";
  d.interfaceSettings.displayDensity = normalizeDisplayDensity(localStorage.getItem(DISPLAY_DENSITY_KEY) || d.interfaceSettings.displayDensity || "comfortable");
  d.interfaceSettings.insightLanguage = normalizeInsightLanguage(localStorage.getItem(INSIGHT_LANGUAGE_KEY) || d.interfaceSettings.insightLanguage || "friendly");
  d.interfaceSettings.timerAutostart = normalizeTimerAutostart(localStorage.getItem(TIMER_AUTOSTART_KEY) || d.interfaceSettings.timerAutostart || "manual");
  d.interfaceSettings.timerAutostartDelaySeconds = normalizeTimerAutostartDelay(localStorage.getItem(TIMER_AUTOSTART_DELAY_KEY) || d.interfaceSettings.timerAutostartDelaySeconds || 0);
  d.interfaceSettings.wakeLock = normalizeWakeLock(localStorage.getItem(WAKE_LOCK_KEY) || d.interfaceSettings.wakeLock || "off");
  d.sessions = d.sessions || [];
  d.logs = (d.logs || []).map(l => {
    const migrated = {
      sessionId: l.sessionId || uuid(),
      sessionName: l.sessionName || "Legacy session",
      sessionType: l.sessionType || "plan",
      folder: l.folder || "Unfiled",
      subfolder: l.subfolder || "General",
      category: l.category || "uncategorized",
      sessionRating: l.sessionRating || "",
      sessionTags: l.sessionTags || "",
      performance: l.performance || "N/A",
      ...l
    };
    if (logUsesSideSplit(migrated)) {
      const left = getLogLeftSideScore(migrated);
      const right = getLogRightSideScore(migrated);
      migrated.leftSideScore = Number.isFinite(left) ? left : 0;
      migrated.rightSideScore = Number.isFinite(right) ? right : 0;
      migrated.sideMode = normalizeSideMode(migrated.sideMode || migrated.sideSplitMode || migrated.sideSplit || "left_right");
      migrated.sideSplitEnabled = true;
      migrated.attemptMode = normalizeAttemptMode(migrated.attemptMode || migrated.sideAttemptMode || migrated.leftRightAttemptMode || "shared");
      migrated.effectiveAttempts = effectiveLogAttempts(migrated);
      migrated.sideScores = {left:migrated.leftSideScore, right:migrated.rightSideScore};
      migrated.score = computeSideCombinedScore(migrated.leftSideScore, migrated.rightSideScore);
      migrated.normalizedScore = normalizeScore(migrated);
    } else {
      migrated.attemptMode = normalizeAttemptMode(migrated.attemptMode || "shared");
      migrated.effectiveAttempts = effectiveLogAttempts(migrated);
      migrated.normalizedScore = Number(migrated.normalizedScore || normalizeScore(migrated));
    }
    return migrated;
  });
  // Lightweight session layer: rebuild missing session records from logs
  const existingSessionIds = new Set((d.sessions || []).map(s => s.id));
  const grouped = Object.create(null);
  d.logs.forEach(l => {
    if (!l.sessionId) return;
    if (!grouped[l.sessionId]) grouped[l.sessionId] = [];
    grouped[l.sessionId].push(l);
  });
  Object.entries(grouped).forEach(([sid, logs]) => {
    if (!existingSessionIds.has(sid)) {
      const first = logs.slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt))[0];
      d.sessions.push({
        id: sid,
        name: first.sessionName || "Legacy session",
        type: first.sessionType || "legacy",
        startedAt: first.createdAt,
        endedAt: logs.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0].createdAt,
        logIds: logs.map(l => l.id),
        plannedRoutineIds: [...new Set(logs.map(l => l.routineId).filter(Boolean))]
      });
    }
  });
  d.skillTaxonomy = normalizeSkillTaxonomy(d.skillTaxonomy || defaultSkillTaxonomy());
  activeSkillTaxonomyForNormalization = d.skillTaxonomy;
  d.routineSkillMap = d.routineSkillMap || {};
  d.skillTrendCache = d.skillTrendCache || {};
  d.recommendationFeedback = Array.isArray(d.recommendationFeedback) ? d.recommendationFeedback : [];
  d.smartSessionBuilder = d.smartSessionBuilder || {version:"v2"};
  d.routines.forEach(r => { d.routineSkillMap[r.id] = normalizeRoutineSkillMap(r, d.routineSkillMap[r.id]); });
  const routineLookup = new Map((d.routines || []).map(r => [String(r.id), r]));
  d.logs = (d.logs || []).map(l => {
    const r = routineLookup.get(String(l.routineId || ""));
    return r ? applySkillSnapshotToLog(l, r, d.routineSkillMap[r.id]) : l;
  });
  return d;
}

function loadData() {
  let raw = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      for (const k of OLD_KEYS) {
        const old = localStorage.getItem(k);
        if (old) { raw = old; break; }
      }
    }
    if (!raw) {
      const seeded = structuredCloneSafe(defaultData);
      seeded.plans.push({
        id: uuid(),
        name: "Default 60 min practice",
        routineIds: seeded.routines.map(r => r.id),
        createdAt: new Date().toISOString()
      });
      safeStorageSet(STORAGE_KEY, JSON.stringify(seeded), "loadData seed");
      return seeded;
    }
    const parsedRaw = safeParseData(raw);
    if (!parsedRaw) throw new Error("Stored app data is not valid JSON.");
    const parsed = migrateData(parsedRaw);
    // Do not compact localStorage here. Hydration migrates legacy logs/sessions to IndexedDB first.
    return parsed;
  } catch(e) {
    logAppError(e, "loadData");
    if (raw) {
      try { localStorage.setItem(STORAGE_KEY + ".corrupted_backup", raw); } catch(ex) { try { logAppError(ex, "loadData corrupted backup quarantine"); } catch(_) {} }
    }
    const fallback = raw ? safeParseData(raw) : null;
    if (fallback) {
      console.warn("Startup migration warning suppressed: readable data was preserved and the app loaded from the existing payload.", e);
      return fallback;
    }
    notifyUser("Startup/migration issue detected. Stored data could not be read. Export Debug Info and Raw Local Data before making changes.", "warn");
    return structuredCloneSafe(defaultData);
  }
}

function saveData(options = {}) {
  const opts = typeof options === "string" ? {render: options} : (options || {});
  if (storageReadOnlyMode && !opts.allowReadOnlyCleanup) {
    notifyUser("Storage is in read-only/export mode. Export a backup and free device storage before saving new changes.", "warn");
    renderAfterSave(opts.render || "all");
    return false;
  }
  if (!indexedDBReady && !indexedDBUnavailable) {
    console.warn("saveData queued until IndexedDB hydration completes.");
    queuePreHydrationState(opts);
    renderAfterSave(opts.render || "all");
    return true;
  }
  data.updatedAt = new Date().toISOString();
  if (!opts.skipPerformanceInvalidation) invalidateLogsByRoutineCache();
  data.interfaceSettings = data.interfaceSettings || {};
  data.interfaceSettings.themeMode = getThemeModeSetting();
  data.interfaceSettings.sessionFocusMode = getSessionFocusSetting();
  data.interfaceSettings.quickLogAutoAdvance = getQuickLogAutoAdvanceSetting();
  data.interfaceSettings.displayDensity = getDisplayDensitySetting();
  data.interfaceSettings.insightLanguage = getInsightLanguageSetting();
  data.interfaceSettings.timerAutostart = getTimerAutostartSetting();
  data.interfaceSettings.timerAutostartDelaySeconds = getTimerAutostartDelaySetting();
  data.interfaceSettings.wakeLock = getWakeLockSetting();
  ensureTablesDatabase?.();
  const ok = saveCoreData("saveData core", !!opts.allowReadOnlyCleanup);
  if (opts.idbSync !== "skip") scheduleIndexedDBSync("saveData indexedDB sync", !!opts.immediateIDB);
  if (ok) renderStorageWarning();
  const renderMode = opts.render || "all";
  flushFailedIndexedDBDeltas("saveData retry pending deltas");
  renderAfterSave(renderMode);
  return ok;
}

function isPanelActive(panelId) {
  return !!$(panelId)?.classList.contains("active");
}
function shouldRenderStatsPanel() {
  return isPanelActive("stats");
}
function renderStatsIfVisible(reason="renderStatsIfVisible") {
  if (!shouldRenderStatsPanel()) return;
  safeCall(`${reason} renderStats`, renderStats);
}
function renderStatsHeavyPanelsIfVisible(reason="renderStatsHeavyPanelsIfVisible") {
  if (!shouldRenderStatsPanel()) return;
  safeCall(`${reason} renderPhaseOneInsights`, renderPhaseOneInsights);
  safeCall(`${reason} renderBayesianAnalyticsValidation`, renderBayesianAnalyticsValidation);
  safeCall(`${reason} renderTrainingLoad`, renderTrainingLoad);
  safeCall(`${reason} renderWeeklyReview`, renderWeeklyReview);
  safeCall(`${reason} renderABComparison`, renderABComparison);
}
function renderStatsBundleIfVisible(reason="renderStatsBundleIfVisible") {
  renderStatsIfVisible(reason);
  renderStatsHeavyPanelsIfVisible(reason);
}

function renderAfterSave(mode = "all") {
  if (mode === "none") return;
  if (mode === "sessionLog") return renderAfterSessionLogSave();
  if (mode === "logEdit") return renderAfterLogEditSave();
  renderAll();
}

function safeScopedRender(fn, label) {
  try { if (typeof fn === "function") fn(); }
  catch(e) { logAppError?.(e, label || "safeScopedRender"); }
}

function renderAfterSessionLogSave() {
  safeScopedRender(renderBackupReminder, "renderAfterSessionLogSave renderBackupReminder");
  if (isPanelActive("data")) safeScopedRender(renderStorageDashboard, "renderAfterSessionLogSave renderStorageDashboard");
  safeScopedRender(renderSmartRecommendation, "renderAfterSessionLogSave renderSmartRecommendation");
  safeScopedRender(renderTagSuggestions, "renderAfterSessionLogSave renderTagSuggestions");
  safeScopedRender(renderResumeCard, "renderAfterSessionLogSave renderResumeCard");
  safeScopedRender(renderTodayResumeCard, "renderAfterSessionLogSave renderTodayResumeCard");
  if (isPanelActive("today")) {
    safeScopedRender(renderToday, "renderAfterSessionLogSave renderToday");
    safeScopedRender(renderTrainingLoad, "renderAfterSessionLogSave renderTrainingLoad");
  }
  if (isPanelActive("stats")) {
    safeScopedRender(renderStats, "renderAfterSessionLogSave renderStats");
    safeScopedRender(renderPhaseOneInsights, "renderAfterSessionLogSave renderPhaseOneInsights");
    safeScopedRender(renderABComparison, "renderAfterSessionLogSave renderABComparison");
  }
  safeScopedRender(updateSessionFocusState, "renderAfterSessionLogSave updateSessionFocusState");
}

function renderAfterLogEditSave() {
  safeScopedRender(renderTagSuggestions, "renderAfterLogEditSave renderTagSuggestions");
  safeScopedRender(renderBackupReminder, "renderAfterLogEditSave renderBackupReminder");
  if (isPanelActive("data")) safeScopedRender(renderStorageDashboard, "renderAfterLogEditSave renderStorageDashboard");
  if (isPanelActive("today")) {
    safeScopedRender(renderToday, "renderAfterLogEditSave renderToday");
    safeScopedRender(renderTrainingLoad, "renderAfterLogEditSave renderTrainingLoad");
  }
  if (isPanelActive("stats")) {
    safeScopedRender(renderStats, "renderAfterLogEditSave renderStats");
    safeScopedRender(renderPhaseOneInsights, "renderAfterLogEditSave renderPhaseOneInsights");
    safeScopedRender(renderABComparison, "renderAfterLogEditSave renderABComparison");
  }
  if (isPanelActive("practice")) {
    safeScopedRender(renderSmartRecommendation, "renderAfterLogEditSave renderSmartRecommendation");
  }
  safeScopedRender(updateSessionFocusState, "renderAfterLogEditSave updateSessionFocusState");
}

function fmtScoring(type) {
  return {
    raw:"Raw score",
    success_rate:"Success rate",
    highest_break:"Highest break",
    points:"Points system",
    score_per_minute:"Time-based score",
    progressive_completion:"Progressive completion"
  }[type] || type;
}
function activeRoutines() { return (data.routines || []).filter(r => !r.isDeleted); }
function recommendationEligibleRoutines() { return activeRoutines().filter(isRecommendationEligible); }
function categories() { return [...new Set(activeRoutines().map(r => r.category || "uncategorized"))].sort(); }
function folders() { return [...new Set(activeRoutines().map(r => r.folder || "Unfiled"))].sort(); }
function subfolders() { return [...new Set(activeRoutines().map(r => r.subfolder || "General"))].sort(); }
function routineById(id) { return (data.routines || []).find(r => String(r.id) === String(id)); }

function favoriteRoutineIds() { return new Set(data.favoriteRoutineIds || []); }
function isFavoriteRoutine(id) { return favoriteRoutineIds().has(id); }
function toggleFavoriteRoutine(id) {
  data.favoriteRoutineIds = data.favoriteRoutineIds || [];
  if (data.favoriteRoutineIds.includes(id)) data.favoriteRoutineIds = data.favoriteRoutineIds.filter(x => x !== id);
  else data.favoriteRoutineIds.push(id);
  saveData({render:"all", immediateIDB:true});
}
function recentRoutineIds(limit=8) {
  const ids = [];
  (data.logs || []).slice().sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0)).forEach(l => {
    if (l.routineId && !ids.includes(l.routineId) && routineById(l.routineId) && !routineById(l.routineId).isDeleted) ids.push(l.routineId);
  });
  return ids.slice(0, limit);
}

function lastRoutineSetupSummary(routineId) {
  const logs = (data.logs || [])
    .filter(l => String(l.routineId || "") === String(routineId || ""))
    .sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const last = logs[0];
  if (!last) {
    const r = routineById(routineId);
    if (!r) return "No previous log";
    const bits = [];
    if (r.attempts) bits.push(`${numText(r.attempts)} attempts`);
    if (r.duration) bits.push(`${numText(r.duration)} min`);
    if (r.target) bits.push(`target ${numText(r.target)}`);
    return bits.length ? `Setup: ${bits.join(" · ")}` : "No previous log";
  }
  const d = shortSessionDateLabel(last.createdAt) || "last session";
  const bits = [`Last ${d}`];
  try { bits.push(displayScore(last)); } catch(e) { if (last.score !== undefined) bits.push(`score ${numText(last.score)}`); }
  if (last.attempts) bits.push(`${numText(last.attempts)} attempts`);
  if (last.timeMinutes) bits.push(`${numText(last.timeMinutes)} min`);
  const table = last.venueTable || last.tableName || last.tableId || "";
  if (table) bits.push(`table ${table}`);
  return bits.join(" · ");
}
function getLastLogForRoutine(routineId) {
  return (data.logs || []).filter(l => l.routineId === routineId).sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))[0] || null;
}

function successRateLogsForRoutine(routineId){
  const rid = String(routineId || "");
  return (data.logs || []).filter(l => String(l.routineId || "") === rid && l.scoring === "success_rate");
}
function primarySkillForRoutineOrLog(item){
  if(!item) return "uncategorized";
  const direct = normalizeSkillId(item.primarySkill || "");
  if(direct && direct !== "uncategorized") return direct;
  const rid = item.routineId || item.id;
  const routine = routineById(rid);
  return normalizeSkillId(routine ? getRoutineSkillMap(routine).primarySkill : "uncategorized");
}
function betaPriorFromAggregate(agg, strength, meta){
  const attempts = Math.max(0, Number(agg?.attempts || 0));
  const successes = Math.max(0, Number(agg?.successes || 0));
  const mean = attempts > 0 ? Math.max(0.02, Math.min(0.98, successes / attempts)) : 0.5;
  const priorStrength = Math.max(2, Number(strength || 4));
  return {
    alpha:mean * priorStrength,
    beta:(1 - mean) * priorStrength,
    mean,
    strength:priorStrength,
    attempts,
    sessions:Number(agg?.sessions || 0),
    source:meta?.source || "generic",
    label:meta?.label || "Generic Beta(2,2) prior",
    detail:meta?.detail || "Used when personalized evidence is insufficient."
  };
}
function genericBayesianPrior(){
  return {alpha:2, beta:2, mean:0.5, strength:4, attempts:0, sessions:0, source:"generic", label:"Generic Beta(2,2) prior", detail:"Fallback used until skill or user-level evidence is sufficient."};
}
function hierarchicalPriorForRoutine(routine){
  try {
    if(!routine || routine.scoring !== "success_rate") return genericBayesianPrior();
    const rid = String(routine.id || "");
    const primary = getRoutineSkillMap(routine).primarySkill || "uncategorized";
    const skillLogs = (data.logs || []).filter(l => l.scoring === "success_rate" && String(l.routineId || "") !== rid && primarySkillForRoutineOrLog(l) === primary);
    const skillAgg = aggregateSuccessRateLogs(skillLogs);
    if(Number(skillAgg.rawAttempts || skillAgg.attempts || 0) >= 20 && Number(skillAgg.sessions || 0) >= 2){
      const strength = Math.max(6, Math.min(40, Number(skillAgg.attempts || 0) * 0.25));
      return betaPriorFromAggregate(skillAgg, strength, {
        source:"skill_family",
        label:`Skill-family prior: ${skillLabel(primary)}`,
        detail:`Initialized from ${numText(skillAgg.rawAttempts || skillAgg.attempts, "0")} attempts across related ${skillLabel(primary)} drills.`
      });
    }
    const globalLogs = (data.logs || []).filter(l => l.scoring === "success_rate" && String(l.routineId || "") !== rid);
    const globalAgg = aggregateSuccessRateLogs(globalLogs);
    if(Number(globalAgg.rawAttempts || globalAgg.attempts || 0) >= 30 && Number(globalAgg.sessions || 0) >= 3){
      const strength = Math.max(5, Math.min(30, Number(globalAgg.attempts || 0) * 0.15));
      return betaPriorFromAggregate(globalAgg, strength, {
        source:"global_user",
        label:"Global user prior",
        detail:`Initialized from ${numText(globalAgg.rawAttempts || globalAgg.attempts, "0")} success-rate attempts across your logged drills.`
      });
    }
    return genericBayesianPrior();
  } catch(e) {
    logAppError?.(e, "hierarchicalPriorForRoutine");
    return genericBayesianPrior();
  }
}
function bayesianPriorReason(prior){
  if(!prior) return "Personalized prior: generic fallback";
  if(prior.source === "skill_family") return `Personalized prior: calibrated from ${prior.label.replace(/^Skill-family prior: /, "")} history`;
  if(prior.source === "global_user") return "Personalized prior: calibrated from your global success-rate history";
  return "Personalized prior: generic fallback until more evidence exists";
}
function personalizedPriorsInsight(){
  try {
    const rows = (data.routines || [])
      .filter(r => r && !r.archived && r.scoring === "success_rate")
      .map(r => ({routine:r, prior:hierarchicalPriorForRoutine(r)}))
      .filter(x => x.prior && x.prior.source !== "generic")
      .sort((a,b)=>Number(b.prior.attempts||0)-Number(a.prior.attempts||0))
      .slice(0,4);
    if(!rows.length) return `<div class="insight-card watch"><strong>${htmlText(uiLabel("personalizedPriors"))}</strong><div class="muted small">${htmlText(uiAdvancedText("No skill-family priors yet. The app will use a generic Beta(2,2) fallback until more success-rate evidence exists."))}</div></div>`;
    return `<div class="insight-card watch"><strong>${htmlText(uiLabel("personalizedPriors"))}</strong><div class="muted small">${htmlText(uiAdvancedText("New or low-sample drills inherit calibrated baselines from related skill history before drill-specific evidence takes over."))}</div>${rows.map(x=>`<div class="context-row"><span>${htmlText(x.routine.name || "Exercise")}</span><strong>${htmlText(x.prior.source === "skill_family" ? "Skill prior" : "Global prior")}</strong><span>${htmlText(formatPercent(x.prior.mean))} baseline · ${numText(x.prior.attempts,"0")} attempts</span></div>`).join("")}</div>`;
  } catch(e) {
    logAppError?.(e, "personalizedPriorsInsight");
    return `<div class="insight-card watch"><strong>${htmlText(uiLabel("personalizedPriors"))}</strong><div class="muted small">Personalized prior insight unavailable for this scope.</div></div>`;
  }
}

function bayesianStatsForRoutine(routineOrId) {
  const r = typeof routineOrId === "object" && routineOrId ? routineOrId : routineById(routineOrId);
  const routineId = r?.id || routineOrId;
  if (!r || r.scoring !== "success_rate") return null;
  const logs = successRateLogsForRoutine(routineId);
  const agg = aggregateSuccessRateLogs(logs);
  const prior = hierarchicalPriorForRoutine(r);
  const posterior = betaPosterior(agg.successes, agg.attempts, prior.alpha, prior.beta, {...prior, rawAttempts:agg.rawAttempts, rawSuccesses:agg.rawSuccesses});
  const reliability = bayesianReliabilityLabel(posterior);
  const signal = bayesianRecommendationSignal({posterior, targetPct:Number(r.target || 0)});
  const policy = bayesianActionPolicy(signal, posterior, Number(r.target || 0));
  return {agg, prior, posterior, reliability, signal, policy};
}
function applyLastScoreSetup() {
  if (!activeSession) return;
  const r = routineById(activeSession.routineIds[activeSession.index]);
  if (!r) return;
  const last = getLastLogForRoutine(r.id);
  if (!last) return alert("No previous log for this exercise yet.");
  const setAndDispatch = (id, val) => {
    const el = $(id);
    if (!el) return;
    el.value = val ?? "";
    try { el.dispatchEvent(new Event("input", {bubbles:true})); } catch(e) {}
    try { el.dispatchEvent(new Event("change", {bubbles:true})); } catch(e) {}
  };
  setAndDispatch("scoreValue", Number(last.score || 0));
  setAndDispatch("attemptsValue", Number(last.attempts || last.attemptsPerSessionAtLog || r.attempts || 0));
  setAndDispatch("manualTimeValue", Number(last.timeMinutes || r.duration || 0));
  setAndDispatch("leftSideScoreValue", last.leftSideScore ?? last.sideLeftScore ?? last.sideScores?.left ?? "");
  setAndDispatch("rightSideScoreValue", last.rightSideScore ?? last.sideRightScore ?? last.sideScores?.right ?? "");
  setAndDispatch("bestAttemptValue", last.bestAttempt ?? "");
  setAndDispatch("completionCountValue", last.completionCount ?? "");
  setAndDispatch("highestBreakValue", last.highestBreak ?? "");
  setAndDispatch("sessionTotalUnitsValue", last.totalUnitsAtLog || last.totalUnits || r.totalUnits || "");
  if ($("practiceNotes") && last.notes) $("practiceNotes").value = last.notes;
  refreshCurrentRoutineLivePerformance();
}


function normalizeSideMode(value) {
  return value === "left_right" || value === "lr" || value === "side_split" ? "left_right" : "none";
}
function routineUsesSideSplit(r) {
  return normalizeSideMode(r?.sideMode || r?.sideSplitMode || r?.sideSplit) === "left_right";
}
function normalizeAttemptMode(value) {
  return value === "per_side" || value === "perSide" || value === "side" ? "per_side" : "shared";
}
function getRoutineAttemptMode(r) {
  return routineUsesSideSplit(r) ? normalizeAttemptMode(r?.attemptMode || r?.sideAttemptMode || r?.leftRightAttemptMode || "shared") : "shared";
}
function getLogAttemptMode(log) {
  return logUsesSideSplit(log) ? normalizeAttemptMode(log?.attemptMode || log?.sideAttemptMode || log?.leftRightAttemptMode || "shared") : "shared";
}
function effectiveLogAttempts(log) {
  const attempts = Number(log?.attempts || 0);
  if (!attempts || attempts < 0) return 0;
  return logUsesSideSplit(log) && getLogAttemptMode(log) === "per_side" ? attempts * 2 : attempts;
}
function attemptModeLabel(mode) {
  return normalizeAttemptMode(mode) === "per_side" ? "per side" : "total";
}
function validateSideSuccessRateInputs({left, right, attempts, attemptMode}) {
  const l = Number(left || 0);
  const r = Number(right || 0);
  const a = Number(attempts || 0);
  if (!a || a < 0) return "Enter attempts.";
  if (l < 0 || r < 0) return "Left and right side scores cannot be negative.";
  if (normalizeAttemptMode(attemptMode) === "per_side") {
    if (l > a || r > a) return "For per-side mode, each side score must be less than or equal to the Attempts value.";
  } else if (l + r > a) {
    return "For shared mode, Left + Right must be less than or equal to total Attempts.";
  }
  return "";
}
function getLogLeftSideScore(log) {
  const raw = log?.leftSideScore ?? log?.sideLeftScore ?? log?.sideScores?.left ?? "";
  return raw === "" || raw === null || raw === undefined ? "" : Number(raw);
}
function getLogRightSideScore(log) {
  const raw = log?.rightSideScore ?? log?.sideRightScore ?? log?.sideScores?.right ?? "";
  return raw === "" || raw === null || raw === undefined ? "" : Number(raw);
}
function logUsesSideSplit(log) {
  return !!(log?.sideSplitEnabled || normalizeSideMode(log?.sideMode || log?.sideSplitMode || log?.sideSplit) === "left_right" || log?.sideScores || log?.leftSideScore !== undefined || log?.rightSideScore !== undefined || log?.sideLeftScore !== undefined || log?.sideRightScore !== undefined);
}
function computeSideCombinedScore(left, right) {
  const l = Number(left || 0);
  const r = Number(right || 0);
  return Math.round((l + r) * 100) / 100;
}
function effectiveLogScore(log) {
  if (logUsesSideSplit(log)) {
    const left = getLogLeftSideScore(log);
    const right = getLogRightSideScore(log);
    if (Number.isFinite(left) || Number.isFinite(right)) return computeSideCombinedScore(Number.isFinite(left) ? left : 0, Number.isFinite(right) ? right : 0);
  }
  return Number(log?.score || 0);
}

function normalizeScore(log) {
  const score = effectiveLogScore(log);
  if (log.scoring === "progressive_completion") return Number(log.totalUnitsAtLog || log.totalUnits || 0) > 0 ? (score / Number(log.totalUnitsAtLog || log.totalUnits || 0)) * 100 : 0;
  if (log.scoring === "success_rate") {
    const attempts = effectiveLogAttempts(log);
    return attempts > 0 ? (score / attempts) * 100 : 0;
  }
  if (log.scoring === "score_per_minute") return Number(log.timeMinutes || 0) > 0 ? score / Number(log.timeMinutes || 0) : 0;
  return score;
}
function classifyPerformance(log, routine) {
  const p = getActiveTargetProfile(routine);
  return classifyPerformanceAgainstTarget(log.normalizedScore, log.targetAtLog || p?.target || routine?.target, log.stretchTargetAtLog || p?.stretchTarget || routine?.stretchTarget);
}

function localDateKey(dateLike = new Date()) {
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function sameDate(log, dateKey) { return localDateKey(log.createdAt) === dateKey; }
const SYSTEM_ALL_VALUE = "__SYSTEM_ALL__";
function isSystemAll(value) { return value === "all" || value === SYSTEM_ALL_VALUE || value === "" || value === null || value === undefined; }
function visibleRoutines(typeFilter="all", folderFilter="all", search="") {
  const q = search.trim().toLowerCase();
  return activeRoutines()
    .filter(r => isSystemAll(typeFilter) || (r.category || "uncategorized") === typeFilter)
    .filter(r => isSystemAll(folderFilter) || (r.folder || "Unfiled") === folderFilter)
    .filter(r => !q || r.name.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q))
    .sort((a,b) => (a.folder||"").localeCompare(b.folder||"") || (a.subfolder||"").localeCompare(b.subfolder||"") || a.name.localeCompare(b.name));
}
function setSelectOptions(select, values, allLabel, selected="all") {
  if (!select) return;
  const allValue = /^All\b/i.test(String(allLabel || "")) ? SYSTEM_ALL_VALUE : "all";
  select.innerHTML = `<option value="${allValue}">${escapeHtml(allLabel)}</option>` + values.map(v => `<option value="${attrText(v)}">${htmlText(v)}</option>`).join("");
  select.value = values.includes(selected) ? selected : (isSystemAll(selected) ? allValue : allValue);
}
function editCategoryOptions(current) {
  const vals = [...new Set([current || "uncategorized", ...categories()])].filter(Boolean).sort();
  return vals.map(c => `<option value="${escapeAttr(c)}" ${c === (current || "uncategorized") ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
}

function activateTab(tabId) {
  const panel = $(tabId);
  if (!panel) return;
  document.querySelectorAll(".tab, .mobile-nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(`[data-tab="${cssEscapeSafe(tabId)}"]`).forEach(b => {
    if (b.classList.contains("tab") || b.classList.contains("mobile-nav-btn")) b.classList.add("active");
  });
  if (tabId === "plans") {
    // v5.2.0: Plans is now treated as a Library sub-area in the mobile IA.
    document.querySelectorAll('.mobile-nav-btn[data-tab="templates"]').forEach(b => b.classList.add("active"));
  }
  panel.classList.add("active");
  if (tabId === "practice") renderPracticeTodayCommand();
  if (tabId === "today") renderToday();
  if (tabId === "stats") renderStatsBundleIfVisible("activateTab stats");
}

document.querySelectorAll(".tab, .mobile-nav-btn").forEach(btn => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));

function applyAriaLabelCleanup() {
  try {
    document.querySelectorAll("button:not([aria-label])").forEach(btn => {
      const text = (btn.textContent || "").replace(/\s+/g, " ").trim();
      const title = (btn.getAttribute("title") || "").trim();
      const action = (btn.dataset?.action || "").replace(/[-_]+/g, " ").trim();
      const label = title || (text && text.length <= 80 ? text : "") || action;
      if (label) btn.setAttribute("aria-label", label);
    });
  } catch(e) {
    logAppError?.(e, "applyAriaLabelCleanup");
  }
}

function renderAll() {
  const renderSteps = [
    ["renderRoutineSelects", renderRoutineSelects],
    ["renderPressureRoutineOptions", () => { if (typeof renderPressureRoutineOptions === "function") renderPressureRoutineOptions(); }],
    ["renderRoutineList", renderRoutineList],
    ["renderPlanBuilder", renderPlanBuilder],
    ["renderPlanList", renderPlanList],
    ["renderStats", () => renderStatsIfVisible("renderAll")],
    ["renderToday", renderToday],
    ["renderPracticeTodayCommand", renderPracticeTodayCommand],
    ["renderSmartRecommendation", renderSmartRecommendation],
    ["renderTagSuggestions", renderTagSuggestions],
    ["renderBackupReminder", renderBackupReminder],
    ["renderStorageDashboard", renderStorageDashboard],
    ["renderExportFolderStatus", renderExportFolderStatus],
    ["renderPeriodization", renderPeriodization],
    ["renderRegretRoutineOptions", renderRegretRoutineOptions],
    ["renderTableDatabase", renderTableDatabase],
    ["renderSkillManager", () => { if (activeTemplatesPanelName() === "skills") renderSkillManager(); }],
    ["renderTableSelects", renderTableSelects],
    ["renderTrainingLoad", () => { if (shouldRenderStatsPanel()) renderTrainingLoad(); }],
    ["renderWeeklyReview", () => { if (shouldRenderStatsPanel()) renderWeeklyReview(); }],
    ["renderABComparison", () => { if (shouldRenderStatsPanel()) renderABComparison(); }],
    ["renderResumeCard", renderResumeCard],
    ["renderTodayResumeCard", renderTodayResumeCard],
    ["renderQuickResumeBanner", renderQuickResumeBanner],
    ["renderTableStats", () => { if (shouldRenderStatsPanel()) renderTableStats(); }],
    ["renderPhaseOneInsights", () => { if (shouldRenderStatsPanel()) renderPhaseOneInsights(); }],
    ["renderBayesianAnalyticsValidation", () => { if (shouldRenderStatsPanel()) renderBayesianAnalyticsValidation(); }],
    ["toggleStatsStandalonePanels", () => { if (shouldRenderStatsPanel()) toggleStatsStandalonePanels(); }],
    ["renderInterfaceSettings", renderInterfaceSettings],
    ["restorePracticeMainTab", restorePracticeMainTab],
    ["restorePlansMainTab", restorePlansMainTab],
    ["restoreTemplatesMainTab", restoreTemplatesMainTab],
    ["restoreDataMainTab", restoreDataMainTab],
    ["updateSessionFocusState", updateSessionFocusState],
    ["ensureRoutinePickerButtons", () => { if (typeof ensureRoutinePickerButtons === "function") ensureRoutinePickerButtons(); }],
    ["applyAriaLabelCleanup", applyAriaLabelCleanup]
  ];
  if (typeof requestAnimationFrame !== "function") {
    renderSteps.forEach(([label, fn]) => safeCall(label, fn));
    return;
  }
  let index = 0;
  const runChunk = () => {
    const deadline = performance.now() + 10;
    while (index < renderSteps.length && performance.now() < deadline) {
      const [label, fn] = renderSteps[index++];
      safeCall(label, fn);
    }
    if (index < renderSteps.length) requestAnimationFrame(runChunk);
  };
  requestAnimationFrame(runChunk);
}

function renderRoutineSelects() {
  ensureSkillTaxonomyReady();
  renderPrimarySkillOptions();
  const cats = categories(), flds = folders(), subs = subfolders();

  setSelectOptions($("routineCategorySelect"), cats, "Select existing type/category", $("routineCategorySelect")?.value || "all");
  setSelectOptions($("routineFolderSelect"), flds, "Select existing folder", $("routineFolderSelect")?.value || "all");
  setSelectOptions($("routineSubfolderSelect"), subs, "Select existing subfolder", $("routineSubfolderSelect")?.value || "all");

  setSelectOptions($("exerciseTypeFilter"), cats, "All types", $("exerciseTypeFilter")?.value || "all");
  setSelectOptions($("exerciseFolderFilter"), flds, "All folders", $("exerciseFolderFilter")?.value || "all");
  setSelectOptions($("planTypeFilter"), cats, "All types", $("planTypeFilter")?.value || "all");
  setSelectOptions($("planFolderFilter"), flds, "All folders", $("planFolderFilter")?.value || "all");
  setSelectOptions($("randomTypeFilter"), cats, "All types", $("randomTypeFilter")?.value || "all");
  setSelectOptions($("randomFolderFilter"), flds, "All folders", $("randomFolderFilter")?.value || "all");
  setSelectOptions($("constraintFocusType"), cats, "No specific focus", $("constraintFocusType")?.value || "all");
  setSelectOptions($("orchestratorFocus"), cats, "Auto focus", $("orchestratorFocus")?.value || "all");

  const planPickerRoutines = visibleRoutines($("planTypeFilter")?.value || "all", $("planFolderFilter")?.value || "all");
  $("routineToAdd").innerHTML = planPickerRoutines.map(r => `<option value="${attrText(r.id)}">${htmlText(r.folder || "Unfiled")} / ${htmlText(r.subfolder || "General")} — ${htmlText(r.name)}</option>`).join("") || `<option value="">No matching exercises</option>`;

  const allRoutineOptions = visibleRoutines().map(r => `<option value="${r.id}">${escapeHtml(r.name)} — ${fmtScoring(r.scoring)}</option>`).join("");
  $("freeRoutineSelect").innerHTML = allRoutineOptions || `<option value="">No exercises yet</option>`;
  $("nextFreeRoutineSelect").innerHTML = allRoutineOptions || `<option value="">No exercises yet</option>`;
  $("planSelect").innerHTML = data.plans.map(p => `<option value="${attrText(p.id)}">${htmlText(p.name)}</option>`).join("") || `<option value="">No plans yet</option>`;
  const statsSelect = $("statsRoutineSelect");
  if (statsSelect) {
    const previousStatsRoutine = normalizeStatsRoutineFilter(statsRoutineFilterId || statsSelect.value || "all");
    const statRoutines = (data.routines || []).slice().sort((a,b) => String(a.name || "").localeCompare(String(b.name || "")));
    const statIds = statRoutines.map(r => String(r.id));
    statsSelect.innerHTML = `<option value="all">All exercises</option>` + statRoutines.map(r => `<option value="${attrText(r.id)}">${htmlText(r.name)}${r.isDeleted ? " (archived)" : ""}</option>`).join("");
    statsRoutineFilterId = statIds.includes(previousStatsRoutine) || previousStatsRoutine === "all" ? previousStatsRoutine : "all";
    statsSelect.value = statsRoutineFilterId;
    localStorage.setItem(STATS_ROUTINE_FILTER_KEY, statsRoutineFilterId);
  }

  if (!$("statsDateSelect").value) $("statsDateSelect").value = localDateKey();
}
["exerciseTypeFilter","exerciseFolderFilter","exerciseSearch"].forEach(id => {
  safeOn(id, "input", debouncedRenderRoutineList);
  safeOn(id, "change", debouncedRenderRoutineList);
});
["planTypeFilter","planFolderFilter"].forEach(id => {
  safeOn(id, "input", debouncedRenderAll);
  safeOn(id, "change", debouncedRenderAll);
});

function renderRoutineList() {
  const routines = visibleRoutines($("exerciseTypeFilter").value || "all", $("exerciseFolderFilter").value || "all", $("exerciseSearch").value || "");
  if (!routines.length) { $("routineList").innerHTML = "<p>No exercises match the current filters.</p>"; return; }

  const grouped = Object.create(null);
  routines.forEach(r => {
    const f = r.folder || "Unfiled", s = r.subfolder || "General";
    if (!grouped[f]) grouped[f] = {};
    if (!grouped[f][s]) grouped[f][s] = [];
    grouped[f][s].push(r);
  });

  $("routineList").innerHTML = Object.entries(grouped).map(([folder, subMap]) =>
    `<div class="folder-group"><div class="folder-header">${escapeHtml(folder)}</div>${
      Object.entries(subMap).map(([sub, rs]) => `<div class="subfolder-header">${escapeHtml(sub)}</div>${rs.map(renderRoutineItem).join("")}`).join("")
    }</div>`
  ).join("");
}
function renderRoutineItem(r) {
  const skillMap = getRoutineSkillMap(r);
  const primarySkill = skillMap?.primarySkill ? skillLabel(skillMap.primarySkill) : "";
  const meta = [
    r.category ? htmlText(r.category) : "Uncategorized",
    htmlText(fmtScoring(r.scoring)),
    primarySkill ? `Skill: ${htmlText(primarySkill)}` : "",
    r.duration ? `${numText(r.duration)}m` : "",
    r.target ? `Target ${numText(r.target)}` : "",
    r.attempts ? `${numText(r.attempts)} reps` : "",
    r.scoring === "progressive_completion" && r.totalUnits ? `Progressive ${numText(r.totalUnits)} ${htmlText(progressiveUnitLabel(r))}` : ""
  ].filter(Boolean).join(" · ");
  const statusBadges = [
    r.isAnchor ? `<span class="badge anchor-badge">Anchor</span>` : "",
    recommendationMode(r) !== "active" ? `<span class="badge routine-status-badge">${htmlText(recommendationModeLabel(recommendationMode(r)))}</span>` : ""
  ].filter(Boolean).join("");
  return `<div class="item routine-item-clean">
    <div class="item-title"><strong>${htmlText(r.name)}</strong>${statusBadges ? `<span class="routine-status-row">${statusBadges}</span>` : ""}</div>
    <div class="routine-meta-line routine-meta-compact">${meta}</div>
    ${r.description ? `<p class="routine-description-compact">${htmlText(r.description)}</p>` : ""}
    ${r.stretchTarget ? `<div class="routine-meta-line">Stretch target ${numText(r.stretchTarget)}</div>` : ""}
    ${r.scoring === "progressive_completion" && r.targetColour ? `<div class="routine-meta-line">Colour ${htmlText(fmtTargetColour(r.targetColour || inferTargetColour(r.targetMode)))}</div>` : ""}
    ${renderTargetUpgradeButton(r.id)}
    <div class="small-actions routine-actions-compact">
      <button class="secondary" data-action="edit-routine" data-id="${attrText(r.id)}">Edit</button>
      <button class="secondary" data-action="toggle-favorite-routine" data-id="${attrText(r.id)}">${isFavoriteRoutine(r.id) ? "Unfavorite" : "Favorite"}</button>
      <button class="secondary" data-action="duplicate-routine" data-id="${attrText(r.id)}">Duplicate</button>
      <button class="danger" data-action="delete-routine" data-id="${attrText(r.id)}">Delete</button>
    </div>
  </div>`;
}
function getExerciseFormMode() {
  const raw = localStorage.getItem(EXERCISE_FORM_MODE_KEY) || $("exerciseFormMode")?.value || "basic";
  return raw === "advanced" ? "advanced" : "basic";
}
function applyExerciseFormMode(mode) {
  const clean = mode === "advanced" ? "advanced" : "basic";
  const select = $("exerciseFormMode");
  if (select) select.value = clean;
  localStorage.setItem(EXERCISE_FORM_MODE_KEY, clean);
  const formGrid = $("routineFormGrid");
  if (formGrid) formGrid.dataset.formMode = clean;
  document.body.dataset.exerciseFormMode = clean;
  const basicIds = new Set(["routineName","routineScoring","routineAttempts","routineDuration","routineTarget","routineDescription"]);
  ["routineCategorySelect","routineCategoryNew","routineFolderSelect","routineFolderNew","routineSubfolderSelect","routineSubfolderNew","routineSideMode","routineAttemptMode","routineIsAnchor","routineRecommendationMode","routinePrimarySkill","routineSecondarySkills","routineTransferTags","routineStretchTarget","routineDifficultyLabel","routineTotalUnits","routineAttemptsPerSession","routineUnitType","routineTargetMode","routineTargetColour","routineTrackHighestBreak"].forEach(id => {
    const el = $(id);
    const wrap = el?.closest?.("div");
    if (wrap) wrap.classList.add("routine-advanced-field");
  });
  document.querySelectorAll(".routine-advanced-field").forEach(el => el.classList.toggle("hidden", clean !== "advanced"));
}

function editRoutine(id) {
  const r = routineById(id);
  if (!r) return;
  applyExerciseFormMode("advanced");
  $("routineFormTitle").textContent = "Edit exercise";
  $("routineEditId").value = r.id;
  $("routineName").value = r.name;
  $("routineScoring").value = r.scoring;
  $("routineCategorySelect").value = categories().includes(r.category) ? r.category : "all";
  $("routineCategoryNew").value = "";
  $("routineFolderSelect").value = folders().includes(r.folder) ? r.folder : "all";
  $("routineFolderNew").value = "";
  $("routineSubfolderSelect").value = subfolders().includes(r.subfolder) ? r.subfolder : "all";
  $("routineSubfolderNew").value = "";
  $("routineAttempts").value = r.attempts || "";
  $("routineDuration").value = r.duration || "";
  if ($("routineSideMode")) $("routineSideMode").value = normalizeSideMode(r.sideMode || r.sideSplitMode || r.sideSplit);
  if ($("routineAttemptMode")) $("routineAttemptMode").value = getRoutineAttemptMode(r);
  $("routineIsAnchor").value = r.isAnchor ? "yes" : "no";
  if ($("routineRecommendationMode")) $("routineRecommendationMode").value = recommendationMode(r);
  const skillMap = getRoutineSkillMap(r);
  if ($("routinePrimarySkill")) $("routinePrimarySkill").value = skillMap.primarySkill || "cueing";
  renderRoutineSkillChips(skillMap);
  $("routineTarget").value = r.target || "";
  $("routineStretchTarget").value = r.stretchTarget || "";
  $("routineDifficultyLabel").value = getActiveTargetProfile(r)?.difficultyLabel || r.difficultyLabel || "";
  $("routineTotalUnits").value = r.totalUnits || "";
  $("routineAttemptsPerSession").value = r.attemptsPerSession || "";
  $("routineUnitType").value = r.unitType || "balls_cleared";
  $("routineTargetMode").value = r.targetMode || "custom";
  $("routineTargetColour").value = r.targetColour || inferTargetColour(r.targetMode) || "";
  $("routineTrackHighestBreak").value = r.trackHighestBreak ? "yes" : "no";
  $("routineDescription").value = r.description || "";
  document.querySelector('[data-tab="templates"]').click();
  window.scrollTo({top: 0, behavior: "smooth"});
}
function clearRoutineForm() {
  $("routineFormTitle").textContent = "Create exercise";
  applyExerciseFormMode(getExerciseFormMode());
  $("routineEditId").value = "";
  ["routineName","routineCategoryNew","routineFolderNew","routineSubfolderNew","routineAttempts","routineDuration","routineTarget","routineStretchTarget","routineTotalUnits","routineAttemptsPerSession","routineDifficultyLabel","routineSecondarySkills","routineTransferTags","routineDescription"].forEach(id => { if ($(id)) $(id).value = ""; });
  $("routineScoring").value = "raw";
  if ($("routineSideMode")) $("routineSideMode").value = "none";
  if ($("routineAttemptMode")) $("routineAttemptMode").value = "shared";
  $("routineIsAnchor").value = "no";
  if ($("routineRecommendationMode")) $("routineRecommendationMode").value = "active";
  if ($("routinePrimarySkill")) $("routinePrimarySkill").value = "cueing";
  renderRoutineSkillChips({secondarySkills:[], transferTags:[]});
  $("routineCategorySelect").value = "all";
  $("routineFolderSelect").value = "all";
  $("routineSubfolderSelect").value = "all";
}
safeOn("clearRoutineFormBtn", "click", clearRoutineForm);
if ($("exerciseFormMode")) {
  safeOn("exerciseFormMode", "change", e => applyExerciseFormMode(e.target.value));
  applyExerciseFormMode(getExerciseFormMode());
}
renderRoutineSkillChips({secondarySkills: getSkillHiddenValue("routineSecondarySkills"), transferTags: getSkillHiddenValue("routineTransferTags")});
function duplicateRoutine(id) {
  const r = routineById(id);
  if (!r) return;
  const newId = uuid();
  let copied = {...r, id: newId, name: `${r.name} copy`, isDeleted: false, deletedAt: "", recommendationMode: recommendationMode(r)};
  // Reset target profile lineage so edits to the duplicate cannot cross-contaminate the source routine.
  copied.targetHistory = [];
  copied.activeTargetProfileId = "";
  copied = ensureTargetHistory(copied);
  copied.skillMap = normalizeRoutineSkillMap(copied, getRoutineSkillMap(r));
  data.routines.push(copied);
  data.routineSkillMap = data.routineSkillMap || {};
  data.routineSkillMap[newId] = copied.skillMap;
  saveData();
}
function deleteRoutine(id) {
  if (!allowRateLimitedOperation("deleteRoutine", 15, 60000, "Too many exercise delete actions. Wait a moment and try again.")) return;
  return confirmDeleteAction("this exercise template", () => {
    const now = new Date().toISOString();
    const hasLogs = (data.logs || []).some(l => l.routineId === id);
    const hasSessions = (data.sessions || []).some(s => (s.routineIds || []).includes(id) || (s.logIds || []).some(logId => (data.logs || []).some(l => l.id === logId && l.routineId === id)));
    const hasPlans = (data.plans || []).some(p => (p.routineIds || []).includes(id));
    const hasActiveDraft = !!(activeSession?.routineIds || []).includes(id);
    if (!hasLogs && !hasSessions && !hasPlans && !hasActiveDraft) {
      data.routines = (data.routines || []).filter(r => r.id !== id);
      if (data.routineSkillMap) delete data.routineSkillMap[id];
    } else {
      data.routines = (data.routines || []).map(r => r.id === id ? {...r, isDeleted: true, deletedAt: now} : r);
      data.plans = (data.plans || []).map(p => ({...p, routineIds: (p.routineIds || []).filter(rid => rid !== id)}));
    }
    saveData({allowReadOnlyCleanup:true});
  });
}
safeOn("saveRoutineBtn", "click", () => {
  const name = $("routineName").value.trim();
  if (!name) return alert("Enter an exercise name.");
  const newCategory = $("routineCategoryNew").value.trim();
  const selectedCategory = $("routineCategorySelect").value;
  const category = newCategory || (selectedCategory !== "all" ? selectedCategory : "uncategorized");
  const newFolder = $("routineFolderNew").value.trim();
  const selectedFolder = $("routineFolderSelect").value;
  const folder = newFolder || (!isSystemAll(selectedFolder) ? selectedFolder : (category || "Unfiled"));
  const newSubfolder = $("routineSubfolderNew").value.trim();
  const selectedSubfolder = $("routineSubfolderSelect").value;
  const subfolder = newSubfolder || (!isSystemAll(selectedSubfolder) ? selectedSubfolder : "General");

  const routine = {
    id: $("routineEditId").value || uuid(),
    canonicalId: normalizeRoutineCanonicalId($("routineCanonicalId")?.value || name),
    metadataVersion: 1,
    isCatalogueRoutine: !!$("routineCanonicalId")?.value,
    routinePackSource: $("routinePackSource")?.value || "",
    routinePackVersion: $("routinePackVersion")?.value || "",
    name,
    scoring: $("routineScoring").value,
    attempts: Number($("routineAttempts").value || 0) || "",
    duration: Number($("routineDuration").value || 0) || "",
    sideMode: normalizeSideMode($("routineSideMode")?.value || "none"),
    attemptMode: normalizeSideMode($("routineSideMode")?.value || "none") === "left_right" ? normalizeAttemptMode($("routineAttemptMode")?.value || "shared") : "shared",
    isAnchor: $("routineIsAnchor").value === "yes",
    recommendationMode: ["active", "occasional", "excluded"].includes($("routineRecommendationMode")?.value) ? $("routineRecommendationMode").value : "active",
    skillMap: {
      primarySkill: normalizeSkillId($("routinePrimarySkill")?.value || ""),
      secondarySkills: normalizeSkillList($("routineSecondarySkills")?.value || ""),
      transferTags: normalizeSkillList($("routineTransferTags")?.value || ""),
      source: "manual",
      updatedAt: new Date().toISOString()
    },
    target: Number($("routineTarget").value || 0) || "",
    stretchTarget: Number($("routineStretchTarget").value || 0) || "",
    totalUnits: Number($("routineTotalUnits").value || 0) || "",
    attemptsPerSession: Number($("routineAttemptsPerSession").value || 0) || "",
    unitType: $("routineUnitType").value || "balls_cleared",
    targetMode: $("routineTargetMode").value || "custom",
    targetColour: $("routineTargetColour").value || inferTargetColour($("routineTargetMode").value) || "",
    trackHighestBreak: $("routineTrackHighestBreak").value === "yes",
    difficultyLabel: $("routineDifficultyLabel").value.trim() || "Base target",
    category, folder, subfolder,
    description: $("routineDescription").value.trim(),
    isDeleted: false,
    deletedAt: ""
  };

  data.routineSkillMap = data.routineSkillMap || {};
  data.routineSkillMap[routine.id] = normalizeRoutineSkillMap(routine, routine.skillMap);
  const historicalSkillLogsUpdated = $("routineEditId").value ? syncRoutineSkillMapToHistoricalLogs(routine.id, data.routineSkillMap[routine.id], {persist:false}) : 0;

  if ($("routineEditId").value) {
    const oldRoutine = data.routines.find(r => r.id === routine.id);
    if (oldRoutine) {
      routine.targetHistory = oldRoutine.targetHistory || [];
      routine.activeTargetProfileId = oldRoutine.activeTargetProfileId || "";
      const targetChanged = hasTargetProfileChanged(oldRoutine, routine);
      if (targetChanged) {
        const createVersion = confirm("Target / difficulty fields changed. Recommended: OK = create a new target version from today. Cancel = correct the existing active target profile.");
        if (createVersion) {
          const profile = makeTargetProfile(routine, routine.difficultyLabel || "Updated target");
          routine.targetHistory.push(profile);
          routine.activeTargetProfileId = profile.id;
        } else {
          ensureTargetHistory(routine);
          const p = getActiveTargetProfile(routine);
          if (p) {
            p.target = routine.target;
            p.stretchTarget = routine.stretchTarget;
            p.totalUnits = routine.totalUnits;
            p.attemptsPerSession = routine.attemptsPerSession || routine.attempts;
            p.difficultyLabel = routine.difficultyLabel || p.difficultyLabel || "Corrected target";
            p.scoring = routine.scoring;
          }
        }
      } else {
        ensureTargetHistory(routine);
      }
    }
    data.routines = data.routines.map(r => r.id === routine.id ? routine : r);
  } else {
    ensureTargetHistory(routine);
    data.routines.push(routine);
  }

  clearRoutineForm();
  saveData({immediateIDB: historicalSkillLogsUpdated > 0});
  if (historicalSkillLogsUpdated > 0) showTransientNotice(`Skill tags applied to ${historicalSkillLogsUpdated} historical log${historicalSkillLogsUpdated === 1 ? "" : "s"}.`, "ok");
});

safeOn("addRoutineToPlanBtn", "click", () => {
  const id = $("routineToAdd").value;
  if (!id) return;
  planDraft.push(id);
  renderPlanBuilder();
});
function renderPlanBuilder() {
  planDraft = validRoutineIds(planDraft);
  $("planBuilderList").innerHTML = planDraft.map((id, i) => {
    const r = routineById(id);
    return `<div class="item">
      <strong>${i + 1}. ${escapeHtml(r?.name || "Missing exercise")}</strong>
      <p>${escapeHtml(r?.folder || "Unfiled")} / ${escapeHtml(r?.subfolder || "General")} · ${escapeHtml(r?.category || "uncategorized")}</p>
      <div class="small-actions">
        <button class="secondary" data-action="move-plan-routine" data-index="${i}" data-direction="-1">Up</button>
        <button class="secondary" data-action="move-plan-routine" data-index="${i}" data-direction="1">Down</button>
        <button class="danger" data-action="remove-plan-routine" data-index="${i}">Remove</button>
      </div>
    </div>`;
  }).join("") || "<p>No routines added to this plan yet.</p>";
}
function movePlanRoutine(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= planDraft.length) return;
  [planDraft[index], planDraft[newIndex]] = [planDraft[newIndex], planDraft[index]];
  renderPlanBuilder();
}
function removePlanRoutine(index) {
  planDraft.splice(index, 1);
  renderPlanBuilder();
}
function shuffledCopy(items) {
  const arr = [...(items || [])];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
safeOn("randomizePlanBtn", "click", () => randomizePlan(false));
safeOn("appendRandomPlanBtn", "click", () => randomizePlan(true));
function randomizePlan(append) {
  const n = Number($("randomCount").value || 0);
  if (!n || n < 1) return alert("Enter a valid number of exercises.");
  const pool = visibleRoutines($("randomTypeFilter").value || "all", $("randomFolderFilter").value || "all");
  if (!pool.length) return alert("No exercises match the randomizer filters.");
  const shuffled = shuffledCopy(pool);
  const picked = shuffled.slice(0, Math.min(n, shuffled.length)).map(r => r.id);
  planDraft = append ? planDraft.concat(picked) : picked;
  if (!$("planName").value.trim()) $("planName").value = `Random training — ${new Date().toLocaleDateString()}`;
  renderPlanBuilder();
}
safeOn("savePlanBtn", "click", () => {
  const name = $("planName").value.trim();
  if (!name) return alert("Enter a plan name.");
  planDraft = validRoutineIds(planDraft);
  if (!planDraft.length) return alert("Add at least one valid active routine.");
  data.plans.push({id: uuid(), name, routineIds: [...planDraft], createdAt: new Date().toISOString()});
  $("planName").value = "";
  planDraft = [];
  saveData();
});
function renderPlanList() {
  $("planList").innerHTML = data.plans.map(p => {
    const names = p.routineIds.map(id => routineById(id)?.name || "Missing exercise");
    return `<div class="item">
      <div class="item-title"><strong>${escapeHtml(p.name)}</strong><span class="badge">${p.routineIds.length} exercises</span></div>
      <p>${names.map(escapeHtml).join(" → ")}</p>
      <div class="small-actions">
        <button class="secondary" data-action="load-plan" data-id="${attrText(p.id)}">Load / duplicate</button>
        <button class="danger" data-action="delete-plan" data-id="${attrText(p.id)}">Delete</button>
      </div>
    </div>`;
  }).join("") || "<p>No daily plans saved yet.</p>";
}
function loadPlanToBuilder(id) {
  const p = data.plans.find(x => x.id === id);
  if (!p) return;
  $("planName").value = p.name + " copy";
  planDraft = [...p.routineIds];
  renderPlanBuilder();
  document.querySelector('[data-tab="plans"]').click();
}
function deletePlan(id) {
  return confirmDeleteAction("this training plan", () => {
    data.plans = data.plans.filter(p => p.id !== id);
    saveData({allowReadOnlyCleanup:true});
  });
}

safeOn("resumeSessionBtn", "click", resumePersistedSession);
safeOn("discardSessionBtn", "click", discardPersistedSession);
safeOn("todayResumeSessionBtn", "click", resumePersistedSession);
safeOn("todayDiscardSessionBtn", "click", discardPersistedSession);

safeOn("startSessionBtn", "click", () => {
  const plan = data.plans.find(p => p.id === $("planSelect").value);
  if (!plan) return alert("Create or select a plan first.");
  const anchors = anchorRoutines().map(r => r.id);
  const activeIds = new Set(activeRoutines().map(r => r.id));
  const sourceIds = (plan.routineIds || []).filter(id => activeIds.has(id));
  const anchorPrefix = anchors.filter(id => activeIds.has(id) && sourceIds[0] !== id);
  const sessionRoutineIds = [...anchorPrefix, ...sourceIds];
  if (!sessionRoutineIds.length) return alert("This plan has no available exercises. Add exercises to the plan or restore deleted templates before starting.");
  activeSession = { id: uuid(), type: "plan", planId: plan.id, planName: plan.name, routineIds: sessionRoutineIds, index: 0, startedAt: new Date().toISOString(), completedLogs: [], plannedRoutineIds: plan.routineIds ? [...plan.routineIds] : [] };
  startRoutineScreen();
  persistActiveSession();
});
safeOn("startFreeSessionBtn", "click", () => {
  const rid = $("freeRoutineSelect").value;
  if (!rid) return alert("Create at least one exercise first.");
  activeSession = { id: uuid(), type: "free", planName: `Free training — ${new Date().toLocaleDateString()}`, routineIds: [rid], index: 0, startedAt: new Date().toISOString(), completedLogs: [] };
  startRoutineScreen();
  persistActiveSession();
});
function startRepeatLastExercise() {
  const last = data.logs.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
  if (!last) { showTransientNotice("No previous exercise to repeat yet.", "warn"); return; }
  const routine = routineById(last.routineId);
  if (!routine) { showTransientNotice("The last exercise template no longer exists.", "warn"); return; }
  activeSession = { id: uuid(), type: "free", planName: `Repeat — ${new Date().toLocaleDateString()}`, routineIds: [routine.id], index: 0, startedAt: new Date().toISOString(), completedLogs: [], tableId: last.tableId || "", venueTable: last.venueTable || last.venueTableSnapshot || "", tableNote: last.tableNote || "" };
  rememberVenueTable(last.venueTable || last.venueTableSnapshot || "", last.tableNote || "");
  startRoutineScreen();
}
safeOn("repeatLastExerciseBtn", "click", startRepeatLastExercise);
document.addEventListener("click", (event) => {
  const toggle = event.target.closest?.('[data-action="toggle-quick-resume"]');
  if (toggle) {
    event.preventDefault();
    setQuickResumeCollapsed(!isQuickResumeCollapsed());
    renderQuickResumeBanner();
    return;
  }
  const btn = event.target.closest?.('[data-action="quick-resume-last"]');
  if (!btn) return;
  event.preventDefault();
  startRepeatLastExercise();
});

function isQuickResumeCollapsed() {
  try { return localStorage.getItem(QUICK_RESUME_COLLAPSED_KEY) === "1"; } catch(e) { return false; }
}
function setQuickResumeCollapsed(collapsed) {
  try { localStorage.setItem(QUICK_RESUME_COLLAPSED_KEY, collapsed ? "1" : "0"); } catch(e) {}
}
function renderQuickResumeBanner() {
  const box = $("quickResumeBanner");
  if (!box) return;
  const last = (data.logs || []).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
  const routine = last ? routineById(last.routineId) : null;
  if (!last || !routine) { box.classList.add("hidden"); box.innerHTML = ""; return; }
  const collapsed = isQuickResumeCollapsed();
  const when = last.createdAt ? safeDateString(last.createdAt) : "last time";
  box.classList.remove("hidden");
  box.classList.toggle("collapsed", collapsed);
  const detailHtml = collapsed ? "" : `<p><strong>${htmlText(routine.name)}</strong> · last played ${htmlText(when)}${last.venueTable || last.venueTableSnapshot ? ` · ${htmlText(last.venueTable || last.venueTableSnapshot)}` : ""}</p>`;
  box.innerHTML = `<div class="quick-resume-header"><div><h2>Quick resume</h2>${detailHtml}</div><button type="button" class="quick-resume-toggle" data-action="toggle-quick-resume" aria-label="${collapsed ? "Expand quick resume" : "Collapse quick resume"}">${collapsed ? "+" : "−"}</button></div>${collapsed ? "" : `<div class="quick-resume-content"><button type="button" class="success quick-resume-btn" data-action="quick-resume-last">Repeat now</button></div>`}`;
}

function syncSessionQualityTiles() {
  const value = String($("sessionRating")?.value || "");
  document.querySelectorAll(".quality-tile").forEach(b => b.classList.toggle("active", String(b.dataset.rating || "") === value));
}

function syncReflectionRatingTiles(targetId) {
  const ids = targetId ? [targetId] : ["reflectionFocusRating","reflectionConfidenceRating","reflectionFatigueRating","reflectionCueingRating","reflectionMentalSharpnessRating"];
  ids.forEach(id => {
    const value = String($(id)?.value || "");
    document.querySelectorAll(`.reflection-rating-tile[data-target="${id}"]`).forEach(btn => {
      const active = String(btn.dataset.rating || "") === value;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  });
}
function setReflectionRating(targetId, rating) {
  const el = $(targetId || "");
  if (!el) return;
  const clean = String(rating || "");
  el.value = /^[1-5]$/.test(clean) ? clean : "";
  syncReflectionRatingTiles(targetId);
  hapticFeedback("tap");
}

function startRoutineScreen() {
  persistActiveSession();
  resetTimerState();
  $("sessionSummary").classList.add("hidden");
  $("freeNextCard").classList.add("hidden");
  $("activeSession").classList.remove("hidden");
  updateSessionFocusState();
  renderCurrentRoutine();
}
safeOn("resetSessionBtn", "click", () => {
  const hasActiveProgress = !!activeSession || getElapsedMs() > 0 || !!timerStartMs;
  if (hasActiveProgress && !window.confirm("Reset the active session? Unsaved exercise progress will be lost.")) return;
  activeSession = null;
  clearPersistedActiveSession();
  runDeferredExternalStorageSyncIfSafe();
  stopTimer();
  resetTimerState();
  $("activeSession").classList.add("hidden");
  $("freeNextCard").classList.add("hidden");
  updateSessionFocusState();
  $("sessionSummary").classList.add("hidden");
  updateSessionFocusState();
  showTransientNotice("Active session reset.", "warn");
});
function renderCurrentRoutine() {
  if (!isResumingActiveSession) persistActiveSession();
  if (!activeSession || activeSession.index >= activeSession.routineIds.length) return completeSession();
  const r = routineById(activeSession.routineIds[activeSession.index]);
  if (!r) return;
  $("currentRoutineName").textContent = r.name;
  const sessionTxt = activeSession.type === "free" ? "Free training" : `${activeSession.index + 1}/${activeSession.routineIds.length}`;
  $("currentRoutineMeta").textContent = `${sessionTxt} · ${fmtScoring(r.scoring)} · target ${r.target || "n/a"} · default ${r.duration || 0} min · ${r.folder || "Unfiled"} / ${r.subfolder || "General"}`;
  const saveBtn = $("saveNextBtn");
  if (saveBtn) saveBtn.textContent = activeSession.index >= activeSession.routineIds.length - 1 ? "Save & Finish" : "Save & Next";
  $("practiceNotes").value = "";
  $("sessionVenueTable").value = activeSession.tableId || getLastTableId() || "";
  
  $("sessionIntervention").value = "";
  $("sessionInterventionNote").value = "";
  $("sessionRating").value = activeSession?.sessionRatingDraft || "";
  $("sessionTags").value = "";
  if (r.description) { $("routineDescriptionBox").textContent = r.description; $("routineDescriptionBox").classList.remove("hidden"); }
  else $("routineDescriptionBox").classList.add("hidden");
  resetTimerState();
  renderScoreInputs(r);
  syncSessionQualityTiles();
  prefillSmartDefaults(r);
  $("saveNextBtn").textContent = activeSession.type === "free" ? "Save Routine" : "Save & Next";
  $("skipBtn").classList.toggle("hidden", activeSession.type === "free");
  $("endFreeSessionBtn").classList.toggle("hidden", activeSession.type !== "free");
  updateSessionFocusState();
  renderLivePerformanceCard(r);
  scheduleTimerAutostartForCurrentRoutine();
}
function renderScoreInputs(r) {
  let html = "";
  if (r.scoring === "progressive_completion") {
    html += `<div><label>Average ${progressiveUnitLabel(r)} per attempt</label><input id="scoreValue" type="number" min="0" step="0.01" placeholder="e.g. 8" inputmode="decimal"></div>`;
    html += `<div><label>Best attempt (${progressiveUnitLabel(r)})</label><input id="bestAttemptValue" type="number" min="0" step="0.01" placeholder="e.g. 12" inputmode="decimal"></div>`;
    html += `<div><label>Attempts</label><input id="attemptsValue" type="number" min="1" step="1" value="${numAttr(r.attemptsPerSession || r.attempts || "")}" inputmode="numeric"></div>`;
    html += `<div><label>Completions</label><input id="completionCountValue" type="number" min="0" step="1" placeholder="0 if none" inputmode="numeric"></div>`;
    if (Number(r.totalUnits || 0) <= 0) html += `<div class="progressive-total-units-runtime"><label>Completion size / total units</label><input id="sessionTotalUnitsValue" type="number" min="1" step="1" placeholder="Required to save this drill" inputmode="numeric"><p class="muted tiny">This exercise template has no completion size. Enter it here so the log can be saved.</p></div>`;
    if (r.trackHighestBreak) html += `<div><label>Highest break (optional)</label><input id="highestBreakValue" type="number" min="0" step="1" placeholder="e.g. 32" inputmode="numeric"></div>`;
    html += `<div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty" inputmode="decimal"></div>`;
  } else if (r.scoring === "success_rate") {
    if (!routineUsesSideSplit(r)) {
      const madeMax = Number(r.attempts || r.attemptsPerSession || 0) || "";
      html += `<div><label>Made</label><input id="scoreValue" type="number" min="0" ${madeMax ? `max="${numAttr(madeMax)}"` : ""} step="1" placeholder="e.g. 7" inputmode="numeric"></div>`;
    }
    html += `<div><label>Attempts</label><input id="attemptsValue" type="number" min="1" step="1" value="${numAttr(r.attempts || "")}" placeholder="e.g. 10" inputmode="numeric"></div>`;
    html += `<div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty" inputmode="decimal"></div>`;
  } else {
    html += `<div><label>Score</label><input id="scoreValue" type="number" step="0.01" placeholder="Enter score" inputmode="decimal"></div>`;
    html += `<div><label>Attempts</label><input id="attemptsValue" type="number" min="1" step="1" value="${numAttr(r.attempts || r.attemptsPerSession || "")}" placeholder="optional" inputmode="numeric"></div>`;
    html += `<div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty" inputmode="decimal"></div>`;
  }
  if (routineUsesSideSplit(r)) {
    const attemptsDefault = Number(r.attempts || r.attemptsPerSession || 0) || "";
    const modeText = getRoutineAttemptMode(r) === "per_side"
      ? "Attempts are counted per side. Combined score = Left + Right."
      : "Attempts are one shared total. Combined score = Left + Right.";
    html += `<div class="side-split-panel focus-side-tile">
      <div class="side-split-compact-note">Left / Right split · ${htmlText(attemptModeLabel(getRoutineAttemptMode(r)))} · ${htmlText(modeText)}</div>
      <div class="grid two">
        <div><label>Left side</label><input id="leftSideScoreValue" type="number" min="0" step="0.01" placeholder="Left" inputmode="decimal"></div>
        <div><label>Right side</label><input id="rightSideScoreValue" type="number" min="0" step="0.01" placeholder="Right" inputmode="decimal"></div>
      </div>
    </div>`;
    if (!html.includes('id="attemptsValue"') && attemptsDefault) html += `<div><label>Attempts</label><input id="attemptsValue" type="number" min="1" step="1" value="${numAttr(attemptsDefault)}" inputmode="numeric"></div>`;
  }
  $("scoreInputs").innerHTML = html;
  renderFocusScoreSteppers(r);
  renderFocusNumpad(r);
  applyFocusModeInputLocks();
  renderQuickScoreControls(r);
  const activeCard = $("activeSession");
  if (activeCard) {
    activeCard.classList.toggle("focus-has-side-split", routineUsesSideSplit(r));
    activeCard.classList.toggle("focus-no-side-split", !routineUsesSideSplit(r));
    activeCard.classList.toggle("focus-has-quick-controls", !!($("quickScoreControls") && !$("quickScoreControls").classList.contains("hidden")));
  }
  setTimeout(() => {
    if (document.body?.classList.contains("session-focus-active")) {
      if (document.activeElement && ["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName)) document.activeElement.blur();
      resetSessionFocusScrollTop();
      return;
    }
    $("scoreValue")?.focus();
  }, 120);
  const syncScoreMax = () => {
    const attemptsEl = $("attemptsValue");
    if (!attemptsEl || r.scoring !== "success_rate") return;
    const maxVal = Number(attemptsEl.value || 0);
    const clampField = id => {
      const el = $(id);
      if (!el) return;
      if (maxVal > 0) el.setAttribute("max", String(maxVal));
      else el.removeAttribute("max");
      if (maxVal > 0 && Number(el.value || 0) > maxVal) {
        el.value = String(maxVal);
        el.dispatchEvent(new Event("input", {bubbles:true}));
      }
    };
    if (routineUsesSideSplit(r)) {
      clampField("leftSideScoreValue");
      clampField("rightSideScoreValue");
    } else {
      clampField("scoreValue");
    }
  };
  $("attemptsValue")?.addEventListener("input", syncScoreMax);
  syncScoreMax();
  ["scoreValue","attemptsValue","manualTimeValue","bestAttemptValue","completionCountValue","highestBreakValue","leftSideScoreValue","rightSideScoreValue","sessionTotalUnitsValue"].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); saveCurrentRoutine(); } });
      el.addEventListener("input", () => renderLivePerformanceCard(r));
    }
  });
}

function renderFocusScoreSteppers(r) {
  const box = $("scoreInputs");
  if (!box) return;
  box.querySelectorAll(".focus-inline-stepper").forEach(el => el.remove());
  box.querySelector(".focus-score-stepper-panel")?.remove();
  box.querySelectorAll(".focus-score-inline-row").forEach(el => el.classList.remove("focus-score-inline-row", "focus-inline-stepper-ready"));
  const fieldDefs = [
    {id:"scoreValue", label:r?.scoring === "success_rate" ? "Made" : "Score", deltas:[-1,1]},
    {id:"leftSideScoreValue", label:"Left", deltas:[-1,1]},
    {id:"rightSideScoreValue", label:"Right", deltas:[-1,1]},
    {id:"attemptsValue", label:"Attempts", deltas:[-1,1]},
    {id:"manualTimeValue", label:"Time", deltas:[-1,1]},
    {id:"bestAttemptValue", label:"Best", deltas:[-1,1]},
    {id:"completionCountValue", label:"Completions", deltas:[-1,1]},
    {id:"highestBreakValue", label:"Break", deltas:[-1,1]},
    {id:"sessionTotalUnitsValue", label:"Size", deltas:[-1,1]}
  ].filter(f => $(f.id));
  fieldDefs.forEach(f => {
    const input = $(f.id);
    if (!input) return;
    const row = input.closest("div");
    if (!row || row.classList.contains("focus-inline-stepper-ready")) return;
    row.classList.add("focus-score-inline-row", "focus-inline-stepper-ready");
    if (f.id === "scoreValue") row.classList.add("focus-primary-score-row");
    row.insertAdjacentHTML("beforeend", `<div class="focus-inline-stepper" aria-label="${attrText(f.label)} controls">
      <button type="button" class="secondary" data-action="focus-step" data-target="${attrText(f.id)}" data-delta="${f.deltas[0]}">−</button>
      <button type="button" class="secondary" data-action="focus-step" data-target="${attrText(f.id)}" data-delta="${f.deltas[1]}">+</button>
    </div>`);
  });
}

function adjustNumericInputValue(inputId, delta) {
  const el = $(inputId);
  if (!el) return;
  const current = Number(el.value || 0);
  const step = Number(el.getAttribute("step") || 1);
  const minRaw = el.getAttribute("min");
  const maxRaw = el.getAttribute("max");
  const min = minRaw === null || minRaw === "" ? -Infinity : Number(minRaw);
  const max = maxRaw === null || maxRaw === "" ? Infinity : Number(maxRaw);
  const nextRaw = current + Number(delta || 0);
  const next = Math.max(min, Math.min(max, nextRaw));
  const decimals = step && !Number.isInteger(step) ? 2 : 0;
  el.value = decimals ? String(Math.round(next * 100) / 100) : String(Math.round(next));
  el.dispatchEvent(new Event("input", {bubbles:true}));
  setFocusNumpadTarget(inputId);
  focusModeScoreFeedback(inputId);
}


function fillSameAsLastTime() {
  if (!activeSession) return;
  const rid = activeSession.routineIds[activeSession.index];
  const last = data.logs.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).find(l => l.routineId === rid);
  if (!last) return alert("No previous log for this exercise.");
  if (!confirm("Fill the score fields with the last logged values for this exercise?")) return;
  if ($("scoreValue")) $("scoreValue").value = last.score || 0;
  if ($("attemptsValue")) $("attemptsValue").value = last.attempts || last.attemptsPerSessionAtLog || "";
  if ($("manualTimeValue")) $("manualTimeValue").value = last.timeMinutes || "";
  if ($("bestAttemptValue")) $("bestAttemptValue").value = last.bestAttempt || "";
  if ($("completionCountValue")) $("completionCountValue").value = last.completionCount || "";
  if ($("highestBreakValue")) $("highestBreakValue").value = last.highestBreak || "";
  if ($("leftSideScoreValue")) $("leftSideScoreValue").value = last.leftSideScore || last.sideLeftScore || "";
  if ($("rightSideScoreValue")) $("rightSideScoreValue").value = last.rightSideScore || last.sideRightScore || "";
  if ($("sessionRating") && last.sessionRating) $("sessionRating").value = last.sessionRating;
  if ($("sessionTags") && last.sessionTags) $("sessionTags").value = last.sessionTags;
}

function renderQuickScoreControls(r) {
  const box = $("quickScoreControls");
  if (!box) return;
  if (document.body?.classList.contains("session-focus-active")) {
    box.innerHTML = "";
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  const autoMacros = getQuickLogAutoAdvanceSetting() !== "off";
  if (routineUsesSideSplit(r)) {
    box.innerHTML = `
      <div class="quick-score-block side-quick-score-block">
        <div class="quick-score-row side-quick-score-row">
          <button class="secondary" type="button" data-action="focus-step" data-target="leftSideScoreValue" data-delta="-1">L −1</button>
          <button class="secondary" type="button" data-action="focus-step" data-target="leftSideScoreValue" data-delta="1">L +1</button>
          <button class="secondary" type="button" data-action="focus-step" data-target="leftSideScoreValue" data-delta="5">L +5</button>
          <button class="secondary" type="button" data-action="focus-step" data-target="rightSideScoreValue" data-delta="-1">R −1</button>
          <button class="secondary" type="button" data-action="focus-step" data-target="rightSideScoreValue" data-delta="1">R +1</button>
          <button class="secondary" type="button" data-action="focus-step" data-target="rightSideScoreValue" data-delta="5">R +5</button>
          <button class="secondary" type="button" data-action="score-set" data-score="0">Clear</button>
          <button class="secondary" type="button" data-action="same-as-last">Same time as last</button>
          <button class="secondary" type="button" data-action="repeat-last-score-setup">Repeat last score setup</button>
        </div>
      </div>`;
    return;
  }
  if (r.scoring === "success_rate") {
    const attempts = Math.max(1, Number(r.attempts || r.attemptsPerSession || 10));
    const chips = Array.from({length: Math.min(attempts, 30) + 1}, (_, i) => i)
      .map(i => `<button class="secondary score-chip" type="button" data-action="score-set" data-score="${i}">${i}</button>`)
      .join("");
    box.innerHTML = `
      <div class="quick-score-block">
        <div class="quick-score-title">Made count</div>
        <div class="score-chip-grid">${chips}</div>
        ${attempts > 30 ? `<p class="muted">Large attempt count detected. Use the number field for scores above 30.</p>` : ""}
        <div class="quick-score-row">
          <button class="secondary" type="button" data-action="score-set" data-score="0">0</button>
          <button class="secondary" type="button" data-action="score-set" data-score="${Math.floor(attempts/2)}">Half</button>
          <button class="secondary" type="button" data-action="score-set" data-score="${attempts}">Max</button>
          <button class="secondary" type="button" data-action="score-adjust" data-delta="-1">-1</button>
          <button class="secondary" type="button" data-action="score-adjust" data-delta="1">+1</button>
          <button class="secondary" type="button" data-action="same-as-last">Same time as last</button>
          <button class="secondary" type="button" data-action="repeat-last-score-setup">Repeat last score setup</button>
        </div>
        ${autoMacros ? `<div class="quick-score-row quick-log-row">
          <button type="button" data-action="quick-log" data-score="0">Log 0 & next</button>
          <button type="button" data-action="quick-log" data-score="${Math.floor(attempts/2)}">Log half & next</button>
          <button type="button" data-action="quick-log" data-score="${attempts}">Log max & next</button>
        </div>` : ""}
      </div>`;
  } else {
    box.innerHTML = `
      <div class="quick-score-row">
        <button class="secondary" type="button" data-action="score-adjust" data-delta="-1">-1</button>
        <button class="secondary" type="button" data-action="score-adjust" data-delta="1">+1</button>
        <button class="secondary" type="button" data-action="score-adjust" data-delta="5">+5</button>
        <button class="secondary" type="button" data-action="score-adjust" data-delta="10">+10</button>
        <button class="secondary" type="button" data-action="score-set" data-score="0">Clear</button>
        <button class="secondary" type="button" data-action="same-as-last">Same time as last</button>
          <button class="secondary" type="button" data-action="repeat-last-score-setup">Repeat last score setup</button>
      </div>`;
  }
}
function quickLogScore(score) {
  hapticFeedback("save");
  setScoreValue(score);
  saveCurrentRoutine();
}
function scoreNumber() { return Number($("scoreValue")?.value || 0); }
function setScoreValue(v) { if ($("scoreValue")) { $("scoreValue").value = v; if (!document.body?.classList.contains("session-focus-active")) $("scoreValue").focus(); } }
function adjustScore(delta) { setScoreValue(scoreNumber() + delta); }
function incrementScore() { adjustScore(1); }
function decrementScore() { adjustScore(-1); }


function prefillSmartDefaults(r) {
  const similar = data.logs.filter(l => l.routineId === r.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const last = similar[0];
  if (last && $("manualTimeValue") && !Number($("manualTimeValue").value)) {
    $("manualTimeValue").placeholder = `last: ${last.timeMinutes} min`;
  }
  const recentRating = data.logs.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).find(l => l.sessionRating);
  if (recentRating && $("sessionRating")) $("sessionRating").placeholder = `last: ${recentRating.sessionRating}`;
}

safeOn("saveNextBtn", "click", saveCurrentRoutine);
safeOn("skipBtn", "click", () => { if (!activeSession) return; activeSession.index += 1; persistActiveSession(); stopTimer(); renderCurrentRoutine(); });
safeOn("endFreeSessionBtn", "click", completeSession);
safeOn("endFreeFromNextBtn", "click", completeSession);
safeOn("continueFreeBtn", "click", () => {
  if (!activeSession) return;
  const rid = $("nextFreeRoutineSelect").value;
  if (!rid) return alert("Select a routine.");
  activeSession.routineIds = [rid];
  activeSession.index = 0;
  $("freeNextCard").classList.add("hidden");
  $("activeSession").classList.remove("hidden");
  renderCurrentRoutine();
});
async function saveCurrentRoutine() {
  if (!allowRateLimitedOperation("saveCurrentRoutine", 30, 60000, "Too many rapid saves. Wait a moment before logging again.")) return;
  if (!activeSession) return;
  const r = routineById(activeSession.routineIds[activeSession.index]);
  if (!r) return;
  const sideSplitEnabled = routineUsesSideSplit(r);
  const attemptMode = getRoutineAttemptMode(r);
  let leftSideScore = sideSplitEnabled ? Number($("leftSideScoreValue")?.value || 0) : "";
  let rightSideScore = sideSplitEnabled ? Number($("rightSideScoreValue")?.value || 0) : "";
  let score = sideSplitEnabled ? computeSideCombinedScore(leftSideScore, rightSideScore) : Number($("scoreValue")?.value || 0);
  let attempts = (r.scoring === "success_rate" || r.scoring === "progressive_completion") ? Number($("attemptsValue")?.value || 0) : Number(r.attempts || 0);
  const manualTimeRaw = $("manualTimeValue")?.value;
  const manualTime = manualTimeRaw === "" || manualTimeRaw === undefined || manualTimeRaw === null ? null : Number(manualTimeRaw);
  let timerMinutes = getElapsedMinutes();
  if (timerMinutes > MAX_SINGLE_DRILL_MINUTES) {
    timerMinutes = MAX_SINGLE_DRILL_MINUTES;
    notifyUser?.("Timer exceeded 4 hours. Duration capped to 240 minutes.", "info");
  }
  let timeMinutes = Number(r.duration || 0);
  if (manualTime !== null && Number.isFinite(manualTime)) timeMinutes = manualTime;
  else if (timerMinutes > 0) timeMinutes = timerMinutes;
  if (timeMinutes > MAX_SINGLE_DRILL_MINUTES) {
    timeMinutes = MAX_SINGLE_DRILL_MINUTES;
    notifyUser?.("Exercise duration capped to 240 minutes to protect analytics.", "info");
  }
  timeMinutes = roundStoredMinutes(timeMinutes);
  if (Number.isNaN(attempts) || attempts < 0) return validationNotice("Attempts must be zero or greater.");
  if (r.scoring === "success_rate" && attempts <= 0) return validationNotice("Enter attempts.");
  if (sideSplitEnabled && (Number.isNaN(leftSideScore) || Number.isNaN(rightSideScore))) return validationNotice("Enter valid left and right side scores.");
  if (sideSplitEnabled && (leftSideScore < 0 || rightSideScore < 0)) return validationNotice("Left and right side scores cannot be negative.");
  if (sideSplitEnabled && r.scoring === "success_rate") {
    const sideError = validateSideSuccessRateInputs({left:leftSideScore, right:rightSideScore, attempts, attemptMode});
    if (sideError) return validationNotice(sideError);
  }
  if (Number.isNaN(score)) return validationNotice("Enter a valid score.");
  if (r.scoring !== "points" && score < 0) return validationNotice("Score cannot be negative.");
  if ((r.scoring === "success_rate" || r.scoring === "progressive_completion")) {
    const wholeAttempts = validateWholeNumberField(attempts, "Attempts", {required:true, min:r.scoring === "success_rate" ? 1 : 0});
    if (wholeAttempts.error) return validationNotice(wholeAttempts.error);
    attempts = wholeAttempts.value;
  }
  if (r.scoring === "success_rate") {
    if (sideSplitEnabled) {
      const leftWhole = validateWholeNumberField(leftSideScore, "Left side score", {required:true, min:0});
      const rightWhole = validateWholeNumberField(rightSideScore, "Right side score", {required:true, min:0});
      if (leftWhole.error) return validationNotice(leftWhole.error);
      if (rightWhole.error) return validationNotice(rightWhole.error);
      leftSideScore = leftWhole.value;
      rightSideScore = rightWhole.value;
      score = computeSideCombinedScore(leftSideScore, rightSideScore);
    } else {
      const madeWhole = validateWholeNumberField(score, "Made", {required:true, min:0, max:attempts});
      if (madeWhole.error) return validationNotice(madeWhole.error);
      score = madeWhole.value;
    }
  }
  if (!sideSplitEnabled && r.scoring === "success_rate" && score > attempts) return validationNotice("Score cannot exceed attempts.");
  if (manualTime < 0) return validationNotice("Time cannot be negative.");
  const sessionTotalUnits = r.scoring === "progressive_completion" ? (wholeNumberOrNull($("sessionTotalUnitsValue")?.value ?? "") ?? wholeNumberOrNull(r.totalUnits) ?? 0) : Number(r.totalUnits || 0);
  if (r.scoring === "progressive_completion" && sessionTotalUnits <= 0) return validationNotice("Enter the completion size / total units for this progressive completion drill.");
  if (r.scoring === "progressive_completion") {
    if (score > sessionTotalUnits) return validationNotice(`Average ${progressiveUnitLabel(r)} cannot exceed completion size (${sessionTotalUnits}).`);
    const bestRaw = $("bestAttemptValue")?.value || "";
    const completionsRaw = $("completionCountValue")?.value || "";
    const breakRaw = $("highestBreakValue")?.value || "";
    const bestCheck = validateWholeNumberField(bestRaw, "Best attempt", {required:false, min:0, max:sessionTotalUnits});
    if (bestCheck.error) return validationNotice(bestCheck.error);
    const completionMax = Number.isFinite(Number(attempts)) ? Number(attempts) : null;
    const completionCheck = validateWholeNumberField(completionsRaw, "Completions", {required:false, min:0, max:completionMax});
    if (completionCheck.error) return validationNotice(completionCheck.error);
    const breakCheck = validateWholeNumberField(breakRaw, "Highest break", {required:false, min:0, max:sessionTotalUnits});
    if (breakCheck.error) return validationNotice(breakCheck.error);
  }
  const activeProfile = getActiveTargetProfile(r);

  activeSession.tableId = $("sessionVenueTable")?.value || activeSession.tableId || getLastTableId() || "";
  activeSession.venueTable = getTableName(activeSession.tableId) || activeSession.venueTable || "";
  activeSession.tableNote = tableById(activeSession.tableId)?.info || activeSession.tableNote || "";
  rememberVenueTable(activeSession.venueTable, activeSession.tableNote);
  rememberTableId(activeSession.tableId, "");

  const log = {
    id: uuid(),
    sessionId: activeSession.id,
    sessionName: activeSession.planName,
    sessionType: activeSession.type,
    planId: activeSession.planId || "",
    sessionPlanId: activeSession.planId || "",
    planNameSnapshot: activeSession.type === "plan" ? activeSession.planName : "",
    routineId: r.id,
    routineName: r.name,
    routineNameSnapshot: r.name,
    folder: r.folder || "Unfiled",
    subfolder: r.subfolder || "General",
    category: r.category || "uncategorized",
    ...skillSnapshotForRoutine(r),
    scoring: r.scoring,
    score,
    attempts,
    sideMode: normalizeSideMode(r.sideMode || r.sideSplitMode || r.sideSplit),
    sideSplitEnabled,
    attemptMode,
    effectiveAttempts: sideSplitEnabled && attemptMode === "per_side" ? attempts * 2 : attempts,
    leftSideScore,
    rightSideScore,
    sideScores: sideSplitEnabled ? {left:leftSideScore, right:rightSideScore} : "",
    timeMinutes: Math.round(timeMinutes * 10) / 10,
    normalizedScore: 0,
    bestAttempt: wholeNumberOrNull($("bestAttemptValue")?.value || "") ?? "",
    completionCount: wholeNumberOrNull($("completionCountValue")?.value || "") ?? "",
    highestBreak: wholeNumberOrNull($("highestBreakValue")?.value || "") ?? "",
    totalUnits: r.scoring === "progressive_completion" ? sessionTotalUnits : (r.totalUnits || ""),
    unitType: r.unitType || "",
    targetMode: r.targetMode || "",
    targetProfileId: activeProfile?.id || "",
    targetAtLog: activeProfile?.target || r.target || "",
    stretchTargetAtLog: activeProfile?.stretchTarget || r.stretchTarget || "",
    totalUnitsAtLog: r.scoring === "progressive_completion" ? sessionTotalUnits : (activeProfile?.totalUnits || r.totalUnits || ""),
    attemptsPerSessionAtLog: activeProfile?.attemptsPerSession || r.attemptsPerSession || r.attempts || "",
    difficultyLabelAtLog: activeProfile?.difficultyLabel || r.difficultyLabel || "",
    targetColour: r.targetColour || inferTargetColour(r.targetMode) || "",
    performance: "N/A",
    tableId: activeSession.tableId || $("sessionVenueTable")?.value || "",
    venueTable: getTableName(activeSession.tableId || $("sessionVenueTable")?.value) || activeSession.venueTable || "",
    venueTableSnapshot: getTableName(activeSession.tableId || $("sessionVenueTable")?.value) || "",
    tableNote: tableById(activeSession.tableId)?.info || activeSession.tableNote || "",
    sessionIntervention: $("sessionIntervention")?.value || "",
    sessionInterventionNote: $("sessionInterventionNote")?.value || "",
    sessionRating: Number($("sessionRating")?.value || 0) || "",
    sessionTags: $("sessionTags")?.value || "",
    notes: $("practiceNotes").value.trim(),
    createdAt: new Date().toISOString()
  };
  log.normalizedScore = normalizeScore(log);
  log.performance = classifyPerformance(log, r);
  updateTagHistoryFromInput(log.sessionTags);
  updateRecommendationCompletionFromLog(log);
  data.logs.push(log);
  activeSession.completedLogs.push(log);
  const persisted = await persistLogDelta(log, "saveCurrentRoutine log put");
  if (!persisted && !indexedDBUnavailable) notifyUser("Saved locally, but IndexedDB sync is pending. Export a backup if this warning repeats.", "warn");
  showTransientNotice(activeSession.index >= activeSession.routineIds.length - 1 ? "Saved." : "Saved — next exercise.", "ok");
  stopTimer();

  if (activeSession.type === "free") {
    saveData({render:"sessionLog", idbSync:"skip"});
    $("activeSession").classList.add("hidden");
    $("freeNextCard").classList.remove("hidden");
    updateSessionFocusState();
  } else {
    activeSession.index += 1;
    persistActiveSession();
    saveData({render:"sessionLog", idbSync:"skip"});
    renderCurrentRoutine();
  }
}
async function completeSession() {
  if (!activeSession) return;
  stopTimer();
  $("activeSession").classList.add("hidden");
  $("freeNextCard").classList.add("hidden");
  updateSessionFocusState?.();
  const logs = activeSession.completedLogs || data.logs.filter(l => l.sessionId === activeSession.id);
  if (!logs.length) {
    activeSession = null;
    clearPersistedActiveSession();
    runDeferredExternalStorageSyncIfSafe();
    resetTimerState();
    $("sessionSummary")?.classList.add("hidden");
    showTransientNotice?.("Session discarded — no exercises were logged.", "info");
    renderAll();
    return;
  }
  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  $("sessionSummary").innerHTML = `<h2>Session complete</h2><p><strong>${escapeHtml(getPlanName(activeSession))}</strong></p><p>${logs.length} exercises logged · ${totalTime.toFixed(1)} total minutes</p><table class="history-table today-table"><thead><tr><th>Exercise</th><th>Type</th><th>Score</th><th>Performance</th><th>Time</th></tr></thead><tbody>${logs.map(l => `<tr><td>${escapeHtml(getRoutineName(l))}${(l.tableId || l.venueTable) ? `<br><span class="venue-pill">${escapeHtml(getTableName(l))}</span>` : ""}</td><td>${escapeHtml(l.category || "")}</td><td>${displayScore(l)}</td><td>${escapeHtml(l.performance || "N/A")}</td><td>${l.timeMinutes} min</td></tr>`).join("")}</tbody></table>`;
  $("sessionSummary").classList.remove("hidden");
  data.sessions = data.sessions || [];
  const existingIdx = data.sessions.findIndex(s => s.id === activeSession.id);
  const completedSessionId = activeSession.id;
  const sessionRecord = {
    id: activeSession.id,
    name: getPlanName(activeSession),
    planNameSnapshot: activeSession.planName,
    planId: activeSession.planId || "",
    type: activeSession.type,
    tableId: activeSession.tableId || "",
    venueTable: getTableName(activeSession.tableId) || activeSession.venueTable || "",
    venueTableSnapshot: getTableName(activeSession.tableId) || activeSession.venueTable || "",
    tableNote: tableById(activeSession.tableId)?.info || activeSession.tableNote || "",
    startedAt: activeSession.startedAt,
    endedAt: new Date().toISOString(),
    logIds: logs.map(l => l.id)
  };
  if (existingIdx >= 0) data.sessions[existingIdx] = sessionRecord;
  else data.sessions.push(sessionRecord);
  saveCoreData("completeSession core save");
  await persistSessionDelta(sessionRecord, "completeSession session put");
  resetTimerState();
  if (activeSession) activeSession.timerState = null;
  activeSession = null;
  clearPersistedActiveSession();
  runDeferredExternalStorageSyncIfSafe();
  updateSessionFocusState?.();
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  $("practice")?.classList.add("active");
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.querySelector('.tab[data-tab="practice"]')?.classList.add("active");
  renderToday();
  openReflectionModal(completedSessionId);
  renderStats();
}

function getElapsedMs() { return elapsedMsFromState(timerStartMs, elapsedBeforeStartMs); }
function getElapsedMinutes() { return elapsedMinutesFromState(timerStartMs, elapsedBeforeStartMs); }
function syncTimerStateToActiveSession() {
  if (!activeSession) return;
  activeSession.timerState = makeTimerState(timerStartMs, elapsedBeforeStartMs);
  persistActiveSession();
}
function restoreTimerStateFromActiveSession() {
  const ts = activeSession?.timerState;
  if (!ts) return false;
  stopTimer();
  elapsedBeforeStartMs = Number(ts.elapsedBeforeStartMs || 0);
  timerStartMs = null;
  if (ts.isRunning && ts.wallClockStartMs) {
    const recoveredRun = Math.max(0, Date.now() - Number(ts.wallClockStartMs || 0));
    elapsedBeforeStartMs = Math.min(MAX_TIMER_ELAPSED_MS, Math.max(0, elapsedBeforeStartMs + recoveredRun));
    if ($("timerState")) $("timerState").textContent = "timer restored paused";
  } else if (ts.isRunning && ts.timerStartMs && ts.clockType !== "monotonic") {
    timerStartMs = Number(ts.timerStartMs);
  }
  if (timerStartMs) {
    timerInterval = setInterval(updateTimerDisplay, 1000);
    if ($("timerState")) $("timerState").textContent = "timer running";
  } else if (elapsedBeforeStartMs > 0 && $("timerState")) {
    $("timerState").textContent = "timer paused";
  }
  updateTimerDisplay();
  syncFocusWakeLock();
  return true;
}

function getWakeLockSetting(){ return interfaceReadSetting(WAKE_LOCK_KEY, "wakeLock", "off"); }
function ensureWakeLockIndicator() {
  let el = $("wakeLockIndicator");
  if (!el && document.body) {
    el = document.createElement("div");
    el.id = "wakeLockIndicator";
    el.className = "wake-lock-indicator";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.textContent = "Screen awake during practice";
    document.body.appendChild(el);
  }
  return el;
}
function setWakeLockIndicator(active) {
  try {
    ensureWakeLockIndicator();
    document.body?.classList.toggle("wake-lock-active", !!active);
  } catch(e) {}
}
let lastHapticAt = 0;
function hapticFeedback(kind="tap") {
  try {
    if (typeof navigator.vibrate !== "function") return;
    const now = Date.now();
    if (kind === "tap" && now - lastHapticAt < 250) return;
    lastHapticAt = now;
    const pattern = kind === "miss" ? [100, 50, 100] : kind === "save" ? [40, 30, 40] : [50];
    navigator.vibrate(pattern);
  } catch(e) {}
}

function isFocusSwipeIgnoredTarget(target) {
  return !!(target instanceof Element && target.closest?.("button,input,select,textarea,a,[data-action],.focus-numpad-panel,.focus-inline-stepper,.score-chip-grid"));
}

function handleFocusSwipeStart(event) {
  if (!document.body?.classList.contains("session-focus-active")) return;
  if (!activeSession || isFocusSwipeIgnoredTarget(event.target)) return;
  const point = event.touches?.[0] || event;
  const x = Number(point.clientX || 0);
  if (x < 35 || x > window.innerWidth - 35) return;
  focusSwipeStartX = x;
  focusSwipeStartY = Number(point.clientY || 0);
  focusSwipeStartTime = Date.now();
  focusSwipeArmed = true;
}

function handleFocusSwipeEnd(event) {
  if (!focusSwipeArmed || !document.body?.classList.contains("session-focus-active")) return;
  focusSwipeArmed = false;
  const changed = event.changedTouches?.[0] || event;
  const dx = Number(changed.clientX || 0) - focusSwipeStartX;
  const dy = Number(changed.clientY || 0) - focusSwipeStartY;
  const elapsed = Date.now() - focusSwipeStartTime;
  if (elapsed > 900 || Math.abs(dx) < 90 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
  if (dx < 0) {
    hapticFeedback("save");
    showTransientNotice("Swipe detected — saving current drill.", "ok");
    saveCurrentRoutine();
  } else {
    hapticFeedback("tap");
    showTransientNotice("Swipe left to save and move next.", "info");
  }
}

async function requestFocusWakeLock() {
  if (wakeLockPermanentlyFailed || wakeLockRequestInFlight || wakeLockSentinel || getWakeLockSetting() !== "on") return;
  if (!document.body?.classList.contains("session-focus-active")) return;
  if (!timerStartMs && !timerAutostartDelayInterval) return;
  if (!("wakeLock" in navigator)) return;
  try {
    wakeLockRequestInFlight = true;
    wakeLockSentinel = await navigator.wakeLock.request("screen");
    setWakeLockIndicator(true);
    wakeLockSentinel.addEventListener?.("release", () => { wakeLockSentinel = null; setWakeLockIndicator(false); });
    if (!timerStartMs && !timerAutostartDelayInterval) {
      releaseFocusWakeLock();
    } else if ($("timerState") && timerStartMs) {
      $("timerState").textContent = "timer running · screen awake";
    }
  } catch(e) {
    wakeLockSentinel = null;
    setWakeLockIndicator(false);
    wakeLockPermanentlyFailed = true;
    console.warn("WakeLock request rejected; disabling wake lock retries for this session.", e);
  } finally {
    wakeLockRequestInFlight = false;
  }
}
async function releaseFocusWakeLock() {
  const sentinel = wakeLockSentinel;
  wakeLockSentinel = null;
  setWakeLockIndicator(false);
  try { await sentinel?.release?.(); } catch(e) {}
}
function syncFocusWakeLock() {
  const shouldHold = getWakeLockSetting() === "on" && document.body?.classList.contains("session-focus-active") && !!(timerStartMs || timerAutostartDelayInterval);
  if (shouldHold) requestFocusWakeLock();
  else releaseFocusWakeLock();
}
function cancelTimerAutostartDelay() {
  if (timerAutostartDelayInterval) clearInterval(timerAutostartDelayInterval);
  timerAutostartDelayInterval = null;
  timerAutostartDelayEndsAt = null;
}
function startPracticeTimer() {
  cancelTimerAutostartDelay();
  if (timerStartMs) return;
  timerStartMs = monotonicNowMs();
  timerInterval = setInterval(updateTimerDisplay, 1000);
  if ($("timerState")) $("timerState").textContent = "timer running";
  updateTimerDisplay();
  syncTimerStateToActiveSession();
  syncFocusWakeLock();
}
function resetTimerState() { cancelTimerAutostartDelay(); stopTimer(); timerStartMs = null; elapsedBeforeStartMs = 0; updateTimerDisplay(); if (!suppressTimerPersistence) syncTimerStateToActiveSession(); syncFocusWakeLock(); }
safeOn("timerStartBtn", "click", startPracticeTimer);
safeOn("timerPauseBtn", "click", () => {
  cancelTimerAutostartDelay();
  if (!timerStartMs) return;
  elapsedBeforeStartMs += Math.max(0, monotonicNowMs() - timerStartMs);
  timerStartMs = null;
  stopTimer();
  $("timerState").textContent = "timer paused";
  updateTimerDisplay();
  syncTimerStateToActiveSession();
  syncFocusWakeLock();
});
safeOn("timerResetBtn", "click", () => {
  const elapsed = getElapsedMinutes();
  if (elapsed > 1 && !window.confirm(`Reset timer? You will lose ${elapsed.toFixed(1)} minutes of tracked time.`)) return;
  resetTimerState();
});
function stopTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; syncFocusWakeLock(); }
function updateTimerDisplay() {
  if ($("timerDisplay")) $("timerDisplay").textContent = formatElapsedClock(getElapsedMs());
  if (!timerStartMs && getElapsedMs() === 0 && !timerAutostartDelayInterval && $("timerState")) $("timerState").textContent = "timer stopped";
}
function updateTimerAutostartDelayDisplay() {
  if (!timerAutostartDelayEndsAt) return;
  const rawRemainingMs = timerAutostartDelayEndsAt - Date.now();
  if (rawRemainingMs <= 0) {
    startPracticeTimer();
    return;
  }
  const remainingSec = Math.ceil(rawRemainingMs / 1000);
  if ($("timerDisplay")) $("timerDisplay").textContent = formatElapsedClock(remainingSec * 1000);
  if ($("timerState")) $("timerState").textContent = `auto-start in ${remainingSec}s`;
}
function scheduleTimerAutostartForCurrentRoutine() {
  cancelTimerAutostartDelay();
  if (!activeSession || getTimerAutostartSetting() !== "auto" || isResumingActiveSession) return;
  if (timerStartMs || getElapsedMs() > 0) return;
  const delaySec = getTimerAutostartDelaySetting();
  if (delaySec <= 0) { startPracticeTimer(); return; }
  timerAutostartDelayEndsAt = Date.now() + delaySec * 1000;
  updateTimerAutostartDelayDisplay();
  timerAutostartDelayInterval = setInterval(updateTimerAutostartDelayDisplay, 250);
}

function renderLogRow(l) {
  return `<tr data-log-row-id="${attrText(l.id)}">
    <td>${new Date(l.createdAt || Date.now()).toLocaleDateString()}</td>
    <td>${displayScore(l)}</td>
    <td>${Number(l.normalizedScore || normalizeScore(l) || 0).toFixed(2)}</td>
    <td>${escapeHtml(l.performance || "N/A")}</td>
    <td>${escapeHtml(getTargetProfileLabel(l))}</td>
    <td>${formatDurationHuman(l.timeMinutes)}</td>
    <td><button class="secondary" data-action="open-log-edit" data-id="${attrText(l.id)}">Edit</button> <button class="danger" data-action="delete-log" data-id="${attrText(l.id)}">Delete</button></td>
  </tr>`;
}

function displayScore(l) {
  const rawScore = effectiveLogScore(l);
  const score = numText(rawScore, "0");
  const attempts = numText(l.attempts, "0");
  if (logUsesSideSplit(l)) {
    const left = getLogLeftSideScore(l);
    const right = getLogRightSideScore(l);
    const sideText = `L ${numText(Number.isFinite(left) ? left : 0, "0")} + R ${numText(Number.isFinite(right) ? right : 0, "0")} = ${score}`;
    const attemptsText = getLogAttemptMode(l) === "per_side" ? `${attempts}/side (${numText(effectiveLogAttempts(l), "0")} total)` : `${attempts} total`;
    if (l.scoring === "success_rate") return `${sideText}/${attemptsText} (${Number(normalizeScore(l) || 0).toFixed(1)}%)`;
    if (l.scoring === "score_per_minute") return `${sideText} (${Number(normalizeScore(l) || 0).toFixed(2)}/min)`;
    return sideText;
  }
  if (l.scoring === "progressive_completion") {
    const total = numText(l.totalUnits, "?");
    const unit = htmlText(l.unitType || "units");
    const colour = l.targetColour ? " · " + htmlText(fmtTargetColour(l.targetColour)) : "";
    const best = l.bestAttempt ? " · best " + numText(l.bestAttempt) : "";
    const brk = l.highestBreak ? " · break " + numText(l.highestBreak) : "";
    return `${score}/${total} ${unit} avg (${Number(l.normalizedScore || 0).toFixed(1)}%)${colour}${best}${brk}`;
  }
  if (l.scoring === "success_rate") return `${score}/${attempts} (${Number(l.normalizedScore || 0).toFixed(1)}%)`;
  if (l.scoring === "score_per_minute") return `${score} (${Number(l.normalizedScore || 0).toFixed(2)}/min)`;
  return score;
}

function getPeriodRange(period, dateKey) {
  const d = dateKey ? (localDateFromKey(dateKey) || new Date()) : new Date();
  let start, end, label;
  if (period === "daily" || period === "exercise") {
    start = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    end = new Date(start); end.setDate(end.getDate() + 1);
    label = localDateKey(start);
  } else if (period === "weekly") {
    start = new Date(d);
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day);
    start.setHours(0,0,0,0);
    end = new Date(start); end.setDate(end.getDate() + 7);
    label = `Week of ${localDateKey(start)}`;
  } else if (period === "monthly") {
    start = new Date(d.getFullYear(), d.getMonth(), 1);
    end = new Date(d.getFullYear(), d.getMonth()+1, 1);
    label = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  } else if (period === "yearly") {
    start = new Date(d.getFullYear(), 0, 1);
    end = new Date(d.getFullYear()+1, 0, 1);
    label = `${d.getFullYear()}`;
  } else {
    start = new Date(0);
    end = new Date(8640000000000000);
    label = "Overall";
  }
  return {start, end, label};
}
function logsInRange(logs, start, end) {
  return logs.filter(l => {
    const d = new Date(l.createdAt);
    return d >= start && d < end;
  });
}
function bucketLogs(logs, period) {
  const buckets = {};
  logs.forEach(l => {
    const d = new Date(l.createdAt);
    let key;
    if (period === "weekly") {
      const s = new Date(d);
      const day = (s.getDay() + 6) % 7;
      s.setDate(s.getDate() - day);
      key = localDateKey(s);
    } else if (period === "monthly") key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    else if (period === "yearly") key = String(d.getFullYear());
    else key = localDateKey(d);
    if (!buckets[key]) buckets[key] = {label:key, logs:[], time:0, avg:0, count:0};
    buckets[key].logs.push(l);
    buckets[key].time += Number(l.timeMinutes || 0);
  });
  Object.values(buckets).forEach(b => {
    b.count = b.logs.length;
    b.avg = avg(b.logs.map(l => Number(l.normalizedScore || 0)));
  });
  return Object.values(buckets).sort((a,b) => a.label.localeCompare(b.label));
}
function targetHitRate(logs) {
  const targetLogs = logs.filter(l => (l.performance || "N/A") !== "N/A");
  if (!targetLogs.length) return null;
  return targetLogs.filter(l => l.performance === "On Target" || l.performance === "Above Target").length / targetLogs.length * 100;
}
function streaks(logs) {
  const dates = [...new Set((logs || []).map(l => localDateKey(l.createdAt)).filter(Boolean))].sort();
  if (!dates.length) return {current:0, best:0};
  let best=1, current=1, run=1;
  for (let i=1;i<dates.length;i++) {
    const prev = new Date(dates[i-1]+"T00:00:00");
    const cur = new Date(dates[i]+"T00:00:00");
    const diff = Math.round((cur-prev)/86400000);
    if (diff === 1) run += 1;
    else run = 1;
    best = Math.max(best, run);
  }
  const last = new Date(dates[dates.length-1]+"T00:00:00");
  const today = new Date(localDateKey()+"T00:00:00");
  const diffLast = Math.round((today-last)/86400000);
  current = diffLast <= 1 ? run : 0;
  return {current, best};
}
function progressionSuggestion(values, hitRate) {
  if (values.length < 5) return "Add more logs before changing difficulty.";
  const last3 = avg(values.slice(-3));
  const prior = avg(values.slice(0,-3));
  if (hitRate !== null && hitRate >= 80 && last3 >= prior) return "Consider increasing difficulty or stretch target.";
  if (hitRate !== null && hitRate <= 35) return "Consider reducing difficulty or isolating the technical bottleneck.";
  if (last3 > prior * 1.1) return "Momentum is positive; consider a slightly harder version.";
  if (last3 < prior * 0.9) return "Performance is slipping; consider a regression drill or shorter set.";
  return "Maintain current difficulty.";
}


safeOn("generateConstraintPlanBtn", "click", () => {
  const total = Number($("constraintTotalMinutes").value || 60);
  const count = Math.max(1, Number($("constraintExerciseCount").value || 4));
  const focus = $("constraintFocusType").value || "all";
  const allocs = [
    {key:"potting", pct:Number($("allocPotting").value || 0)},
    {key:"break-building", pct:Number($("allocBreak").value || 0)},
    {key:"other", pct:Number($("allocOther").value || 0)}
  ];
  let pool = visibleRoutines();
  if (!pool.length) return alert("No exercises are available for the constraint generator.");
  if (focus !== "all") {
    const focused = pool.filter(r => (r.category || "").toLowerCase() === focus.toLowerCase());
    if (focused.length) pool = focused.concat(pool.filter(r => !focused.includes(r)));
  }
  if (!pool.length) return alert("No exercises match your constraint filters. Try broadening the focus.");
  const picked = [];
  allocs.forEach(a => {
    const n = Math.max(0, Math.round(count * a.pct / 100));
    let catPool = pool.filter(r => {
      const c = (r.category || "").toLowerCase();
      if (a.key === "other") return c !== "potting" && c !== "break-building";
      return c === a.key;
    });
    shuffledCopy(catPool).slice(0,n).forEach(r => picked.push(r.id));
  });
  while (picked.length < count && pool.length) {
    const candidate = pool[Math.floor(Math.random()*pool.length)];
    if (!picked.includes(candidate.id)) picked.push(candidate.id);
    else if (picked.length >= pool.length) break;
  }
  planDraft = picked.slice(0,count);
  if (!$("planName").value.trim()) $("planName").value = `Generated ${total} min session — ${new Date().toLocaleDateString()}`;
  renderPlanBuilder();
});



let pendingReflectionSessionId = "";

function anchorRoutines() {
  return activeRoutines().filter(r => r.isAnchor);
}
function anchorPerformanceSummary(logs) {
  const anchors = anchorRoutines();
  if (!anchors.length) return "";
  const rows = anchors.map(r => {
    const rLogs = logs.filter(l => l.routineId === r.id).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    const allLogs = (data.logs || []).filter(l => l.routineId === r.id).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    const todayAvg = rLogs.length ? avg(rLogs.map(l=>Number(l.normalizedScore||0))) : null;
    const baseline = allLogs.length ? avg(allLogs.slice(-10).map(l=>Number(l.normalizedScore||0))) : null;
    return {name:r.name, todayAvg, baseline};
  });
  return `<div class="review-box"><h3>Anchor drill baseline ${statHelpButton("anchorBaseline")}</h3>${rows.map(row => `<div class="reflection-row"><strong>${escapeHtml(row.name)}</strong>: ${row.todayAvg === null ? "not logged in this view" : row.todayAvg.toFixed(1)}${row.baseline === null ? "" : " vs baseline "+row.baseline.toFixed(1)}</div>`).join("")}</div>`;
}

function weekStart(dateLike) {
  const d = new Date(dateLike);
  d.setHours(0,0,0,0);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return d;
}
function trainingLoadByDay(days=14) {
  const out = [];
  const today = new Date();
  today.setHours(0,0,0,0);
  for (let i=days-1;i>=0;i--) {
    const d = new Date(today);
    d.setDate(today.getDate()-i);
    const key = localDateKey(d);
    const logs = (data.logs || []).filter(l => localDateKey(l.createdAt) === key);
    out.push({key, label:key.slice(5), time:logs.reduce((a,b)=>a+Number(b.timeMinutes||0),0), count:logs.length});
  }
  return out;
}
function renderTrainingLoad() {
  const box = $("trainingLoadBox");
  if (!box) return;
  const load = trainingLoadByDay(14);
  const max = Math.max(1, safeMax(load.map(d=>d.time)) || 1);
  const total7 = load.slice(-7).reduce((a,b)=>a+b.time,0);
  const prev7 = load.slice(0,7).reduce((a,b)=>a+b.time,0);
  const delta = prev7 ? ((total7-prev7)/Math.abs(prev7))*100 : null;
  box.innerHTML = `<div class="load-card"><h3>Training load — last 14 days ${statHelpButton("trainingLoad")}</h3>
    <div class="stats-grid"><div class="stat-card"><span>Last 7 days</span><div class="value">${formatDurationHuman(total7)}</div></div><div class="stat-card"><span>Previous 7 days</span><div class="value">${formatDurationHuman(prev7)}</div></div><div class="stat-card"><span>Volume change</span><div class="value">${delta===null?"N/A":(delta>=0?"+":"")+delta.toFixed(1)+"%"}</div></div></div>
    <div class="load-bars">${load.map(d=>`<div class="load-bar" title="${d.key}: ${d.time.toFixed(1)} min" style="height:${Math.max(3,(d.time/max)*90)}px"></div>`).join("")}</div>
    <div class="load-labels">${load.map(d=>`<span>${d.label}</span>`).join("")}</div>
    ${renderLoadAdvice(total7, prev7)}
  </div>`;
}
function renderLoadAdvice(total7, prev7) {
  if (!prev7) return `<div class="analytics-note">Build a baseline first. Log at least two weeks for load guidance.</div>`;
  const delta = ((total7-prev7)/Math.abs(prev7))*100;
  if (delta > 35) return `<div class="warning-note">Training load increased sharply. If performance is flat, consider a lighter session or deload.</div>`;
  if (delta < -35) return `<div class="analytics-note">Training load dropped materially. If this was not deliberate, schedule an anchor session.</div>`;
  return `<div class="analytics-note">Training load is relatively stable. Good for comparing performance trends.</div>`;
}
function warmupSuggestion(logs=data.logs || []) {
  const f = fatigueCurve(logs);
  if (f && f.deltaPct < -15) return "Warm-up suggestion: add 5 minutes of light potting before scored drills, then shorten the final block or add a break.";
  if (f && f.deltaPct > 10) return "Warm-up suggestion: you appear to start slowly. Add an unscored calibration block before logging.";
  return "Warm-up suggestion: keep a short consistent warm-up so scored drills remain comparable.";
}
function variationSuggestionForRoutine(routineId) {
  const logs = (data.logs || []).filter(l => l.routineId === routineId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const plateau = plateauDetector(logs, 6);
  const r = routineById(routineId);
  if (!r || !plateau || !plateau.isPlateau) return "";
  if ((r.category || "").toLowerCase().includes("potting")) return "Variation suggestion: keep the same drill but move the cue ball 2 inches closer to cushion or reduce attempts by 20% to raise focus.";
  if ((r.category || "").toLowerCase().includes("safety")) return "Variation suggestion: add a stricter leave condition or score only outcomes that create clear advantage.";
  return "Variation suggestion: change one constraint only — target, position, or attempts — and keep the rest stable.";
}
function renderWeeklyReview() {
  const box = $("weeklyReviewBox");
  if (!box) return;
  const today = new Date();
  const start = weekStart(today);
  const prev = new Date(start); prev.setDate(start.getDate()-7);
  const thisLogs = logsInRange(data.logs || [], start, new Date());
  const prevLogs = logsInRange(data.logs || [], prev, start);
  const thisAvg = thisLogs.length ? avg(thisLogs.map(l=>Number(l.normalizedScore||0))) : null;
  const prevAvg = prevLogs.length ? avg(prevLogs.map(l=>Number(l.normalizedScore||0))) : null;
  const delta = thisAvg !== null && prevAvg ? ((thisAvg-prevAvg)/Math.abs(prevAvg))*100 : null;
  box.innerHTML = `<div class="review-box"><h3>Weekly review ${statHelpButton("weeklyReview")}</h3>
    <div class="stats-grid"><div class="stat-card"><span>This week</span><div class="value">${thisLogs.length} logs</div></div><div class="stat-card"><span>Avg performance ${statHelpButton("avgPerformance")}</span><div class="value">${thisAvg===null?"N/A":thisAvg.toFixed(1)}</div></div><div class="stat-card"><span>vs prior week</span><div class="value">${delta===null?"N/A":(delta>=0?"+":"")+delta.toFixed(1)+"%"}</div></div></div>
    <div class="analytics-note">${escapeHtml(warmupSuggestion(thisLogs.length ? thisLogs : data.logs))}</div>
    ${anchorPerformanceSummary(thisLogs)}
  </div>`;
}
function openReflectionModal(sessionId) {
  pendingReflectionSessionId = sessionId || "";
  if (!$("reflectionModal")) return;
  $("reflectionFocus").value = "";
  $("reflectionLimiter").value = "";
  ["reflectionFocusRating","reflectionConfidenceRating","reflectionFatigueRating","reflectionCueingRating","reflectionMentalSharpnessRating"].forEach(id => { if ($(id)) $(id).value = ""; });
  syncReflectionRatingTiles();
  if ($("reflectionTags")) $("reflectionTags").value = "";
  if ($("reflectionInterventionNote")) $("reflectionInterventionNote").value = "";
  $("reflectionNote").value = "";
  $("reflectionModal").classList.remove("hidden");
  document.body?.classList?.add("modal-open");
}
function closeReflectionModal(event) {
  if (event.target && event.target.id === "reflectionModal") skipReflection();
}
function saveReflection() {
  if (!pendingReflectionSessionId) return skipReflection();
  const idx = (data.sessions || []).findIndex(s => s.id === pendingReflectionSessionId);
  if (idx >= 0) {
    const reflectionTags = $("reflectionTags")?.value || "";
    const reflectionInterventionNote = $("reflectionInterventionNote")?.value || "";
    data.sessions[idx].reflection = {
      focus: $("reflectionFocus").value || "",
      limiter: $("reflectionLimiter").value || "",
      focusRating: parseRating("reflectionFocusRating"),
      confidenceRating: parseRating("reflectionConfidenceRating"),
      fatigueRating: parseRating("reflectionFatigueRating"),
      cueingRating: parseRating("reflectionCueingRating"),
      mentalSharpnessRating: parseRating("reflectionMentalSharpnessRating"),
      tags: reflectionTags,
      interventionNote: reflectionInterventionNote,
      note: $("reflectionNote").value || "",
      createdAt: new Date().toISOString()
    };
    data.sessions[idx].sessionTags = reflectionTags || data.sessions[idx].sessionTags || "";
    data.sessions[idx].interventionNote = reflectionInterventionNote || data.sessions[idx].interventionNote || "";
    updateTagHistoryFromInput(reflectionTags);
    saveCoreData("reflection core save");
    persistSessionDelta(data.sessions[idx], "reflection session put");
  }
  skipReflection();
  renderAll();
}
function skipReflection() {
  pendingReflectionSessionId = "";
  if ($("reflectionModal")) $("reflectionModal").classList.add("hidden");
  document.body?.classList?.remove("modal-open");
}



function formatDurationHuman(minutes) {
  const m = Math.round(Number(minutes || 0));
  if (!m) return "0 min";
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (!h) return `${rem} min`;
  if (!rem) return `${h}h`;
  return `${h}h ${rem}m`;
}

const EXPORT_FOLDER_DB = "snookerPracticePWA.exportFolderDB";
const EXPORT_FOLDER_STORE = "handles";
const EXPORT_FOLDER_KEY = "exportFolder";
function isIOSSafariLike(){ return /iPad|iPhone|iPod/.test(navigator.userAgent || "") || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
function supportsExportFolderPicker(){ return !isIOSSafariLike() && "showDirectoryPicker" in window && "indexedDB" in window; }
function openExportFolderDB(){ return new Promise((resolve,reject)=>{ const req=indexedDB.open(EXPORT_FOLDER_DB,1); req.onupgradeneeded=()=>req.result.createObjectStore(EXPORT_FOLDER_STORE); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); }
async function saveExportFolderHandle(handle){ const db=await openExportFolderDB(); return new Promise((resolve,reject)=>{ const tx=db.transaction(EXPORT_FOLDER_STORE,"readwrite"); tx.objectStore(EXPORT_FOLDER_STORE).put(handle,EXPORT_FOLDER_KEY); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); }); }
async function getExportFolderHandle(){ if(!supportsExportFolderPicker()) return null; try{ const db=await openExportFolderDB(); return await new Promise((resolve,reject)=>{ const tx=db.transaction(EXPORT_FOLDER_STORE,"readonly"); const req=tx.objectStore(EXPORT_FOLDER_STORE).get(EXPORT_FOLDER_KEY); req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error); }); }catch(e){ logAppError(e,"getExportFolderHandle"); return null; } }
async function clearExportFolderHandle(){ if(!("indexedDB" in window)) return; try{ const db=await openExportFolderDB(); await new Promise((resolve,reject)=>{ const tx=db.transaction(EXPORT_FOLDER_STORE,"readwrite"); tx.objectStore(EXPORT_FOLDER_STORE).delete(EXPORT_FOLDER_KEY); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); }); }catch(e){ logAppError(e,"clearExportFolderHandle"); } }
async function ensureExportFolderPermission(handle){
  if(!handle) return false;
  try{
    const opts={mode:"readwrite"};
    const current = await handle.queryPermission(opts);
    if(current === "granted") return true;
    const requested = await handle.requestPermission(opts);
    if(requested !== "granted") notifyUser("Export folder permission is not available. Falling back to normal Downloads.", "warn");
    return requested === "granted";
  }catch(e){ logAppError(e,"ensureExportFolderPermission"); notifyUser("Export folder could not be reached. Falling back to normal Downloads.", "warn"); return false; }
}
async function chooseExportFolder(){ if(!supportsExportFolderPicker()){ alert("Folder selection is not supported in this browser. Exports will continue using normal downloads."); renderExportFolderStatus(); return; } try{ const handle=await window.showDirectoryPicker({mode:"readwrite"}); await saveExportFolderHandle(handle); localStorage.setItem("snookerPracticePWA.exportFolderName", handle.name || "Selected folder"); renderExportFolderStatus(); }catch(e){ if(e&&e.name!=="AbortError") logAppError(e,"chooseExportFolder"); } }
async function clearExportFolder(){ await clearExportFolderHandle(); localStorage.removeItem("snookerPracticePWA.exportFolderName"); renderExportFolderStatus(); }
async function renderExportFolderStatus(){ const el=$("exportFolderStatus"); if(!el) return; const chooseBtn=$("chooseExportFolderBtn"); const clearBtn=$("clearExportFolderBtn"); if(!supportsExportFolderPicker()){ if(chooseBtn) chooseBtn.classList.add("hidden"); if(clearBtn) clearBtn.classList.add("hidden"); el.className="analytics-note export-folder-fallback"; el.innerHTML=isIOSSafariLike()?"iOS Safari uses normal Downloads for exports; folder selection is hidden because the browser does not support it.":"Folder export is not supported by this browser. Files will use normal Downloads."; return; } if(chooseBtn) chooseBtn.classList.remove("hidden"); if(clearBtn) clearBtn.classList.remove("hidden"); const handle=await getExportFolderHandle(); if(!handle){ el.className="analytics-note export-folder-fallback"; el.innerHTML="Export folder not selected. Files will use normal Downloads."; return; } const name=localStorage.getItem("snookerPracticePWA.exportFolderName") || handle.name || "Selected folder"; el.className="analytics-note export-folder-ok"; el.innerHTML=`Selected export folder: <strong>${escapeHtml(name)}</strong>.`; }
async function saveTextFileToExportFolder(filename,text,mimeType="application/octet-stream"){
  const handle=await getExportFolderHandle();
  if(!handle) return false;
  const ok=await ensureExportFolderPermission(handle);
  if(!ok) return false;
  try{
    const fileHandle=await handle.getFileHandle(filename,{create:true});
    const writable=await fileHandle.createWritable();
    await writable.write(new Blob([text],{type:mimeType}));
    await writable.close();
    return true;
  }catch(e){ logAppError(e,"saveTextFileToExportFolder"); notifyUser("Selected export folder is unavailable. Falling back to normal Downloads.", "warn"); return false; }
}
async function exportFile(filename,text,mimeType="application/octet-stream"){
  const hadExportFolder = !!localStorage.getItem("snookerPracticePWA.exportFolderName");
  const saved=await saveTextFileToExportFolder(filename,text,mimeType);
  if(!saved){
    if(hadExportFolder) notifyUser("Export folder unavailable. File downloaded through the browser instead.", "warn");
    await downloadFile(filename,text,mimeType);
  } else {
    notifyUser(`Saved to export folder: ${filename}`, "ok");
  }
}

const DEFAULT_TABLE_DEFINITIONS = [
  {id:"default-home-table", name:"Home table", type:"Home"},
  {id:"default-club-table-1", name:"Club table 1", type:"Club"},
  {id:"default-club-table-2", name:"Club table 2", type:"Club"},
  {id:"default-club-table-3", name:"Club table 3", type:"Club"},
  {id:"default-club-table-4", name:"Club table 4", type:"Club"},
  {id:"default-other-table", name:"Other", type:"Other"}
];
let tableLegacyRepairApplied = false;
function repairLegacyTableLinksOnce() {
  if (tableLegacyRepairApplied) return false;
  tableLegacyRepairApplied = true;
  let mutated = false;
  const tables = Array.isArray(data.tables) ? data.tables : [];
  const byName = Object.create(null);
  tables.forEach(t => { if (t?.name && t?.id) byName[t.name] = t; });
  (data.logs || []).forEach(l => {
    if (l.venueTable && !l.tableId) {
      const found = byName[l.venueTable];
      if (found) { l.tableId = found.id; l.venueTableSnapshot = l.venueTable; mutated = true; }
    }
  });
  return mutated;
}
function ensureTablesDatabase(options = {}) {
  let mutated = false;
  data.systemMeta = data.systemMeta || {};
  const hadTables = Array.isArray(data.tables) && data.tables.length > 0;
  if (!Array.isArray(data.tables)) { data.tables = []; mutated = true; }
  if (!data.systemMeta.defaultTablesInitialized && !hadTables && data.tables.length === 0) {
    const now = new Date().toISOString();
    data.tables = DEFAULT_TABLE_DEFINITIONS.map(t => ({id:t.id, name:t.name, type:t.type, info:"", createdAt:now, updatedAt:now, nameHistory:[], isDefaultSeed:true}));
    data.systemMeta.defaultTablesInitialized = true;
    mutated = true;
  } else if (!data.systemMeta.defaultTablesInitialized) {
    data.systemMeta.defaultTablesInitialized = true;
    mutated = true;
  }
  if (options?.repairLegacy === true) mutated = repairLegacyTableLinksOnce() || mutated;
  return mutated;
}
function tableById(id){ return (data.tables||[]).find(t=>t.id===id); }
function tableByName(name){ return (data.tables||[]).find(t=>t.name===name); }
function getTableName(logOrId){ const id=typeof logOrId==="string"?logOrId:(logOrId?.tableId||""); const fallback=typeof logOrId==="string"?"":(logOrId?.venueTable||logOrId?.venueTableSnapshot||""); return tableById(id)?.name || fallback || "Not specified"; }
function getLastTableId(){ return localStorage.getItem("snookerPracticePWA.lastTableId") || ""; }
function rememberTableId(tableId,note){ if(tableId!==undefined) localStorage.setItem("snookerPracticePWA.lastTableId",tableId||""); if(note!==undefined) localStorage.setItem(LAST_TABLE_NOTE_KEY,note||""); }
function renderTableSelects(){ ensureTablesDatabase(); const sel=$("sessionVenueTable"); if(!sel) return; const current=sel.value||getLastTableId()||""; sel.innerHTML=`<option value="">Not specified</option>`+data.tables.map(t=>`<option value="${attrText(t.id)}">${htmlText(t.name)}</option>`).join(""); sel.value=current&&data.tables.some(t=>t.id===current)?current:""; }
function clearTableForm(){ if(!$("tableNameInput")) return; $("tableEditId").value=""; $("tableNameInput").value=""; $("tableTypeInput").value=""; $("tableInfoInput").value=""; }
function saveTableDefinition(){ ensureTablesDatabase(); const name=$("tableNameInput").value.trim(); if(!name) return alert("Enter a table name."); const id=$("tableEditId").value||uuid(); const existing=data.tables.find(t=>t.id===id); const table={id,name,type:$("tableTypeInput").value.trim(),info:$("tableInfoInput").value.trim(),createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),nameHistory:existing?.nameHistory||[]}; if(existing&&existing.name!==name){ table.nameHistory.push({name:existing.name,changedAt:new Date().toISOString()}); (data.logs||[]).forEach(l=>{ if(l.tableId===id){ l.venueTable=name; l.venueTableSnapshot=name; }}); (data.sessions||[]).forEach(sess=>{ if(sess.tableId===id){ sess.venueTable=name; sess.venueTableSnapshot=name; }}); if(activeSession?.tableId===id){ activeSession.venueTable=name; activeSession.venueTableSnapshot=name; persistActiveSession(); }} data.tables=existing?data.tables.map(t=>t.id===id?table:t):[...data.tables,table]; clearTableForm(); saveData(); }
function editTableDefinition(id){ const t=tableById(id); if(!t)return; $("tableEditId").value=t.id; $("tableNameInput").value=t.name||""; $("tableTypeInput").value=t.type||""; $("tableInfoInput").value=t.info||""; }
function deleteTableDefinition(id){ const usedInLogs=(data.logs||[]).some(l=>l.tableId===id); const usedInSessions=(data.sessions||[]).some(sess=>sess.tableId===id); const usedInDraft=activeSession?.tableId===id; if(usedInLogs||usedInSessions||usedInDraft)return alert("This table is used by existing logs, sessions, or an active session. Rename it instead of deleting so historical stats remain linked."); if(!confirm("Delete this table definition?"))return; data.tables=(data.tables||[]).filter(t=>t.id!==id); saveData({allowReadOnlyCleanup:true}); }
function renderEditTableOptions(currentId,currentName=""){ ensureTablesDatabase(); const selectedId=currentId||tableByName(currentName)?.id||""; return `<option value="">Not specified</option>`+data.tables.map(t=>`<option value="${attrText(t.id)}" ${t.id===selectedId?"selected":""}>${htmlText(t.name)}</option>`).join(""); }

function clearSkillTagForm(){
  ["skillEditId","skillManagerLabel","skillManagerId","skillManagerAliases","skillManagerTransferTargets"].forEach(id => { const el=$(id); if(el) el.value=""; });
  const group=$("skillManagerGroup"); if(group) group.value="Technical";
  const active=$("skillManagerActive"); if(active) active.value="yes";
}
function currentSkillById(id){ return currentSkillLibrary({includeArchived:true}).find(s => s.id === id) || null; }
function renderSkillManager(){
  ensureSkillTaxonomyReady();
  const list=$("skillManagerList");
  if(!list) return;
  const q=($("skillManagerSearch")?.value||"").trim().toLowerCase();
  const groupFilter=$("skillManagerFilterGroup")?.value || "all";
  const skills=currentSkillLibrary({includeArchived:true}).filter(skill => {
    if(groupFilter !== "all" && skill.group !== groupFilter) return false;
    const hay=[skill.id, skill.label, skill.group, ...(skill.aliases||[])].join(" ").toLowerCase();
    return !q || hay.includes(q);
  });
  if(!skills.length){ list.innerHTML='<div class="empty-state"><h3>No skill tags found</h3><p>Create a skill tag above, or clear the filters.</p></div>'; return; }
  const usage={};
  (data.routines||[]).forEach(r=>{
    const m=getRoutineSkillMap(r);
    [m.primarySkill, ...(m.secondarySkills||[]), ...(m.transferTags||[])].filter(Boolean).forEach(id=>usage[id]=(usage[id]||0)+1);
  });
  let last="";
  list.innerHTML=skills.map(skill=>{
    const header=skill.group!==last?`<h3 class="group-title">${htmlText(skill.group)}</h3>`:"";
    last=skill.group;
    const status=skill.active===false?'<span class="badge system-warning">Archived</span>':'<span class="badge system-ok">Active</span>';
    const aliases=(skill.aliases||[]).length?`<div class="meta">Aliases: ${(skill.aliases||[]).map(htmlText).join(", ")}</div>`:'<div class="meta">No aliases</div>';
    const transfer=(skill.transferTargets||[]).length?`<div class="meta">Supports: ${(skill.transferTargets||[]).map(id=>htmlText(skillLabel(id))).join(", ")}</div>`:"";
    return `${header}<div class="skill-manager-row"><div><strong>${htmlText(skill.label)}</strong> <span class="meta">${htmlText(skill.id)}</span> ${status}<div class="meta">Used by ${usage[skill.id]||0} exercise tag assignments</div>${aliases}${transfer}</div><div class="small-actions"><button class="secondary" data-action="edit-skill-tag" data-id="${attrText(skill.id)}">Edit</button><button class="secondary" data-action="archive-skill-tag" data-id="${attrText(skill.id)}">${skill.active===false?"Restore":"Archive"}</button><button class="danger" data-action="merge-skill-tag" data-id="${attrText(skill.id)}">Merge</button></div></div>`;
  }).join("");
}
function saveSkillTagFromForm(){
  const label=($("skillManagerLabel")?.value||"").trim();
  const editId=canonicalSkillKey($("skillEditId")?.value||"");
  const rawId=canonicalSkillKey($("skillManagerId")?.value||"");
  const id=rawId || skillIdFromLabel(label);
  if(!label || !id) return alert("Enter a skill label.");
  const taxonomy=normalizeSkillTaxonomy(data.skillTaxonomy || defaultSkillTaxonomy());
  if (editId !== id && taxonomy.skills.some(s => s.id === id)) {
    return alert(`The Canonical ID "${id}" is already in use by another skill. Choose another ID or use the merge action.`);
  }
  const skills=taxonomy.skills.filter(s => s.id !== editId && s.id !== id);
  const rec=normalizeSkillRecord({
    id, label, group:$("skillManagerGroup")?.value||"Custom",
    aliases:($("skillManagerAliases")?.value||"").split(/[;,]/).map(x=>x.trim()).filter(Boolean),
    active:($("skillManagerActive")?.value||"yes")!=="no",
    transferTargets:($("skillManagerTransferTargets")?.value||"").split(/[;,]/).map(x=>x.trim()).filter(Boolean)
  });
  skills.push(rec);
  data.skillTaxonomy=normalizeSkillTaxonomy({skills});
  activeSkillTaxonomyForNormalization=data.skillTaxonomy; invalidateSkillLibraryCache();
  if(editId && editId !== id){
    remapSkillIdAcrossData(editId,id);
  }
  saveData({render:"all"});
  clearSkillTagForm();
  renderSkillManager();
  renderRoutineSkillChips(getRoutineSkillMap(routineById($("routineEditId")?.value||"")||{}));
  showTransientNotice("Skill tag saved.", "ok");
}
function editSkillTag(id){
  const skill=currentSkillById(id); if(!skill) return;
  const set=(id2,val)=>{const el=$(id2); if(el) el.value=val||"";};
  set("skillEditId", skill.id); set("skillManagerLabel", skill.label); set("skillManagerId", skill.id); set("skillManagerGroup", skill.group); set("skillManagerAliases", (skill.aliases||[]).join(", ")); set("skillManagerTransferTargets", (skill.transferTargets||[]).join(", "));
  const active=$("skillManagerActive"); if(active) active.value=skill.active===false?"no":"yes";
  activateTab("templates"); setTemplatesMainTab("skills");
}
function archiveSkillTag(id){
  const taxonomy=normalizeSkillTaxonomy(data.skillTaxonomy || defaultSkillTaxonomy());
  const skills=taxonomy.skills.map(s => s.id===id ? {...s, active:s.active===false?true:false} : s);
  data.skillTaxonomy=normalizeSkillTaxonomy({skills}); activeSkillTaxonomyForNormalization=data.skillTaxonomy; invalidateSkillLibraryCache();
  saveData({render:"all"}); renderSkillManager(); renderRoutineSelects();
  showTransientNotice("Skill tag status updated.", "ok");
}
function remapSkillIdAcrossData(fromId,toId){
  const from=normalizeSkillId(fromId), to=normalizeSkillId(toId);
  if(!from || !to || from===to) return;
  const remapList=list=>[...new Set((Array.isArray(list)?list:String(list||"").split(/[;,]/)).map(x=>canonicalSkillKey(x)).filter(Boolean).map(x=>x===from?to:x).filter(x=>currentSkillById(x)))];
  (data.routines||[]).forEach(r=>{
    const m=getRoutineSkillMap(r);
    if(m.primarySkill===from) m.primarySkill=to;
    m.secondarySkills=remapList(m.secondarySkills);
    m.transferTags=remapList(m.transferTags);
    r.primarySkill=m.primarySkill; r.secondarySkills=m.secondarySkills; r.transferTags=m.transferTags; r.skillMap=m;
  });
  Object.keys(data.routineSkillMap||{}).forEach(rid=>{
    const m=data.routineSkillMap[rid]; if(!m) return;
    if(m.primarySkill===from) m.primarySkill=to;
    m.secondarySkills=remapList(m.secondarySkills);
    m.transferTags=remapList(m.transferTags);
  });
  (data.logs||[]).forEach(l=>{
    if(l.primarySkill===from) l.primarySkill=to;
    l.secondarySkills=remapList(l.secondarySkills);
    l.transferTags=remapList(l.transferTags);
    if(l.skillSnapshot){
      if(l.skillSnapshot.primarySkill===from) l.skillSnapshot.primarySkill=to;
      l.skillSnapshot.secondarySkills=remapList(l.skillSnapshot.secondarySkills);
      l.skillSnapshot.transferTags=remapList(l.skillSnapshot.transferTags);
    }
  });
}
function mergeSkillTag(id){
  const target=prompt(`Merge ${skillLabel(id)} into which existing skill ID?`);
  if(!target) return;
  const to=normalizeSkillId(target);
  if(!currentSkillById(to)) return alert("Target skill ID not found.");
  if(!confirm(`Merge ${skillLabel(id)} into ${skillLabel(to)}? Exercise and log skill references will be remapped.`)) return;
  remapSkillIdAcrossData(id,to);
  const taxonomy=normalizeSkillTaxonomy(data.skillTaxonomy || defaultSkillTaxonomy());
  data.skillTaxonomy=normalizeSkillTaxonomy({skills:taxonomy.skills.map(s=>s.id===id?{...s, active:false}:s)});
  activeSkillTaxonomyForNormalization=data.skillTaxonomy; invalidateSkillLibraryCache();
  saveData({render:"all"}); renderSkillManager(); renderRoutineSelects();
  showTransientNotice("Skill tags merged.", "ok");
}

function renderTableDatabase(){ const box=$("tableList"); if(!box)return; ensureTablesDatabase(); box.innerHTML=(data.tables||[]).map(t=>`<div class="table-db-row"><div><strong>${htmlText(t.name)}</strong><div class="meta">${htmlText(t.type||"No type")} · ${htmlText(t.info||"No info")}</div>${(t.nameHistory||[]).length?`<div class="meta">Previous names: ${(t.nameHistory||[]).map(x=>htmlText(x.name)).join(", ")}</div>`:""}</div><div class="small-actions"><button class="secondary" data-action="edit-table" data-id="${attrText(t.id)}">Edit</button><button class="secondary" data-action="delete-table" data-id="${attrText(t.id)}">Delete</button></div></div>`).join(""); }
function analyticsHelp(title,measures,calc,interpret,use){ return `<div class="help-rich"><p><strong>What it measures:</strong> ${htmlText(measures)}</p><p><strong>How calculated:</strong> ${htmlText(calc)}</p><p><strong>How to interpret:</strong> ${htmlText(interpret)}</p><div class="example"><strong>Typical use:</strong> ${htmlText(use)}</div></div>`; }


let adaptivePlanDraft = [];


function getPeriodizationPhase() {
  const manual = $("periodizationPhase")?.value || "auto";
  if (manual !== "auto") return manual;

  const storedCompDate = (() => { try { return localStorage.getItem("snookerPracticePWA.competitionDate") || ""; } catch(e) { return ""; } })();
  const compRaw = $("competitionDate")?.value || storedCompDate || "";
  let comp = null;
  if (compRaw) {
    const parts = String(compRaw).split("-").map(Number);
    comp = parts.length >= 3 && parts.every(Number.isFinite) ? new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0) : new Date(compRaw);
  }
  if (comp && !Number.isNaN(comp.getTime())) {
    const days = Math.ceil((comp.getTime() - Date.now()) / 86400000);
    if (days <= 7) return "performance";
    if (days <= 21) return "stabilization";
    return "acquisition";
  }

  const recentLoad = typeof trainingLoadByDay === "function" ? trainingLoadByDay(14) : [];
  const last7 = recentLoad.slice(-7).reduce((a,b)=>a+Number(b.time||0),0);
  const prev7 = recentLoad.slice(0,7).reduce((a,b)=>a+Number(b.time||0),0);
  const f = cachedFatigueSlope(data.logs || []);
  if ((prev7 && last7 > prev7 * 1.35) || (f && f.slope < -0.25)) return "deload";

  const upgrades = activeRoutines().some(r => targetUpgradeSuggestionForRoutine(r.id));
  if (upgrades) return "performance";

  const unstable = activeRoutines().some(r => {
    const logs = (data.logs || []).filter(l => l.routineId === r.id).slice(-10);
    const psi = performanceStabilityIndex(logs, 10);
    return psi && psi.psi < 55;
  });
  if (unstable) return "stabilization";
  return "acquisition";
}

function phaseSettings(phase) {
  const map = {
    acquisition: {
      label:"Skill acquisition",
      goal:"variety",
      targetAggression:"low",
      durationMultiplier:1.00,
      mix:"More variation, baseline collection, and weaker/undertrained categories.",
      rationale:"Best when learning new skills or building coverage across drills."
    },
    stabilization: {
      label:"Stabilization",
      goal:"stability",
      targetAggression:"medium",
      durationMultiplier:0.95,
      mix:"More anchor drills and repeated setups; fewer new constraints.",
      rationale:"Best when execution is inconsistent and Consistency is low."
    },
    performance: {
      label:"Performance / competition prep",
      goal:"progression",
      targetAggression:"high",
      durationMultiplier:0.90,
      mix:"Stable drills, pressure-like structure, and target upgrades where justified.",
      rationale:"Best when competition is near or high hit-rate/stable drills need pressure."
    },
    deload: {
      label:"Deload / recovery",
      goal:"recovery",
      targetAggression:"none",
      durationMultiplier:0.70,
      mix:"Shorter, lower-complexity technique work; avoid difficulty increases.",
      rationale:"Best when load or fatigue signals are elevated."
    }
  };
  return map[phase] || map.acquisition;
}

function renderPeriodization() {
  const box = $("periodizationOutput");
  if (!box) return;
  const compInput = $("competitionDate");
  if (compInput && !compInput.value) {
    try { compInput.value = localStorage.getItem("snookerPracticePWA.competitionDate") || ""; } catch(e) {}
  }
  const phase = getPeriodizationPhase();
  const s = phaseSettings(phase);
  const horizon = Number($("periodizationHorizon")?.value || 4);
  box.innerHTML = `<div class="phase-card">
    <strong>Active phase: ${escapeHtml(s.label)}</strong>
    <span class="phase-pill">Horizon: ${horizon} week${horizon>1?"s":""}</span>
    <span class="phase-pill">Default goal: ${escapeHtml(s.goal)}</span>
    <span class="phase-pill">Target aggression: ${escapeHtml(s.targetAggression)}</span>
    <div class="adaptive-rationale">${escapeHtml(s.mix)}</div>
    <div class="adaptive-rationale">${escapeHtml(s.rationale)}</div>
  </div>`;
}

function applyPeriodizationToAdaptiveInputs() {
  const phase = getPeriodizationPhase();
  const s = phaseSettings(phase);
  if ($("adaptiveGoal") && $("adaptiveGoal").value === "auto") {
    // Keep visible control as Auto, but adaptiveSessionStructure receives phase-adjusted goal.
  }
  return {phase, settings:s};
}

function expectedRoutineScore(routineId, windowSize=20) {
  const logs = (data.logs || []).filter(l => l.routineId === routineId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0, windowSize);
  if (!logs.length) return null;
  const vals = logs.map(l => Number(l.normalizedScore || 0));
  const base = avg(vals);
  const psi = performanceStabilityIndex(logs, Math.min(10, logs.length));
  const drift = logs.length >= 6 ? performanceDrift(logs.slice().reverse(), Math.min(6, Math.floor(logs.length/2))) : null;
  const stabilityAdj = psi ? (psi.psi - 50) * 0.05 : 0;
  const driftAdj = drift ? Math.max(-5, Math.min(5, drift.deltaPct * 0.08)) : 0;
  return {expected: base + stabilityAdj + driftAdj, base, psi: psi?.psi ?? null, drift: drift?.deltaPct ?? null, n: logs.length};
}

function renderRegretRoutineOptions() {
  const selects = [$("regretChosenRoutine"), $("regretAlternativeRoutine")].filter(Boolean);
  if (!selects.length) return;
  const opts = `<option value="">Select routine</option>` + activeRoutines().map(r => `<option value="${escapeAttr(r.id)}">${escapeHtml(r.name)}</option>`).join("");
  selects.forEach(sel => {
    const current = sel.value;
    sel.innerHTML = opts;
    if (current) sel.value = current;
  });
}

function runRegretComparison() {
  const chosen = $("regretChosenRoutine")?.value || "";
  const alt = $("regretAlternativeRoutine")?.value || "";
  const out = $("regretOutput");
  if (!out) return;
  if (!chosen || !alt || chosen === alt) {
    out.innerHTML = "Select two different routines.";
    return;
  }
  const win = Number($("regretWindow")?.value || 20);
  const c = expectedRoutineScore(chosen, win);
  const a = expectedRoutineScore(alt, win);
  const cr = routineById(chosen);
  const ar = routineById(alt);
  if (!c || !a) {
    out.innerHTML = "Not enough historical data for one or both routines.";
    return;
  }
  const regret = a.expected - c.expected;
  const cls = regret > 5 ? "regret-positive" : regret < -5 ? "regret-good" : "regret-neutral";
  const msg = regret > 5
    ? "The alternative looks materially better in recent comparable history."
    : regret < -5
      ? "The chosen routine looks better than the alternative."
      : "No strong counterfactual difference.";
  out.innerHTML = `<div class="phase-card ${safeClassToken(cls, ["regret-positive","regret-neutral","regret-good"], "regret-neutral")}">
    <strong>Drill comparison ${statHelpButton("regretEngine")}</strong>
    <div>${escapeHtml(cr?.name || "Chosen")}: expected ${c.expected.toFixed(1)} · n=${c.n}${c.psi!==null?` · Consistency ${c.psi.toFixed(0)}`:""}</div>
    <div>${escapeHtml(ar?.name || "Alternative")}: expected ${a.expected.toFixed(1)} · n=${a.n}${a.psi!==null?` · Consistency ${a.psi.toFixed(0)}`:""}</div>
    <div class="adaptive-rationale"><strong>Regret estimate:</strong> ${regret>=0?"+":""}${regret.toFixed(1)} points vs chosen.</div>
    <div class="adaptive-rationale">${escapeHtml(msg)}</div>
    <div class="adaptive-rationale">Interpretation: this is a heuristic selection-quality signal, not proof that the alternative would have caused better performance.</div>
  </div>`;
}

function adaptiveRoutineState(routineOrId, groupedLogs = null) {
  const r = typeof routineOrId === "object" && routineOrId ? routineOrId : routineById(routineOrId);
  const routineId = r?.id || routineOrId;
  const logs = groupedLogs ? ((groupedLogs[String(routineId)] || []).slice()) : (data.logs || []).filter(l => l.routineId === routineId).sort((a,b)=>Date.parse(a.createdAt||0)-Date.parse(b.createdAt||0));
  const recent = logs.slice(-8);
  const hit = recent.length ? targetHitRate(recent) : null;
  const psi = performanceStabilityIndex(logs.slice(-10), 10);
  const drift = logs.length >= 6 ? performanceDrift(logs, Math.min(8, Math.max(5, Math.floor(logs.length/2)))) : null;
  const plateau = plateauDetector(logs, 6);
  const fatigue = cachedFatigueSlope(logs);
  const lastLog = logs.length ? logs[logs.length-1] : null;
  const days = lastLog ? daysSince(lastLog.createdAt) : 999;
  const upgrade = targetUpgradeSuggestionForRoutine(routineId);
  const gap = logs.length ? skillGapIndex(logs.slice(-10)) : null;

  let phase = "baseline";
  const reasons = [];

  if (!logs.length || logs.length < 3) {
    phase = "baseline";
    reasons.push("not enough history");
  } else if (psi && psi.psi < 45) {
    phase = "stabilize";
    reasons.push("low stability");
  } else if (hit !== null && hit >= 80 && psi && psi.psi >= 70 && (!drift || drift.deltaPct >= -2)) {
    phase = "progress";
    reasons.push("high hit rate and stable execution");
  } else if (plateau && plateau.isPlateau) {
    phase = "vary";
    reasons.push("plateau detected");
  } else if (drift && drift.deltaPct < -10) {
    phase = "recover";
    reasons.push("negative performance drift");
  } else if (days >= 14) {
    phase = "refresh";
    reasons.push("not practiced recently");
  } else {
    phase = "maintain";
    reasons.push("normal training zone");
  }

  const targetGap = hit === null ? 0 : Math.max(0, 80 - hit);
  return {routine:r, logs, recent, hit, psi, drift, plateau, fatigue, days, upgrade, gap, targetGap, phase, reasons};
}

function adaptivePriorityScore(state, goal="auto") {
  const r = state?.routine;
  const undertrained = r ? undertrainedCategoryBonus(r.id) : 0;
  return scoreAdaptivePriority(state, goal, undertrained);
}

function adaptiveRoutineExpectedMinutes(r) {
  return Math.max(5, Number(r?.duration || r?.timeMinutes || r?.estimatedMinutes || 10));
}
function adaptiveBlockExpectedMinutes(block) {
  return (block?.picks || []).reduce((sum, pick) => {
    const state = pick.state || pick;
    const reps = Math.max(1, Number(pick.reps || 1));
    return sum + adaptiveRoutineExpectedMinutes(state.routine) * reps;
  }, 0);
}
function adaptivePlanExpectedMinutes(blocks) {
  return (blocks || []).reduce((sum, block) => sum + adaptiveBlockExpectedMinutes(block), 0);
}
function adaptivePickKey(pick) {
  const state = pick.state || pick;
  return state?.routine?.id || "";
}
function normalizeAdaptivePick(pick, reps = 1) {
  if (pick && pick.state) return {...pick, reps:Math.max(1, Number(pick.reps || reps || 1))};
  return {state:pick, reps:Math.max(1, Number(reps || 1))};
}
function flattenAdaptiveRoutineIds(blocks) {
  const ids = [];
  (blocks || []).forEach(block => (block.picks || []).forEach(pick => {
    const state = pick.state || pick;
    const reps = Math.max(1, Number(pick.reps || 1));
    for (let i=0;i<reps;i++) if (state?.routine?.id) ids.push(state.routine.id);
  }));
  return ids;
}
function fillAdaptiveSessionToDuration(blocks, ranked, targetMinutes) {
  if (!ranked.length) return blocks;
  let expected = adaptivePlanExpectedMinutes(blocks);
  let guard = 0;
  let completion = blocks.find(b => b.name === "Completion block");
  if (!completion) {
    completion = {name:"Completion block", minutes:Math.max(10, Math.round(targetMinutes * 0.20)), purpose:"Fill the selected time with the next best adaptive priorities", picks:[]};
    blocks.push(completion);
  }
  while (expected < targetMinutes * 0.92 && guard < 40) {
    const state = ranked[guard % ranked.length];
    const id = state?.routine?.id;
    if (!id) break;
    const existing = completion.picks.find(p => adaptivePickKey(p) === id);
    if (existing) existing.reps = Math.max(1, Number(existing.reps || 1)) + 1;
    else completion.picks.push(normalizeAdaptivePick(state, 1));
    expected += adaptiveRoutineExpectedMinutes(state.routine);
    guard += 1;
  }
  return blocks;
}


function skillGroupForRoutine(routine) {
  const map = getRoutineSkillMap(routine);
  const skill = DEFAULT_SKILLS.find(s => s.id === map.primarySkill);
  return skill?.group || routine?.category || "Uncategorized";
}
function routineTransferValue(routine) {
  const map = getRoutineSkillMap(routine);
  let value = 50;
  const primary = map.primarySkill || "";
  const secondaries = new Set((map.secondarySkills || []).filter(skill => skill && skill !== primary));
  const transfers = new Set((map.transferTags || []).filter(skill => skill && skill !== primary && !secondaries.has(skill)));
  const uniqueSkills = new Set([primary, ...secondaries, ...transfers].filter(Boolean));
  if (["cueing","cue_ball_control","cue_ball_speed","pace_control","long_potting","safety","break_building","positional_play"].some(skill => uniqueSkills.has(skill))) value += 18;
  if (["pressure_resilience","confidence_stability","focus_consistency","stamina"].some(skill => uniqueSkills.has(skill))) value += 10;
  value += Math.min(14, secondaries.size * 3);
  value += Math.min(10, transfers.size * 3);
  const graph = routineGraphTransferProfile(routine);
  value += Math.min(12, graph.totalWeight * 4);
  value += Math.min(8, graph.breadth * 1.5);
  if (routine?.isAnchor) value += 10;
  const category = String(routine?.category || "").toLowerCase();
  if (["potting","cue-ball","technique","safety","break-building"].includes(category)) value += 6;
  if (String(routine?.name || "").toLowerCase().match(/line|long|safety|cue.?ball|black|blue|position|rest|pressure/)) value += 4;
  return Math.max(20, Math.min(100, Math.round(value)));
}
function routineEnergyProfile(state) {
  const r = state?.routine || {};
  const map = getRoutineSkillMap(r);
  const skills = new Set([map.primarySkill, ...(map.secondarySkills || []), ...(map.transferTags || [])].filter(Boolean));
  let cognitive = 2, fatigue = 2, confidence = 2;
  if (skills.has("tactical_decision_making") || skills.has("safety") || skills.has("positional_play") || skills.has("cluster_management")) cognitive += 1;
  if (skills.has("pressure_resilience") || skills.has("focus_consistency")) cognitive += 1;
  if (skills.has("stamina") || Number(r.duration || 0) >= 20) fatigue += 1;
  if (state?.phase === "progress" || state?.upgrade) cognitive += 1;
  if (state?.phase === "stabilize" || state?.phase === "recover") confidence += 1;
  if (String(r.category || "").toLowerCase().includes("mental")) confidence += 1;
  return {cognitive:Math.min(5,cognitive), fatigue:Math.min(5,fatigue), confidence:Math.min(5,confidence)};
}

function recentReflectionContext(windowSize=8) {
  const sessionById = Object.fromEntries((data.sessions || []).map(s => [s.id, s]));
  const logs = (data.logs || []).slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const recent = logs.slice(-Math.max(windowSize, 12));
  const recentSessions = [...new Map(recent.map(l => [l.sessionId, sessionById[l.sessionId]]).filter(x => x[0] && x[1]?.reflection)).values()].slice(-windowSize);
  const getRating = (ref, key) => Number(ref?.[key] ?? ref?.[key + "Rating"]);
  const nums = key => recentSessions.map(s => getRating(s.reflection, key)).filter(Number.isFinite);
  const focusVals = nums("focus");
  const confidenceVals = nums("confidence");
  const fatigueVals = nums("fatigue");
  const cueingVals = nums("cueing");
  const mentalVals = nums("mentalSharpness");
  const scoreVals = recent.map(l => Number(l.normalizedScore || 0)).filter(Number.isFinite);
  const mean = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : null;
  const fatigue = mean(fatigueVals);
  const focus = mean(focusVals);
  const confidence = mean(confidenceVals);
  const cueing = mean(cueingVals);
  const mental = mean(mentalVals);
  const recentAvg = scoreVals.length ? mean(scoreVals.slice(-Math.min(4, scoreVals.length))) : null;
  const priorAvg = scoreVals.length > 4 ? mean(scoreVals.slice(0,-4)) : null;
  const volatility = scoreVals.length >= 3 ? stdDev(scoreVals) : null;
  const sessionPerf = recentSessions.map(s => {
    const linked = recent.filter(l => l.sessionId === s.id).map(l => Number(l.normalizedScore || 0)).filter(Number.isFinite);
    return {ref:s.reflection || {}, score: linked.length ? mean(linked) : null};
  }).filter(x => x.score !== null);
  const goodScoreBadFeel = sessionPerf.filter(x => x.score >= 75 && (getRating(x.ref,"confidence") <= 2 || getRating(x.ref,"focus") <= 2 || getRating(x.ref,"cueing") <= 2)).length;
  const badScoreGoodFeel = sessionPerf.filter(x => x.score <= 45 && (getRating(x.ref,"confidence") >= 4 || getRating(x.ref,"focus") >= 4 || getRating(x.ref,"cueing") >= 4)).length;
  return {recent, recentSessions, focus, confidence, fatigue, cueing, mental, recentAvg, priorAvg, volatility, goodScoreBadFeel, badScoreGoodFeel};
}
function inferTrainingStateMode(context=recentReflectionContext()) {
  const fatigue = Number(context.fatigue || 0);
  const confidence = Number(context.confidence || 0);
  const focus = Number(context.focus || 0);
  const volatility = Number(context.volatility || 0);
  const improvingFeel = Number(context.badScoreGoodFeel || 0) >= 2;
  const unstableGood = Number(context.goodScoreBadFeel || 0) >= 2;
  if ((fatigue >= 4 && confidence && confidence <= 3) || (focus && focus <= 2.5) || unstableGood) {
    return {mode:"recovery", label:"Recovery", reason: unstableGood ? "good scores have recently appeared with poor feel" : "fatigue/focus/confidence context is fragile"};
  }
  if (improvingFeel || (confidence >= 4 && context.recentAvg !== null && context.recentAvg < 55)) {
    return {mode:"acquisition", label:"Acquisition", reason:"process feel is positive while scores still need consolidation"};
  }
  if (confidence >= 4 && focus >= 4 && fatigue <= 3 && volatility < 14) {
    return {mode:"performance", label:"Performance", reason:"confidence/focus are strong and volatility is controlled"};
  }
  return {mode:"consolidation", label:"Consolidation", reason:"stable enough for skill transfer and medium pressure"};
}
function routineVolatilityProfile(routine, stats) {
  const vals = (stats?.vals || routineStats(routine?.id).vals || []).filter(Number.isFinite);
  const globalVals = (data.logs || []).map(safeLogScoreForTargetInterval).filter(Number.isFinite);
  const globalFallback = globalVals.length >= 8 ? Math.max(6, Math.min(18, stdDev(globalVals))) : 10;
  const sd = vals.length >= 3 ? stdDev(vals) : globalFallback;
  const map = getRoutineSkillMap(routine);
  const skills = new Set([map.primarySkill, ...(map.secondarySkills || []), ...(map.transferTags || [])].filter(Boolean));
  let base = sd;
  if (skills.has("pressure_resilience") || skills.has("long_potting") || skills.has("escape_shots")) base += 4;
  if (routine?.isAnchor) base -= 4;
  const level = base >= 18 ? "high" : base >= 10 ? "medium" : "low";
  return {score:Math.max(0, Math.round(base)), level};
}
function recommendationOutcomeSignal(routineId) {
  const rows = ensureRecommendationFeedbackStore().filter(x => x.routineId === routineId && x.scoreAfter !== null && x.improvementAfterRecommendation !== null).slice(-12);
  if (!rows.length) return {score:0, label:"no outcome evidence"};
  const improvement = avg(rows.map(x => Number(x.improvementAfterRecommendation || 0)));
  const completionRate = rows.filter(x => x.completedAt).length / rows.length;
  const score = Math.max(-10, Math.min(14, improvement * 0.25 + completionRate * 6));
  return {score, label:`recommendation outcomes ${improvement >= 0 ? "+" : ""}${improvement.toFixed(1)} avg`};
}
function recommendationLearningProfile(routineId) {
  try {
    const rows = ensureRecommendationFeedbackStore()
      .filter(x => x.routineId === routineId && !x.toggledOffAt)
      .slice(-60);
    if (!rows.length) return {score:0, label:"no recommendation learning yet", evidence:"low evidence", accepted:0, skipped:0, completed:0, skipRate:0, completionRate:0, avgImprovement:null, reasons:[]};
    const activeRows = rows.filter(x => !x.supersededAt || x.action === "completed");
    const accepted = activeRows.filter(x => x.action === "accepted" || x.action === "completed").length;
    const skipped = activeRows.filter(x => x.action === "skipped").length;
    const completed = activeRows.filter(x => x.action === "completed" && x.scoreAfter !== null).length;
    const completedRows = activeRows.filter(x => x.action === "completed" && x.improvementAfterRecommendation !== null);
    const totalDecision = accepted + skipped;
    const skipRate = totalDecision ? skipped / totalDecision : 0;
    const completionRate = accepted ? completed / accepted : 0;
    const avgImprovement = completedRows.length ? avg(completedRows.map(x => Number(x.improvementAfterRecommendation || 0))) : null;
    const evidence = evidenceStrength(activeRows.length);
    let score = 0;
    const reasons = [];
    if (avgImprovement !== null) {
      const outcomeScore = Math.max(-12, Math.min(16, avgImprovement * 0.32));
      score += outcomeScore;
      reasons.push(`post-recommendation outcome ${avgImprovement >= 0 ? "+" : ""}${avgImprovement.toFixed(1)}`);
    }
    if (completed >= 3 && completionRate >= 0.55) { score += 5; reasons.push("usually completed after acceptance"); }
    if (skipped >= 3 && skipRate >= 0.55) { score -= 10; reasons.push("often skipped by user"); }
    else if (skipped >= 2 && skipRate >= 0.4) { score -= 5; reasons.push("sometimes skipped by user"); }
    if (accepted >= 4 && skipRate <= 0.25) { score += 3; reasons.push("accepted pattern"); }
    score = Math.max(-16, Math.min(18, score * Math.max(0.35, evidence.factor)));
    const label = avgImprovement === null
      ? `${accepted} accepted · ${skipped} skipped · ${completed} completed`
      : `${accepted} accepted · ${skipped} skipped · ${completed} completed · ${avgImprovement >= 0 ? "+" : ""}${avgImprovement.toFixed(1)} after`;
    return {score:Math.round(score * 10) / 10, label, evidence:evidence.label, accepted, skipped, completed, skipRate, completionRate, avgImprovement, reasons:reasons.slice(0,4)};
  } catch (err) {
    console.warn("Recommendation learning profile skipped", err);
    return {score:0, label:"recommendation learning unavailable", evidence:"low evidence", accepted:0, skipped:0, completed:0, skipRate:0, completionRate:0, avgImprovement:null, reasons:[]};
  }
}
function recommendationLearningReasonForRoutine(routineId) {
  const p = recommendationLearningProfile(routineId);
  if (!p || (!p.accepted && !p.skipped && !p.completed)) return "recommendation learning: no personal feedback yet";
  if (p.skipRate >= 0.55 && p.skipped >= 3) return "recommendation learning: frequently skipped, down-weighted";
  if (p.completed >= 3 && Number(p.avgImprovement || 0) > 0) return `recommendation learning: completed recommendations improved by ${p.avgImprovement.toFixed(1)} on average`;
  if (p.completed >= 3 && Number(p.avgImprovement || 0) < 0) return `recommendation learning: completed recommendations underperformed by ${Math.abs(p.avgImprovement).toFixed(1)} on average`;
  return `recommendation learning: ${p.label}`;
}
function recommendationLearningInsight() {
  try {
    const rows = ensureRecommendationFeedbackStore().filter(x => !x.toggledOffAt).slice(-120);
    if (!rows.length) {
      return `<div class="insight-card watch"><strong>Recommendation learning v2</strong><div class="muted small">No recommendation feedback yet. Accept/skip/completion data will personalize future recommendations.</div></div>`;
    }
    const completedRows = rows.filter(x => x.action === "completed" && x.improvementAfterRecommendation !== null);
    const accepted = rows.filter(x => x.action === "accepted" || x.action === "completed").length;
    const skipped = rows.filter(x => x.action === "skipped").length;
    const completed = completedRows.length;
    const avgImprovement = completedRows.length ? avg(completedRows.map(x => Number(x.improvementAfterRecommendation || 0))) : null;
    const profiles = activeRoutines().map(r => ({routine:r, learning:recommendationLearningProfile(r.id)}))
      .filter(x => x.learning.accepted || x.learning.skipped || x.learning.completed)
      .sort((a,b) => Math.abs(b.learning.score) - Math.abs(a.learning.score))
      .slice(0,4);
    const cls = avgImprovement !== null && avgImprovement > 1 ? "good" : avgImprovement !== null && avgImprovement < -1 ? "risk" : "watch";
    const improvementTxt = avgImprovement === null ? "N/A" : `${avgImprovement >= 0 ? "+" : ""}${avgImprovement.toFixed(1)}`;
    return `<div class="insight-card ${cls}"><strong>Recommendation learning v2</strong>
      <div class="context-row"><span>Feedback loop</span><strong>${accepted} accepted · ${skipped} skipped</strong><span>${completed} completed</span></div>
      <div class="context-row"><span>Avg outcome after completed recommendation</span><strong>${htmlText(improvementTxt)}</strong><span>${htmlText(evidenceStrength(rows.length).label)}</span></div>
      ${profiles.length ? profiles.map(x => `<div class="context-row"><span>${htmlText(x.routine.name)}<br><span class="muted">${htmlText(x.learning.reasons.join(" · ") || x.learning.label)}</span></span><strong>${x.learning.score >= 0 ? "+" : ""}${x.learning.score.toFixed(1)}</strong><span>${htmlText(x.learning.evidence)}</span></div>`).join("") : `<div class="muted small">No routine-level learning pattern yet.</div>`}
      <div class="adaptive-rationale">The engine now uses accepted/skipped/completed outcomes as soft weights. Repeated skips down-weight a routine; positive completed outcomes increase its personalized ranking.</div>
    </div>`;
  } catch (err) {
    console.warn("Recommendation learning insight skipped", err);
    return `<div class="insight-card watch"><strong>Recommendation learning v2</strong><div class="muted small">Recommendation learning unavailable for this data set.</div></div>`;
  }
}
function contextualFitForRoutine(routine, stats, stateModeObj=inferTrainingStateMode()) {
  const map = getRoutineSkillMap(routine);
  const skills = new Set([map.primarySkill, ...(map.secondarySkills || []), ...(map.transferTags || [])].filter(Boolean));
  const energy = routineEnergyProfile({routine, phase:"maintain"});
  const volatility = routineVolatilityProfile(routine, stats);
  const transfer = routineTransferValue(routine);
  let score = 0;
  const reasons = [];
  const mode = stateModeObj.mode;
  if (mode === "recovery") {
    if (routine?.isAnchor || Number(stats?.logs?.length || 0) >= 6) { score += 12; reasons.push("familiar recovery fit"); }
    if (volatility.level === "low") { score += 8; reasons.push("low volatility"); }
    score -= (energy.cognitive + energy.fatigue + energy.confidence) * 1.25;
    if (skills.has("confidence_stability") || skills.has("cueing") || skills.has("pace_control")) { score += 5; reasons.push("confidence-preserving skill"); }
  } else if (mode === "acquisition") {
    if (skills.has("cueing") || skills.has("cue_ball_control") || skills.has("pace_control") || skills.has("positional_play")) { score += 9; reasons.push("high-feedback acquisition fit"); }
    if (volatility.level === "high") { score -= 5; reasons.push("reduced for high volatility"); }
    if (transfer >= 70) { score += 6; reasons.push("foundational transfer"); }
  } else if (mode === "performance") {
    if (skills.has("pressure_resilience") || skills.has("safety") || skills.has("break_building") || volatility.level !== "low") { score += 10; reasons.push("performance-test fit"); }
    if (transfer >= 65) { score += 4; reasons.push("match-relevant transfer"); }
  } else {
    if (transfer >= 65) { score += 8; reasons.push("consolidation transfer value"); }
    if (volatility.level === "medium") { score += 3; reasons.push("controlled variability"); }
  }
  const formAdj = currentFormAdjustmentForRoutine(routine);
  score += formAdj.score;
  reasons.push(...formAdj.reasons);
  return {score:Math.round(score), reasons, volatility, energy, stateMode:stateModeObj, transfer, currentForm:formAdj.form};
}
function buildContextAwareReason(profile) {
  const fit = profile?.contextualFit;
  if (!fit) return "Context fit not calculated";
  const bits = [];
  bits.push(`${fit.stateMode.label} mode: ${fit.stateMode.reason}`);
  bits.push(`volatility ${fit.volatility.level}`);
  bits.push(`transfer ${fit.transfer}/100`);
  if (fit.currentForm?.label) bits.push(`form ${fit.currentForm.label.toLowerCase()}`);
  if (profile?.transferNeed?.score) bits.push(`graph need +${profile.transferNeed.score}`);
  if (fit.reasons?.length) bits.push(fit.reasons.slice(0,2).join(" · "));
  return bits.join(" · ");
}

function sessionBudgetsForGoal(goal, targetMinutes) {
  const scale = Math.max(0.75, Math.min(1.6, targetMinutes / 60));
  if (goal === "recovery") return {cognitive:Math.round(8*scale), fatigue:Math.round(7*scale), confidence:Math.round(6*scale), maxSwitches:3};
  if (goal === "progression") return {cognitive:Math.round(14*scale), fatigue:Math.round(13*scale), confidence:Math.round(11*scale), maxSwitches:5};
  if (goal === "variety") return {cognitive:Math.round(13*scale), fatigue:Math.round(12*scale), confidence:Math.round(10*scale), maxSwitches:6};
  return {cognitive:Math.round(12*scale), fatigue:Math.round(11*scale), confidence:Math.round(9*scale), maxSwitches:4};
}
function scoreWithSmartSessionArchitecture(state, baseScore, goal) {
  const transfer = routineTransferValue(state.routine);
  const energy = routineEnergyProfile(state);
  const ctx = contextualFitForRoutine(state.routine, {logs:state.logs || [], vals:(state.logs||[]).map(l=>Number(l.normalizedScore||0)), hit:state.hit}, inferTrainingStateMode());
  let score = baseScore + transfer * 0.18 + ctx.score * 0.65;
  if (goal === "recovery") {
    if (["maintain","recover","stabilize"].includes(state.phase)) score += 8;
    score -= (energy.cognitive + energy.fatigue + energy.confidence) * 1.45;
    if (ctx.volatility.level === "low") score += 6;
  } else if (goal === "progression") {
    if (state.phase === "progress" || state.upgrade) score += 9;
    score += transfer * 0.08;
  } else if (goal === "stability") {
    if (["stabilize","maintain"].includes(state.phase)) score += 8;
    if (ctx.volatility.level === "high") score -= 3;
  } else if (goal === "variety") {
    if (["vary","refresh","baseline"].includes(state.phase)) score += 7;
  }
  return score;
}
function blockTypeForState(state, goal) {
  const primary = getRoutineSkillMap(state.routine).primarySkill;
  if (state.routine?.isAnchor || state.phase === "baseline") return "warmup";
  if (goal === "recovery") return "recovery";
  if (["cueing","cue_ball_control","pace_control","long_potting","safety","break_building","positional_play"].includes(primary)) return "primary";
  if ((getRoutineSkillMap(state.routine).transferTags || []).length) return "transfer";
  if (["pressure_resilience","focus_consistency","confidence_stability","stamina"].includes(primary) || state.routine?.category === "mental") return "pressure";
  return "transfer";
}
function budgetUsageForBlocks(blocks) {
  const usage = {cognitive:0, fatigue:0, confidence:0, switches:0};
  let prevGroup = "";
  (blocks || []).forEach(block => (block.picks || []).forEach(pick => {
    const state = pick.state || pick;
    const reps = Math.max(1, Number(pick.reps || 1));
    const energy = routineEnergyProfile(state);
    usage.cognitive += energy.cognitive * reps;
    usage.fatigue += energy.fatigue * reps;
    usage.confidence += energy.confidence * reps;
    const group = skillGroupForRoutine(state.routine);
    if (prevGroup && group !== prevGroup) usage.switches += 1;
    prevGroup = group;
  }));
  return usage;
}
function budgetBadgeClass(value, limit) {
  if (!limit) return "";
  return value <= limit ? "adaptive-ok" : value <= limit * 1.2 ? "adaptive-watch" : "adaptive-risk";
}
function ensureRecommendationFeedbackStore(){ data.recommendationFeedback = Array.isArray(data.recommendationFeedback) ? data.recommendationFeedback : []; return data.recommendationFeedback; }
function recommendationFeedbackSummary(routineId="") {
  const rows = ensureRecommendationFeedbackStore().filter(x => !routineId || x.routineId === routineId).slice(-80);
  const counts = rows.reduce((acc,x)=>{ acc[x.action]=(acc[x.action]||0)+1; return acc; },{});
  return {rows, counts, accepted:counts.accepted||0, skipped:counts.skipped||0, completed:counts.completed||0};
}
function latestOpenRecommendationFeedbackIndex(routineId, source="smart_session_builder") {
  const rows = ensureRecommendationFeedbackStore();
  for (let i = rows.length - 1; i >= 0; i--) {
    const x = rows[i];
    if (x?.routineId !== routineId) continue;
    if ((x.source || "smart_session_builder") !== source) continue;
    if (!["accepted", "skipped"].includes(x.action)) continue;
    if (x.supersededAt || x.toggledOffAt || x.scoreAfter !== null) continue;
    return i;
  }
  return -1;
}
function currentRecommendationFeedbackStatus(routineId, source="smart_session_builder") {
  const idx = latestOpenRecommendationFeedbackIndex(routineId, source);
  return idx >= 0 ? ensureRecommendationFeedbackStore()[idx].action : null;
}
function trackRecommendationFeedback(routineId, action, meta={}) {
  if (!routineId || !["accepted", "skipped"].includes(action)) return;
  const source = meta.source || "smart_session_builder";
  const rows = ensureRecommendationFeedbackStore();
  const r = routineById(routineId);
  const beforeLogs = (data.logs || []).filter(l => l.routineId === routineId).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const beforeScore = beforeLogs.length ? Number(beforeLogs[0].normalizedScore || normalizeScore(beforeLogs[0]) || 0) : null;
  const now = new Date().toISOString();
  const previousIndex = latestOpenRecommendationFeedbackIndex(routineId, source);
  const previousSnapshot = previousIndex >= 0 ? {...rows[previousIndex]} : null;
  let newRowId = null;
  let message = "Recommendation feedback recorded.";
  let tone = action === "skipped" ? "warn" : "ok";
  if (previousIndex >= 0 && rows[previousIndex].action === action) {
    rows[previousIndex].toggledOffAt = now;
    rows[previousIndex].supersededAt = now;
    rows[previousIndex].supersededByAction = "cleared";
    message = action === "accepted" ? "Recommendation acceptance cleared." : "Recommendation skip cleared.";
    tone = "info";
  } else {
    if (previousIndex >= 0) {
      rows[previousIndex].supersededAt = now;
      rows[previousIndex].supersededByAction = action;
    }
    const row = {
      id:uuid(), routineId, routineName:r?.name || "", action, source, createdAt:now, scoreBefore:beforeScore,
      scoreAfter:null, improvementAfterRecommendation:null, appVersion:APP_VERSION
    };
    newRowId = row.id;
    rows.push(row);
    if (rows.length > 400) {
      data.recommendationFeedback = rows
        .slice()
        .sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
        .slice(0, 300)
        .sort((a,b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    }
    message = action === "accepted" ? "Recommendation accepted." : "Recommendation skipped.";
  }
  const undo = () => {
    const store = ensureRecommendationFeedbackStore();
    if (newRowId) {
      const idx = store.findIndex(x => x.id === newRowId);
      if (idx >= 0) store.splice(idx, 1);
    }
    if (previousSnapshot) {
      const idx = store.findIndex(x => x.id === previousSnapshot.id);
      if (idx >= 0) store[idx] = previousSnapshot;
      else store.push(previousSnapshot);
      store.sort((a,b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    }
    saveData({render:"all", immediateIDB:true});
    showTransientNotice("Recommendation feedback restored.", "ok");
  };
  saveData({render:"all", immediateIDB:true});
  showTransientNotice(message, tone, {label:"Undo", handler:undo});
}
function updateRecommendationCompletionFromLog(log) {
  if (!log?.routineId) return;
  const rows = ensureRecommendationFeedbackStore().filter(x => x.routineId === log.routineId && x.action === "accepted" && x.scoreAfter === null && !x.supersededAt && !x.toggledOffAt).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const row = rows[0];
  if (!row) return;
  row.action = "completed";
  row.completedAt = new Date().toISOString();
  row.scoreAfter = Number(log.normalizedScore || normalizeScore(log) || 0);
  row.improvementAfterRecommendation = row.scoreBefore === null ? null : row.scoreAfter - Number(row.scoreBefore || 0);
}
function renderFeedbackButtons(routineId, source="smart_session_builder") {
  if (!routineId) return "";
  const status = currentRecommendationFeedbackStatus(routineId, source);
  const acceptActive = status === "accepted" ? " active" : "";
  const skipActive = status === "skipped" ? " active" : "";
  return `<div class="row compact-action-row recommendation-feedback-row"><button type="button" class="secondary recommendation-feedback-btn${acceptActive}" aria-pressed="${status === "accepted" ? "true" : "false"}" data-action="recommendation-feedback" data-id="${attrText(routineId)}" data-feedback="accepted" data-source="${attrText(source)}">${status === "accepted" ? "Accepted" : "Accept"}</button><button type="button" class="secondary recommendation-feedback-btn${skipActive}" aria-pressed="${status === "skipped" ? "true" : "false"}" data-action="recommendation-feedback" data-id="${attrText(routineId)}" data-feedback="skipped" data-source="${attrText(source)}">${status === "skipped" ? "Skipped" : "Skip"}</button></div>`;
}

function smartSessionCopy(key){
  return uiLabel(key);
}
function smartBlockName(blockType, fallback=""){
  const map = {warmup:"warmupCalibration", primary:"primarySkillBlock", transfer:"carryoverBlock", pressure:"pressureBlock", confidence:"finishStrong", completion:"completionBlock"};
  const key = map[blockType];
  return key ? uiLabel(key) : (fallback || blockType || "Block");
}
function smartBlockPurpose(blockType, fallback=""){
  if(getInsightLanguageSetting() !== "friendly") return fallback;
  const copy = {
    warmup:"Get calibrated before the main work.",
    primary:"Focus on the skill that matters most today.",
    transfer:"Use a related drill that carries over into the main skill.",
    pressure:"Add controlled match pressure without overloading the session.",
    confidence:"Finish on a familiar drill and leave the table clean.",
    completion:"Use remaining time on the next useful priority."
  };
  return copy[blockType] || fallback;
}
function smartGoalLabel(goal){
  if(getInsightLanguageSetting() !== "friendly") return goal;
  return ({recovery:"Recovery", progression:"Progress", stability:"Stability", variety:"Balanced", auto:"Auto"})[goal] || goal;
}
function smartRecommendationModeLabel(mode){
  if(getInsightLanguageSetting() !== "friendly") return mode === "thompson" ? "Exploration" : mode === "hybrid" ? "Balanced" : "Stable";
  return mode === "thompson" ? "Thompson Sampling" : mode === "hybrid" ? "Hybrid" : "Heuristic";
}

function adaptiveSessionStructure(goal, duration, strictness, periodization = {}) {
  const targetMinutes = Number(duration || 60);
  const horizonWeeks = Math.max(1, Number(periodization.horizonWeeks || $("periodizationHorizon")?.value || 4));
  const compDateRaw = periodization.competitionDate || $("competitionDate")?.value || "";
  let compDate = null;
  if (compDateRaw) {
    const parts = String(compDateRaw).split("-").map(Number);
    compDate = parts.length >= 3 && parts.every(Number.isFinite) ? new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0) : new Date(compDateRaw);
  }
  const rawDaysToCompetition = compDate && !Number.isNaN(compDate.getTime()) ? Math.ceil((compDate.getTime() - Date.now()) / 86400000) : null;
  const daysToCompetition = rawDaysToCompetition !== null && rawDaysToCompetition >= 0 ? rawDaysToCompetition : null;
  const focusOverride = $("orchestratorFocus")?.value || "all";
  const strategy = $("orchestratorStrategy")?.value || "balanced";
  const intensity = $("orchestratorIntensity")?.value || "balanced";
  const routinePool = recommendationEligibleRoutines().filter(r => focusOverride === "all" || r.category === focusOverride);
  const adaptiveLogMap = getLogsByRoutineMap(data.logs || []);
  let states = routinePool.map(r => adaptiveRoutineState(r, adaptiveLogMap));
  if (!states.length) states = recommendationEligibleRoutines().map(r => adaptiveRoutineState(r, adaptiveLogMap));
  const recommendationModeForBuilder = getSmartRecommendationMode();
  const recommendationProfiles = new Map(rankRoutinesByMode(focusOverride, strategy, recommendationModeForBuilder).map(x => [x.routine.id, x]));
  const ranked = states.map(s => {
    let boost = 0;
    const profile = recommendationProfiles.get(s.routine.id);
    const recommendationScore = profile ? (recommendationModeForBuilder === "thompson" ? profile.sampledValue : recommendationModeForBuilder === "hybrid" ? profile.hybridScore : profile.score) : 0;
    if (strategy === "explore") boost += Math.min(20, Math.max(0, 30 - Number(s.n || 0)));
    if (strategy === "exploit" && s.phase === "stabilize") boost += 12;
    if (strategy === "exploit" && s.targetGap > 0) boost += Math.min(12, s.targetGap / 2);
    if (intensity === "pressure" && ["safety","mental","break-building"].includes(s.routine.category)) boost += 8;
    if (intensity === "technical" && ["potting","cue-ball","technique"].includes(s.routine.category)) boost += 8;
    if (profile?.selectionType === "exploration") boost += 4;
    const baseAdaptiveScore = adaptivePriorityScore(s, goal) + boost + recommendationScore * 0.28;
    const smartScore = scoreWithSmartSessionArchitecture(s, baseAdaptiveScore, goal);
    const transferValue = routineTransferValue(s.routine);
    const energyProfile = routineEnergyProfile(s);
    return {...s, adaptiveScore: smartScore, transferValue, energyProfile, blockType:blockTypeForState(s, goal), recommendationProfile:profile, reasons:[...(s.reasons || []), `transfer value ${transferValue}/100`, `energy load C${energyProfile.cognitive}/F${energyProfile.fatigue}/Conf${energyProfile.confidence}`, buildContextAwareReason(profile || {contextualFit:contextualFitForRoutine(s.routine, {logs:s.logs||[], vals:(s.logs||[]).map(l=>Number(l.normalizedScore||0)), hit:s.hit})}), ...(profile?.reasons || []).slice(0,3)]};
  }).sort((a,b)=>b.adaptiveScore-a.adaptiveScore);
  const anchors = ranked.filter(s => s.routine.isAnchor).slice(0, strictness === "high" ? 3 : 2);
  const main = ranked.filter(s => !anchors.some(a=>a.routine.id===s.routine.id));

  const fatigueAll = cachedFatigueSlope(data.logs || []);
  const recentLoad = trainingLoadByDay ? trainingLoadByDay(14) : [];
  const last7 = recentLoad.slice(-7).reduce((a,b)=>a+Number(b.time||0),0);
  const prev7 = recentLoad.slice(0,7).reduce((a,b)=>a+Number(b.time||0),0);
  let effectiveGoal = goal;
  const globalReasons = [];
  const contextualState = inferTrainingStateMode();

  if (goal === "auto" && contextualState.mode === "recovery") {
    effectiveGoal = "recovery";
    globalReasons.push(`context mode: ${contextualState.label.toLowerCase()} — ${contextualState.reason}`);
  } else if (goal === "auto" && contextualState.mode === "performance") {
    effectiveGoal = "progression";
    globalReasons.push(`context mode: ${contextualState.label.toLowerCase()} — ${contextualState.reason}`);
  } else if (daysToCompetition !== null && daysToCompetition <= 7 && goal === "auto") {
    effectiveGoal = "recovery";
    globalReasons.push(`competition in ${daysToCompetition} day${daysToCompetition === 1 ? "" : "s"}; taper volume and protect confidence`);
  } else if (daysToCompetition !== null && daysToCompetition <= 21 && goal === "auto") {
    effectiveGoal = "stability";
    globalReasons.push(`competition in ${daysToCompetition} days; prioritize stable match-relevant routines`);
  } else if (goal === "auto") {
    if (fatigueAll && fatigueAll.slope < -0.25) {
      effectiveGoal = "recovery";
      globalReasons.push("global stamina drop-off is negative");
    } else if (prev7 && last7 > prev7 * 1.35) {
      effectiveGoal = "recovery";
      globalReasons.push("training load rose sharply");
    } else if (ranked.some(s => s.upgrade)) {
      effectiveGoal = "progression";
      globalReasons.push("one or more drills are ready for target increase");
    } else if (ranked.some(s => s.phase === "stabilize")) {
      effectiveGoal = "stability";
      globalReasons.push("some drills are unstable");
    } else {
      effectiveGoal = "variety";
      globalReasons.push("no acute weakness; use robustness/variety");
    }
  } else {
    globalReasons.push(`manual goal: ${goal}`);
  }

  let blocks = [];
  const used = new Set();

  function take(predicate, n) {
    const arr = [];
    for (const s of ranked) {
      if (arr.length >= n) break;
      if (used.has(s.routine.id)) continue;
      if (predicate(s)) {
        used.add(s.routine.id);
        arr.push(s);
      }
    }
    return arr;
  }

  const anchorPicks = anchors.filter(s => !used.has(s.routine.id));
  anchorPicks.forEach(s => used.add(s.routine.id));

  function takeType(type, n, fallback) {
    return take(s => (s.blockType === type) || (typeof fallback === "function" && fallback(s)), n);
  }

  if (effectiveGoal === "recovery") {
    const familiar = ranked.filter(s => Number(s.logs?.length || 0) >= 4 || s.routine.isAnchor);
    blocks.push({name:(getInsightLanguageSetting()==="friendly"?uiLabel("recoveryCalibration"):"Recovery calibration"), blockType:"warmup", minutes:Math.max(8, Math.round(targetMinutes*0.18)), purpose:smartBlockPurpose("warmup", "Familiar baseline work with low volatility"), picks:take(s => s.routine.isAnchor || Number(s.logs?.length || 0) >= 6, strictness === "high" ? 1 : 2)});
    blocks.push({name:(getInsightLanguageSetting()==="friendly"?uiLabel("lowSwitchPrimaryBlock"):"Low-switch primary block"), blockType:"primary", minutes:Math.round(targetMinutes*0.45), purpose:smartBlockPurpose("primary", "One or two familiar drills; protect confidence and reduce context switching"), picks:take(s => familiar.includes(s) && ["recover","stabilize","maintain"].includes(s.phase), 2)});
    blocks.push({name:(getInsightLanguageSetting()==="friendly"?uiLabel("finishStrong"):"Confidence finish"), blockType:"confidence", minutes:Math.max(8, Math.round(targetMinutes*0.18)), purpose:smartBlockPurpose("confidence", "End on a familiar, achievable drill rather than a volatile test"), picks:take(s => Number(s.logs?.length || 0) >= 4 && s.phase !== "progress", 1)});
  } else {
    if (anchorPicks.length) {
      blocks.push({name:(getInsightLanguageSetting()==="friendly"?uiLabel("warmupCalibration"):"Warm-up / calibration"), blockType:"warmup", minutes:Math.max(8, Math.round(targetMinutes*0.16)), purpose:smartBlockPurpose("warmup", "Calibrate cueing and create a same-session baseline"), picks:anchorPicks.slice(0, strictness === "high" ? 2 : 1)});
    } else {
      blocks.push({name:(getInsightLanguageSetting()==="friendly"?uiLabel("warmupCalibration"):"Warm-up / calibration"), blockType:"warmup", minutes:Math.max(8, Math.round(targetMinutes*0.14)), purpose:smartBlockPurpose("warmup", "Start with low-friction baseline work before the main load"), picks:take(s => s.phase === "baseline" || s.phase === "maintain", 1)});
    }
    const primaryPredicate = effectiveGoal === "progression" ? (s => s.phase === "progress" || s.upgrade || s.blockType === "primary") : effectiveGoal === "stability" ? (s => s.phase === "stabilize" || s.psi?.psi < 70 || s.blockType === "primary") : (s => s.blockType === "primary");
    blocks.push({name:(getInsightLanguageSetting()==="friendly"?uiLabel("primarySkillBlock"):"Primary skill block"), blockType:"primary", minutes:Math.round(targetMinutes*0.38), purpose:smartBlockPurpose("primary", "Main work selected by weakness, evidence, and transfer value"), picks:take(primaryPredicate, strictness === "high" ? 3 : 2)});
    blocks.push({name:(getInsightLanguageSetting()==="friendly"?uiLabel("carryoverBlock"):"Transfer block"), blockType:"transfer", minutes:Math.round(targetMinutes*0.22), purpose:smartBlockPurpose("transfer", "Use adjacent drills that should transfer into the primary skill"), picks:takeType("transfer", 2, s => (getRoutineSkillMap(s.routine).transferTags || []).length)});
    const pressureName = getInsightLanguageSetting()==="friendly" ? uiLabel("pressureBlock") : (daysToCompetition !== null && daysToCompetition <= 21 ? "Competition pressure / robustness block" : "Pressure or robustness block");
    blocks.push({name:pressureName, blockType:"pressure", minutes:Math.round(targetMinutes*0.16), purpose:smartBlockPurpose("pressure", "Add controlled pressure, robustness, or match-relevant variability"), picks:takeType("pressure", 2, s => s.routine.category === "mental" || s.routine.category === "safety" || ["vary","stabilize"].includes(s.phase))});
    blocks.push({name:(getInsightLanguageSetting()==="friendly"?uiLabel("finishStrong"):"Confidence finish"), blockType:"confidence", minutes:Math.max(8, Math.round(targetMinutes*0.10)), purpose:smartBlockPurpose("confidence", "Finish with a confidence-preserving familiar drill"), picks:take(s => Number(s.logs?.length || 0) >= 3 && ["maintain","progress","stabilize"].includes(s.phase), 1)});
  }

  const remaining = take(s => true, effectiveGoal === "recovery" ? 1 : 2);
  if (remaining.length) {
    blocks.push({name:(getInsightLanguageSetting()==="friendly"?uiLabel("completionBlock"):"Completion block"), blockType:"completion", minutes:Math.max(8, targetMinutes - blocks.reduce((a,b)=>a+b.minutes,0)), purpose:smartBlockPurpose("completion", "Fill remaining time with the next best budget-compatible priorities"), picks:remaining});
  }

  blocks = blocks.filter(b => b.picks && b.picks.length).map(b => ({...b, picks:(b.picks || []).map(p => normalizeAdaptivePick(p, 1))}));
  blocks = fillAdaptiveSessionToDuration(blocks, ranked, targetMinutes);
  blocks.forEach(b => { b.minutes = Math.max(5, Math.round(adaptiveBlockExpectedMinutes(b))); });
  const routineIds = flattenAdaptiveRoutineIds(blocks);
  const estimatedMinutes = adaptivePlanExpectedMinutes(blocks);
  const budgets = sessionBudgetsForGoal(effectiveGoal, targetMinutes);
  const budgetUsage = budgetUsageForBlocks(blocks);
  return {effectiveGoal, targetMinutes, estimatedMinutes, horizonWeeks, daysToCompetition, globalReasons, blocks, routineIds, ranked, budgets, budgetUsage};
}

function renderAdaptiveSession() {
  const rawGoal = $("adaptiveGoal")?.value || "auto";
  const phaseInfo = applyPeriodizationToAdaptiveInputs();
  const goal = rawGoal === "auto" ? phaseInfo.settings.goal : rawGoal;
  const baseDuration = Number($("adaptiveDuration")?.value || "60");
  const duration = Math.max(30, Math.round(baseDuration * phaseInfo.settings.durationMultiplier));
  const strictness = $("adaptiveStrictness")?.value || "normal";
  const plan = adaptiveSessionStructure(goal, duration, strictness, {phase: phaseInfo.phase, horizonWeeks: Number($("periodizationHorizon")?.value || 4), competitionDate: $("competitionDate")?.value || ""});
  adaptivePlanDraft = validRoutineIds(plan.routineIds);

  const mode = getSmartRecommendationMode();
  const usage = plan.budgetUsage || {cognitive:0,fatigue:0,confidence:0,switches:0};
  const budgets = plan.budgets || sessionBudgetsForGoal(plan.effectiveGoal, plan.targetMinutes);
  const budgetHtml = `<div class="smart-budget-grid">
    <span class="badge ${budgetBadgeClass(usage.cognitive,budgets.cognitive)}">${escapeHtml(uiLabel("mentalLoad"))} ${usage.cognitive}/${budgets.cognitive}</span>
    <span class="badge ${budgetBadgeClass(usage.fatigue,budgets.fatigue)}">${escapeHtml(uiLabel("energyCost"))} ${usage.fatigue}/${budgets.fatigue}</span>
    <span class="badge ${budgetBadgeClass(usage.confidence,budgets.confidence)}">${escapeHtml(uiLabel("confidenceRisk"))} ${usage.confidence}/${budgets.confidence}</span>
    <span class="badge ${budgetBadgeClass(usage.switches,budgets.maxSwitches)}">${escapeHtml(uiLabel("switchingCost"))} ${usage.switches}/${budgets.maxSwitches}</span>
  </div>`;
  const feedback = recommendationFeedbackSummary();
  const html = `<div class="adaptive-phase ${plan.effectiveGoal==="recovery"?"adaptive-risk":plan.effectiveGoal==="progression"?"adaptive-ok":"adaptive-watch"}">
    <h4>${escapeHtml(uiLabel("smartSessionBuilder"))}: ${escapeHtml(smartGoalLabel(plan.effectiveGoal))}</h4>
    <div>${plan.globalReasons.map(r=>`<span class="adaptive-pill">${escapeHtml(r)}</span>`).join("")}</div>
    <div class="adaptive-rationale">${escapeHtml(uiLabel("targetDuration"))}: ${formatDurationHuman(plan.targetMinutes)} · ${escapeHtml(uiLabel("loadedEstimate"))}: ${formatDurationHuman(plan.estimatedMinutes || plan.targetMinutes)} · ${plan.routineIds.length} ${escapeHtml(uiLabel("drillSlots"))} · ${escapeHtml(uiLabel("recommendationMode"))}: ${escapeHtml(smartRecommendationModeLabel(mode))}</div>
    ${budgetHtml}
    <div class="adaptive-rationale">${escapeHtml(uiLabel("feedbackTracked"))}: ${feedback.accepted} ${escapeHtml(uiLabel("accepted"))} · ${feedback.skipped} ${escapeHtml(uiLabel("skipped"))} · ${feedback.completed} ${escapeHtml(uiLabel("completed"))}. ${escapeHtml(getInsightLanguageSetting()==="friendly"?"Completed picks help the app learn what works next time.":"Completed recommendations capture score-after and improvement-after-recommendation once logged.")}</div>
  </div>${renderRecommendationLogicPanel(rankRoutinesByMode($("orchestratorFocus")?.value || "all", $("orchestratorStrategy")?.value || "balanced", mode), mode)}` + plan.blocks.map(block => `<div class="adaptive-phase smart-block-card" data-block-type="${attrText(block.blockType || "")}">
    <h4>${escapeHtml(block.name)} · ${formatDurationHuman(block.minutes)}</h4>
    <div class="adaptive-rationale">${escapeHtml(block.purpose)}</div>
    ${block.picks.map(pick => { const p = pick.state || pick; const reps = Math.max(1, Number(pick.reps || 1)); const energy = p.energyProfile || routineEnergyProfile(p); return `<div class="routine-row">
      <div><strong>${escapeHtml(p.routine.name)}${reps > 1 ? ` ×${reps}` : ""}</strong>
        <div class="adaptive-rationale">${escapeHtml(getInsightLanguageSetting()==="friendly"?"Mode":"Phase")}: ${escapeHtml(p.phase)} · ${escapeHtml(getInsightLanguageSetting()==="friendly"?"Next":"Action")}: ${escapeHtml(adaptiveActionForState(p))} · ${escapeHtml(getInsightLanguageSetting()==="friendly"?"Time":"Est.")} ${formatDurationHuman(adaptiveRoutineExpectedMinutes(p.routine) * reps)} · ${escapeHtml(getInsightLanguageSetting()==="friendly"?"Carryover":"Transfer")} ${Number(p.transferValue || routineTransferValue(p.routine))}/100 · ${escapeHtml(uiLabel("mentalLoad"))} ${energy.cognitive} · ${escapeHtml(uiLabel("energyCost"))} ${energy.fatigue} · ${escapeHtml(uiLabel("confidenceRisk"))} ${energy.confidence}</div>
        <ul class="reason-list">${(p.reasons || []).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>
        ${renderFeedbackButtons(p.routine.id, "smart_session_builder")}
        ${p.upgrade ? renderTargetUpgradeButton(p.routine.id) : ""}
      </div>
      <span class="badge">${escapeHtml(getInsightLanguageSetting()==="friendly"?"Fit":"Score")} ${Number(p.adaptiveScore || 0).toFixed(1)}</span>
    </div>`; }).join("")}
  </div>`).join("");

  const adaptiveHost = $("adaptiveEngineOutput");
  if (adaptiveHost) {
    adaptiveHost.innerHTML = "";
    adaptiveHost.innerHTML = html || "No routines available for the Smart Session Builder.";
  }
}

function loadAdaptiveSessionIntoPlanBuilder() {
  if (!adaptivePlanDraft.length) return showTransientNotice("Build a smart session first.", "warn");
  planDraft = validRoutineIds(adaptivePlanDraft);
  renderPlanBuilder();
  document.querySelector('[data-tab="plans"]').click();
}


function getPersistedActiveSession() {
  return readActiveSessionDraft(ACTIVE_SESSION_KEY, logAppError);
}
function persistActiveSession() {
  return writeActiveSessionDraft(ACTIVE_SESSION_KEY, activeSession, safeStorageSet, logAppError);
}
function clearPersistedActiveSession() {
  return clearActiveSessionDraft(ACTIVE_SESSION_KEY, logAppError);
}

function showTransientNotice(message, tone="info", action=null) {
  let el = $("appToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "appToast";
    el.className = "app-toast";
    document.body.appendChild(el);
  }
  el.setAttribute("role", tone === "warn" ? "alert" : "status");
  el.setAttribute("aria-live", tone === "warn" ? "assertive" : "polite");
  el.setAttribute("aria-atomic", "true");
  el.className = `app-toast ${tone === "ok" ? "ok" : tone === "warn" ? "warn" : ""}`;
  el.innerHTML = `<span>${escapeHtml(message)}</span>${action && typeof action.handler === "function" ? `<button type="button" class="toast-undo-btn">${escapeHtml(action.label || "Undo")}</button>` : ""}`;
  const btn = el.querySelector(".toast-undo-btn");
  if (btn) btn.addEventListener("click", () => {
    try { action.handler(); }
    catch(e) { logAppError?.(e, "toast undo handler"); }
    el.classList.remove("show");
  }, {once:true});
  el.classList.add("show");
  window.clearTimeout(showTransientNotice._timer);
  showTransientNotice._timer = window.setTimeout(() => el.classList.remove("show"), action ? 4200 : 1800);
}

function createDefaultQuickStartPlan() {
  const pool = activeRoutines().slice(0, 4);
  if (!pool.length) { showTransientNotice("Create at least one exercise before creating a quick-start plan.", "warn"); return; }
  const existing = data.plans.find(p => p.name === "Quick start — default plan");
  const routineIds = pool.map(r => r.id);
  if (existing) {
    existing.routineIds = routineIds;
    existing.updatedAt = new Date().toISOString();
  } else {
    data.plans.push({id: uuid(), name: "Quick start — default plan", routineIds, createdAt: new Date().toISOString()});
  }
  saveData();
  renderPlanList();
  showTransientNotice("Quick-start plan created from the first available exercises.", "ok");
}

function normalizeSmartRecommendationMode(value) {
  return ["heuristic", "thompson", "hybrid"].includes(value) ? value : "hybrid";
}
function getSmartRecommendationMode() {
  const selectValue = $("smartRecommendationMode")?.value;
  return normalizeSmartRecommendationMode(selectValue || localStorage.getItem(SMART_RECOMMENDATION_MODE_KEY) || "hybrid");
}
function setSmartRecommendationMode(value) {
  const mode = normalizeSmartRecommendationMode(value);
  localStorage.setItem(SMART_RECOMMENDATION_MODE_KEY, mode);
  if ($("smartRecommendationMode")) $("smartRecommendationMode").value = mode;
  renderSmartRecommendation();
  if ($("adaptiveEngineOutput")) renderAdaptiveSession();
}
function gaussianRandom() {
  let u = 0, v = 0, s = 0;
  do {
    u = Math.random() * 2 - 1;
    v = Math.random() * 2 - 1;
    s = u * u + v * v;
  } while (s <= 0 || s >= 1);
  return u * Math.sqrt((-2 * Math.log(s)) / s);
}
function routineEvidenceLabel(n) {
  const e = evidenceStrength(n);
  if (e.level === "strong") return "high evidence";
  if (e.level === "moderate") return "moderate evidence";
  if (e.level === "weak" || e.level === "early") return "early evidence";
  return "low evidence";
}

/* ===== v4.39.0 Bayesian Practice Optimization v1 / Strong Thompson Sampling ===== */

function bayesianOptimizationForProfile(profile){
  try {
    const n = Number(profile?.n || profile?.stats?.logs?.length || 0);
    const uncertaintyFallback = 6 + 20 * (1 - shrinkageWeight(n, 8));
    const uncertainty = clampNumber(profile?.uncertainty ?? uncertaintyFallback, 0, 40);
    const posterior = profile?.stats?.bayesian?.posterior || null;
    const posteriorWidth = posterior ? Math.max(0, Number(posterior.upper || 0) - Number(posterior.lower || 0)) : null;
    const evidence = evidenceStrength(n);
    const mean = Number(profile?.trainingValueMean ?? profile?.score ?? 0);
    const explorationAllowance = 0.40 + 0.60 * clampNumber(evidence.factor, 0, 1);
    const volatilityLevel = profile?.volatilityProfile?.level || profile?.contextualFit?.volatility?.level || "medium";
    const recoveryMode = profile?.stateMode?.mode === "recovery";
    let explorationBonus = uncertainty * 0.22 * explorationAllowance;
    if (posteriorWidth !== null) explorationBonus += posteriorWidth * 18 * explorationAllowance;
    if (volatilityLevel === "high") explorationBonus *= recoveryMode ? 0.25 : 0.65;
    if (profile?.learningSignal?.skipRate >= 0.55 && profile?.learningSignal?.skipped >= 3) explorationBonus *= 0.55;
    const confidenceAdjustment = profile?.stateMode?.mode === "performance" ? 3 : recoveryMode ? -2 : 0;
    const optimizedScore = mean + explorationBonus + confidenceAdjustment;
    let label = "Balanced optimization";
    if (explorationBonus >= 8) label = "Explore with guardrails";
    else if (n >= 12 && uncertainty <= 10) label = "Exploit proven drill";
    else if (recoveryMode) label = "Conservative selection";
    return {
      score: optimizedScore,
      explorationBonus,
      uncertainty,
      posteriorWidth,
      confidenceAdjustment,
      label,
      evidence:evidence.label,
      mode: explorationBonus >= 8 ? "explore" : (n >= 12 && uncertainty <= 10 ? "exploit" : "balance")
    };
  } catch(e) {
    logAppError?.(e, "bayesianOptimizationForProfile");
    return {score:Number(profile?.trainingValueMean ?? profile?.score ?? 0) || 0, explorationBonus:0, uncertainty:0, posteriorWidth:null, confidenceAdjustment:0, label:"Optimization unavailable", evidence:"low evidence", mode:"balance"};
  }
}
function bayesianOptimizationReason(profile){
  const opt = profile?.bayesianOptimization;
  if (!opt) return "Smart practice balance: unavailable";
  if (opt.mode === "explore") return `Smart practice balance: useful exploration candidate (${opt.evidence})`;
  if (opt.mode === "exploit") return `Smart practice balance: proven drill with lower uncertainty (${opt.evidence})`;
  return `Smart practice balance: balanced score with uncertainty ${Number(opt.uncertainty || 0).toFixed(1)}`;
}
function bayesianOptimizationInsight(logs){
  try {
    const rows = rankRoutinesByMode("all", "balanced", getSmartRecommendationMode()).slice(0,3);
    if (!rows.length) return `<div class="insight-card watch"><strong>${htmlText(uiLabel("bayesianOptimization"))}</strong><div class="muted small">No eligible routines yet. Add or log routines to activate uncertainty-aware ranking.</div></div>`;
    return `<div class="insight-card watch"><strong>${htmlText(uiLabel("bayesianOptimization"))}</strong><div class="muted small">${htmlText(uiAdvancedText("Balances proven routines with controlled exploration. Exploration is reduced in recovery mode or when volatility is high."))}</div>${rows.map(x=>`<div class="context-row"><span>${htmlText(x.routine?.name || "Exercise")}</span><strong>${htmlText(x.bayesianOptimization?.label || "Balanced")}</strong><span>${htmlText((x.bayesianOptimization?.mode || "balance") + " · " + (x.bayesianOptimization?.evidence || "low evidence"))}</span></div>`).join("")}</div>`;
  } catch(e) {
    logAppError?.(e, "bayesianOptimizationInsight");
    return `<div class="insight-card watch"><strong>${htmlText(uiLabel("bayesianOptimization"))}</strong><div class="muted small">Optimization insight unavailable for this scope.</div></div>`;
  }
}
/* ===== end v4.39.0 Bayesian Practice Optimization v1 / Strong Thompson Sampling ===== */

function routineRecommendationProfile(routine, stats, strategy="balanced", focusOverride="all") {
  const stateMode = inferTrainingStateMode();
  const baseScore = routineMixedStrategyScore(routine, stats, strategy) + (focusOverride !== "all" && routine.category === focusOverride ? 25 : 0);
  const n = Number(stats.logs?.length || 0);
  const vals = (stats.vals || []).filter(Number.isFinite);
  const volatility = routineVolatilityProfile(routine, stats);
  const days = stats.logs?.length ? daysSince(stats.logs[stats.logs.length-1].createdAt) : recommendationRecencyCap(routine);
  const sampleUncertainty = 6 + 18 * (1 - shrinkageWeight(n, 8));
  const uncertainty = Math.max(4, Math.min(34, sampleUncertainty + volatility.score * 0.18 + Math.min(8, days * 0.25)));
  const weakness = stats.hit === null ? 10 : Math.max(0, 75 - Number(stats.hit || 0)) * 0.28;
  const undertraining = undertrainedCategoryBonus(routine.id) * recommendationUndertrainingMultiplier(routine);
  const context = stats.contextSignal || recommendationContextSignal(routine.id);
  const bayes = stats.bayesian?.signal?.scoreDelta || 0;
  const transferValue = routineTransferValue(routine);
  const transferNeed = transferNeedScoreForRoutine(routine);
  const difficultySignal = dynamicDifficultyAdjustmentForRoutine(routine);
  const contextualFit = contextualFitForRoutine(routine, stats, stateMode);
  const outcome = recommendationOutcomeSignal(routine.id);
  const learning = recommendationLearningProfile(routine.id);
  const contextNormalization = routineContextNormalizationSignal(routine);
  const maintenanceFit = maintenanceFitForRoutine(routine);
  const periodizationFit = periodizationFitForRoutine(routine);
  let explorationBonus = uncertainty * 0.28;
  if (strategy === "explore") explorationBonus *= 1.45;
  if (strategy === "exploit") explorationBonus *= 0.55;
  if (contextualFit.volatility.level === "high" && stateMode.mode === "recovery") explorationBonus *= 0.35;
  const trainingValueMean = baseScore + weakness * 0.55 + undertraining * 0.65 + Number(context.bonus || 0) * 0.4 + bayes * 0.45 + transferValue * 0.18 + transferNeed.score * 1.2 + contextualFit.score + outcome.score + learning.score + Number(contextNormalization.score || 0) + Number(difficultySignal?.score || 0) * 0.35 + Number(maintenanceFit.score || 0) * 0.45 + Number(periodizationFit.score || 0) * 0.40;
  const provisionalProfile = {routine, stats, trainingValueMean, score:baseScore, uncertainty, n, volatilityProfile:volatility, contextualFit, stateMode, learningSignal:learning};
  const bayesianOptimization = bayesianOptimizationForProfile(provisionalProfile);
  const thompsonSampling = thompsonRecommendationSample({
    mean: trainingValueMean,
    uncertainty,
    posterior: stats.bayesian?.posterior || null,
    evidenceWeight: shrinkageWeight(n, 8),
    explorationBonus: explorationBonus + Number(bayesianOptimization.explorationBonus || 0) * 0.35
  });
  const sampledValue = Number(thompsonSampling.sampledValue || trainingValueMean);
  const reasons = getRoutinePriorityReasons({routine, stats}).slice(0, 5);
  reasons.unshift(buildContextAwareReason({contextualFit, transferNeed}));
  reasons.push(skillReasonText(routine));
  reasons.push(transferAwareReasonText(routine, transferNeed));
  if (outcome.score) reasons.push(outcome.label);
  if (learning.score || learning.accepted || learning.skipped || learning.completed) reasons.push(recommendationLearningReasonForRoutine(routine.id));
  reasons.push(bayesianOptimizationReason({bayesianOptimization}));
  if (thompsonSampling.method === "beta" && Number.isFinite(Number(thompsonSampling.drawPct))) reasons.push(`Thompson sampling: posterior draw ${thompsonSampling.drawPct.toFixed(0)}% success potential`);
  if (stats.bayesian?.prior) reasons.push(bayesianPriorReason(stats.bayesian.prior));
  reasons.push(targetIntervalReasonForRoutine(routine));
  reasons.push(contextNormalizationReasonForRoutine(routine));
  reasons.push(difficultyAdjustmentReasonForRoutine(routine));
  if (Number(maintenanceFit.score || 0) >= 8) reasons.push(maintenanceReasonForRoutine(routine, maintenanceFit));
  if (Number(periodizationFit.score || 0) >= 5) reasons.push(periodizationReasonForRoutine(routine, periodizationFit));
  if (uncertainty >= 16) reasons.unshift("exploration upside: uncertain but worth sampling");
  if (n >= 12 && weakness > 6) reasons.unshift("confirmed weakness with enough evidence");
  if (undertraining >= 7) reasons.unshift("undertrained category");
  if (transferValue >= 70) reasons.unshift("high transfer-value drill");
  return {
    routine,
    stats,
    score: baseScore + contextualFit.score + transferValue * 0.14 + transferNeed.score + outcome.score + learning.score + Number(contextNormalization.score || 0) + Number(difficultySignal?.score || 0) * 0.25 + Number(maintenanceFit.score || 0) * 0.35 + Number(periodizationFit.score || 0) * 0.30 + Number(bayesianOptimization.explorationBonus || 0) * 0.4 + Number(bayesianOptimization.confidenceAdjustment || 0),
    trainingValueMean,
    bayesianOptimization,
    thompsonSampling,
    uncertainty,
    sampledValue,
    n,
    evidenceLabel: routineEvidenceLabel(n),
    selectionType: uncertainty >= 16 && sampledValue > trainingValueMean + 4 ? "exploration" : (n >= 8 ? "exploitation" : "data gathering"),
    contextualFit,
    transferNeed,
    stateMode,
    volatilityProfile:volatility,
    transferValue,
    outcomeSignal:outcome,
    learningSignal:learning,
    contextNormalization,
    maintenanceFit,
    periodizationFit,
    reasons:[...new Set(reasons.filter(Boolean))]
  };
}
function rankRoutinesByMode(focusOverride="all", strategy="balanced", mode=getSmartRecommendationMode()) {
  const routineSig = `${(data.routines || []).length}|${(data.routines || [])[0]?.id || ""}|${(data.routines || [])[(data.routines || []).length - 1]?.id || ""}|${data?.updatedAt || ""}`;
  const cacheKey = `${focusOverride}|${strategy}|${mode}|${logsSignature(data.logs || [])}|${routineSig}`;
  if (rankRoutineMemoCache.has(cacheKey)) return rankRoutineMemoCache.get(cacheKey).slice();
  const logMap = getLogsByRoutineMap(data.logs || []);
  const base = activeRoutines().map(r => {
    const stats = routineStats(r, logMap);
    return routineRecommendationProfile(r, stats, strategy, focusOverride);
  }).filter(x => recommendationMode(x.routine) !== "excluded");
  let ranked;
  if (mode === "thompson") ranked = base.sort((a,b)=>b.sampledValue-a.sampledValue);
  else if (mode === "hybrid") ranked = base.map(x => ({...x, hybridScore:(x.score * 0.35) + (x.sampledValue * 0.45) + (Number(x.bayesianOptimization?.score || 0) * 0.20)})).sort((a,b)=>b.hybridScore-a.hybridScore);
  else ranked = base.sort((a,b)=>b.score-a.score);
  if (rankRoutineMemoCache.size > 30) rankRoutineMemoCache.clear();
  rankRoutineMemoCache.set(cacheKey, ranked.slice());
  return ranked.slice();
}
function recommendationModeSummary(mode) {
  if (mode === "thompson") return "Thompson Sampling: samples each drill's upside and naturally balances confirmed weaknesses with useful exploration.";
  if (mode === "hybrid") return "Hybrid: blends stable heuristic scoring, Thompson-style exploration, and Bayesian optimization guardrails so recommendations do not become too repetitive.";
  return "Heuristic: stable ranking based on weakness, recency, undertraining, context, and True Skill signals.";
}
function renderRecommendationLogicPanel(candidates, mode) {
  const rows = (candidates || []).slice(0,5);
  if (!rows.length) return "";
  const state = rows[0]?.stateMode || inferTrainingStateMode();
  return `<div class="recommendation-logic-panel">
    <h4>${escapeHtml(uiRecommendationCopy("logicTitle"))}</h4>
    <div class="adaptive-rationale"><strong>${escapeHtml(getInsightLanguageSetting() === "friendly" ? "Training state" : state.label + " mode")}:</strong> ${escapeHtml(getInsightLanguageSetting() === "friendly" ? friendlyRecommendationReason(state.reason) || state.reason : state.reason)} · ${escapeHtml(recommendationModeSummaryForUI(mode))}</div>
    <div class="recommendation-candidate-list">
      ${rows.map((x, idx)=>`<div class="context-row recommendation-candidate-row">
        <span><strong>${idx+1}. ${escapeHtml(x.routine.name)}</strong><br><span class="muted">${escapeHtml(getInsightLanguageSetting() === "friendly" ? friendlySelectionType(x.selectionType) : x.selectionType)} · ${escapeHtml(getInsightLanguageSetting() === "friendly" ? friendlyEvidenceLabel(x.evidenceLabel) : x.evidenceLabel)} · ${escapeHtml(getInsightLanguageSetting() === "friendly" ? "consistency risk" : "volatility")} ${escapeHtml(x.volatilityProfile?.level || "n/a")} · ${escapeHtml(getInsightLanguageSetting() === "friendly" ? "confidence" : "uncertainty")} ${x.uncertainty.toFixed(1)}</span></span>
        <strong>${(mode === "thompson" ? x.sampledValue : mode === "hybrid" ? x.hybridScore : x.score).toFixed(1)}</strong>
        <span>${escapeHtml(recommendationReasonListForUI(x.reasons || [], 3).join(" · ") || uiRecommendationCopy("fallbackReason"))}</span>
      </div>`).join("")}
    </div>
  </div>`;
}

function renderSmartRecommendation() {
  const box = $("smartRecommendationBox");
  if (!box) return;
  const mode = getSmartRecommendationMode();
  if ($("smartRecommendationMode")) $("smartRecommendationMode").value = mode;
  if (!data.logs.length) {
    box.innerHTML = `<strong>${escapeHtml(uiRecommendationCopy("noHistoryTitle"))}</strong><br>${escapeHtml(uiRecommendationCopy("noHistoryText"))}<div class="row compact-action-row"><button type="button" class="secondary" data-action="quick-start-default-plan">Create quick-start plan</button></div>`;
    return;
  }
  const focus = $("orchestratorFocus")?.value || "all";
  const strategy = $("orchestratorStrategy")?.value || "balanced";
  const candidates = rankRoutinesByMode(focus, strategy, mode);
  const top = candidates[0];
  const routine = top?.routine;
  const recentLogs = data.logs.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,20);
  const alloc = computeAllocation(recentLogs);
  const undertrained = alloc.sort((a,b)=>a.pct-b.pct)[0];
  if (!routine) {
    box.innerHTML = escapeHtml(uiRecommendationCopy("noEligible"));
    return;
  }
  const bayesian = top.stats?.bayesian;
  const policy = bayesian?.policy;
  const policyHtml = policy ? `<div class="bayes-action-box smart-bayes-action">
      <strong>${htmlText(policy.title)}</strong>
      <p>${htmlText(policy.instruction)}</p>
      <p class="muted">${htmlText(policy.detail)} ${htmlText(policy.coaching)}</p>
    </div>` : "";
  const friendlyMode = getInsightLanguageSetting() === "friendly";
  const actionText = primaryRecommendationAction(top);
  const reasonText = recommendationReasonListForUI(top.reasons || [], friendlyMode ? 3 : 5).join(" · ") || uiRecommendationCopy("fallbackReason");
  box.innerHTML = `<strong>${escapeHtml(uiRecommendationCopy("nextFocusPrefix"))}:</strong> ${escapeHtml(routine.name)}<br>
    ${friendlyMode && actionText ? `<div class="adaptive-rationale"><strong>${escapeHtml(actionText)}</strong><br><span class="muted">${escapeHtml(reasonText)}.</span></div>` : ""}
    <span class="badge">${friendlyMode ? "Style" : "Mode"}: ${escapeHtml(mode === "thompson" ? (friendlyMode ? "Exploration" : "Thompson") : mode === "hybrid" ? "Hybrid" : (friendlyMode ? "Stable" : "Heuristic"))}</span>
    <span class="badge">${friendlyMode ? "Use" : "Type"}: ${escapeHtml(friendlyMode ? friendlySelectionType(top.selectionType) : top.selectionType)}</span>
    <span class="badge">${friendlyMode ? "Signal" : "Evidence"}: ${escapeHtml(friendlyMode ? friendlyEvidenceLabel(top.evidenceLabel) : top.evidenceLabel)}</span>
    <span class="badge">Hit rate: ${top.stats.hit === null ? "N/A" : top.stats.hit.toFixed(1)+"%"}</span>
    <span class="badge">Category: ${escapeHtml(routine.category || "uncategorized")}</span>
    <span class="badge">Skill: ${escapeHtml(skillLabel(getRoutineSkillMap(routine).primarySkill))}</span>
    <span class="badge">${friendlyMode ? "State" : "Context"}: ${escapeHtml(top.stateMode?.label || inferTrainingStateMode().label)}</span>
    <span class="badge">${friendlyMode ? "Risk" : "Volatility"}: ${escapeHtml(top.volatilityProfile?.level || "n/a")}</span>
    <span class="badge">${friendlyMode ? "Carryover" : "Transfer"}: ${Number(top.transferValue || routineTransferValue(routine))}/100</span>
    <span class="badge">${friendlyMode ? "Past fit" : "Learning"}: ${top.learningSignal?.score ? (top.learningSignal.score >= 0 ? "+" : "") + top.learningSignal.score.toFixed(1) : "new"}</span>
    ${undertrained ? `<span class="badge">${friendlyMode ? "Needs work" : "Undertrained area"}: ${escapeHtml(undertrained.cat)} (${undertrained.pct.toFixed(1)}%)</span>` : ""}
    ${policy ? `<span class="badge">${friendlyMode ? "Skill action" : "True Skill action"}: ${htmlText(policy.badge)}</span>` : ""}
    ${friendlyMode ? "" : `<p class="muted">${escapeHtml(uiRecommendationCopy("reasonLabel"))}: ${escapeHtml(reasonText)}.</p>`}
    ${renderFeedbackButtons(routine.id, "smart_recommendation")}
    ${policyHtml}
    ${renderRecommendationLogicPanel(candidates, mode)}
    <div class="analytics-note">${escapeHtml(warmupSuggestion())}</div>`;
}
function computeAllocation(logs){
  const total = logs.reduce((a,b)=>a+Number(b.timeMinutes||0),0);
  const byCat={};
  logs.forEach(l=>{
    const k=l.category||"uncategorized";
    byCat[k]=(byCat[k]||0)+Number(l.timeMinutes||0);
  });
  return Object.entries(byCat).map(([cat,time])=>({cat,time,pct:total?time/total*100:0}));
}

function setStatsMode(mode) {
  const nextMode = normalizeStatsMode(mode);
  statsMode = nextMode;
  localStorage.setItem(STATS_MODE_KEY, statsMode);
  applyStoredStatsModeVisual();
  if ($("statsOutput")) renderStats();
}

function bindStatsNavigation() {
  const nav = document.querySelector(".stats-internal-nav");
  if (!nav || nav.dataset.bound === "true") return;
  nav.dataset.bound = "true";
  nav.addEventListener("click", event => {
    const btn = event.target?.closest?.(".stats-nav-btn[data-stats-mode]");
    if (!btn) return;
    event.preventDefault();
    setStatsMode(btn.dataset.statsMode || "overview");
  });
}

bindStatsNavigation();
document.addEventListener("DOMContentLoaded", bindStatsNavigation);
["compareToggle","compareAStart","compareAEnd","compareBStart","compareBEnd"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("change", renderABComparison);
});

["adaptiveGoal","adaptiveDuration","adaptiveStrictness","periodizationPhase","periodizationHorizon","competitionDate","orchestratorStrategy","orchestratorIntensity","orchestratorFocus","smartRecommendationMode"].forEach(id => {
  safeOn(id, "change", () => { if ($("adaptiveEngineOutput")) renderAdaptiveSession(); });
});

safeOn("statsRoutineSelect", "change", (event) => { setStatsRoutineFilter(event.target.value); });
safeOn("statsDateSelect", "change", renderStats);
safeOn("statsPeriodSelect", "change", () => { safeCall("statsPeriod renderStats", renderStats); safeCall("statsPeriod renderPhaseOneInsights", renderPhaseOneInsights); });
safeOn("rollingWindowInput", "input", debouncedRenderStats);
safeOn("benchmarkWindowInput", "input", debouncedRenderStats);
if ($("statsDetailMode")) {
  $("statsDetailMode").value = getStatsDetailMode();
  safeOn("statsDetailMode", "change", e => setStatsDetailMode(e.target.value));
}


function emaExpectedSeries(logs, alpha=0.35) {
  const sorted = logs.slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  let ema = null;
  return sorted.map((l, idx) => {
    const actual = Number(l.normalizedScore || 0);
    const expected = ema === null ? actual : ema;
    const residual = idx === 0 ? 0 : actual - expected;
    ema = ema === null ? actual : alpha * actual + (1 - alpha) * ema;
    return {...l, expected, residual, ema};
  });
}
function routineResidualInsight(routineId) {
  const logs = (data.logs || []).filter(l => l.routineId === routineId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  if (logs.length < 5) return null;
  const series = emaExpectedSeries(logs);
  const recent = series.slice(-5);
  const residualMean = avg(recent.map(x => Number(x.residual || 0)));
  const residualStd = stdDev(recent.map(x => Number(x.residual || 0)));
  let signal = "neutral";
  let action = "Keep collecting data.";
  if (residualMean > Math.max(4, residualStd * 0.6)) {
    signal = "positive";
    action = "You are outperforming expectation. Consider a target increase or added constraint.";
  } else if (residualMean < -Math.max(4, residualStd * 0.6)) {
    signal = "negative";
    action = "You are underperforming expectation. Hold difficulty, check fatigue/table/context.";
  } else {
    action = "Performance is close to expectation. Maintain current progression.";
  }
  return {routine:routineById(routineId), logs, series, recent, residualMean, adjustedResidualMean:dampenByEvidence(residualMean, logs.length), residualStd, signal, action:cautiousActionText(action, logs.length), evidence:evidenceStrength(logs.length)};
}
function renderResidualInsights(logs) {
  const scopedRoutineIds = [...new Set(logs.map(l => l.routineId).filter(Boolean))];
  const insights = scopedRoutineIds.map(rid => routineResidualInsight(rid)).filter(Boolean).sort((a,b)=>Math.abs(b.residualMean)-Math.abs(a.residualMean)).slice(0,5);
  if (!insights.length) return `<div class="insight-card watch"><strong>Expected vs actual</strong><div class="muted">Not enough routine history/variation yet.</div></div>`;
  return `<div class="insight-card ${insights[0].signal==="positive"?"good":insights[0].signal==="negative"?"risk":"watch"}">
    <strong>Expected vs actual residuals ${statHelpButton("residual")}</strong>
    ${insights.map(i => `<div class="context-row"><span>${escapeHtml(i.routine?.name || "Deleted routine")}<br><span class="muted">${escapeHtml(i.action)}</span></span><strong>${i.adjustedResidualMean>=0?"+":""}${i.adjustedResidualMean.toFixed(1)}</strong><span>${evidenceBadge(i.logs.length)}</span></div>`).join("")}
  </div>`;
}
function sessionPeakWindow(sessionIdOrLogs, windowMinutes=15) {
  const logs = Array.isArray(sessionIdOrLogs)
    ? sessionIdOrLogs.slice()
    : (data.logs || []).filter(l => l.sessionId === sessionIdOrLogs);
  const sorted = logs.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  if (sorted.length < 3) return null;
  let cumulative = 0;
  const points = sorted.map(l => {
    const start = cumulative;
    cumulative += Number(l.timeMinutes || 0);
    return {log:l, mid:start + Number(l.timeMinutes || 0)/2, score:Number(l.normalizedScore || 0)};
  });
  let best = null;
  for (let i=0; i<points.length; i++) {
    const start = Math.max(0, points[i].mid - windowMinutes/2);
    const end = start + windowMinutes;
    const included = points.filter(p => p.mid >= start && p.mid <= end);
    if (included.length < 2) continue;
    const score = avg(included.map(p=>p.score));
    if (!best || score > best.score) best = {start, end, score, n:included.length};
  }
  return best;
}
function renderPeakWindowInsight(logs) {
  const sessions = [...new Set(logs.map(l => l.sessionId).filter(Boolean))];
  const peaks = sessions.map(id => sessionPeakWindow(id)).filter(Boolean);
  if (!peaks.length) {
    const fallback = sessionPeakWindow(logs);
    if (!fallback) return `<div class="insight-card watch"><strong>Peak window</strong><div class="muted">Not enough within-session data/variation yet.</div></div>`;
    peaks.push(fallback);
  }
  const avgStart = avg(peaks.map(p=>p.start));
  const avgEnd = avg(peaks.map(p=>p.end));
  const avgScore = avg(peaks.map(p=>p.score));
  return `<div class="insight-card good"><strong>Session peak window ${statHelpButton("peakWindow")}</strong>
    <div class="value">${formatDurationHuman(avgStart)}–${formatDurationHuman(avgEnd)}</div>
    <div class="muted">Average peak-window score: ${avgScore.toFixed(1)} across ${peaks.length} session${peaks.length>1?"s":""}.</div>
    <div class="adaptive-rationale">Place demanding drills in this window when possible.</div>
  </div>`;
}
function groupContextEffects(logs, keyFn, label) {
  const globalVals = logs.map(l=>Number(l.normalizedScore||0)).filter(v=>Number.isFinite(v));
  if (globalVals.length < 5) return [];
  const globalMean = avg(globalVals);
  const groups = {};
  logs.forEach(l => {
    const key = keyFn(l);
    if (!key) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(l);
  });
  return Object.entries(groups).map(([key, arr]) => {
    const vals = arr.map(l=>Number(l.normalizedScore||0)).filter(v=>Number.isFinite(v));
    if (vals.length < 3) { analyticsMemoCache.set(cacheKey, null); return null; }
    return {label, key, n:vals.length, avg:avg(vals), delta:avg(vals)-globalMean};
  }).filter(Boolean).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
}
function timeOfDayBucket(l) {
  const h = new Date(l.createdAt).getHours();
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  if (h < 21) return "Evening";
  return "Late";
}
function renderContextEffects(logs) {
  const effects = [
    ...groupContextEffects(logs, l => getTableName(l) !== "Not specified" ? getTableName(l) : "", "Table"),
    ...groupContextEffects(logs, l => l.sessionIntervention || "", "Intervention"),
    ...groupContextEffects(logs, l => timeOfDayBucket(l), "Time")
  ].filter(e => e.n >= 3).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,8);
  if (!effects.length) return `<div class="insight-card watch"><strong>${htmlText(uiLabel("contextEffects"))} ${statHelpButton("contextEffects")}</strong><div class="muted">Need more logs by table/time/intervention before this signal is reliable.</div></div>`;
  return `<div class="insight-card ${effects[0].delta<0?"risk":"good"}"><strong>${htmlText(uiLabel("contextEffects"))} ${statHelpButton("contextEffects")}</strong>
    ${effects.map(e => `<div class="context-row"><span>${escapeHtml(e.label)}: ${escapeHtml(e.key)}</span><strong>${e.delta>=0?"+":""}${e.delta.toFixed(1)}</strong><span>n=${e.n}</span></div>`).join("")}
    <div class="adaptive-rationale">Shows performance lifters/drags versus your overall average. Minimum threshold is deliberately low for visibility; treat small samples cautiously.</div>
  </div>`;
}



/* ===== v4.36.2 Venue / Context Normalization v1 ===== */
function safeContextNormalizationScore(log){
  try{
    const direct=Number(log?.normalizedScore);
    if(Number.isFinite(direct)) return direct;
    const computed=Number(normalizeScore(log));
    return Number.isFinite(computed) ? computed : null;
  }catch(err){
    console.warn("Skipped malformed log in context normalization", err, log);
    return null;
  }
}
function contextEvidenceLabel(n){
  if(n>=30) return "strong context evidence";
  if(n>=12) return "moderate context evidence";
  if(n>=5) return "early context evidence";
  return "low context evidence";
}
function contextEffectTable(logs, keyFn, label, minN=3){
  try{
    const rows=(logs||[]).map(l=>({log:l, score:safeContextNormalizationScore(l)})).filter(x=>Number.isFinite(x.score));
    if(rows.length<5) return [];
    const globalMean=avg(rows.map(x=>x.score));
    const groups={};
    rows.forEach(x=>{
      const key=keyFn(x.log);
      if(!key) return;
      if (!groups[key]) groups[key] = [];
      groups[key].push(x.score);
    });
    return Object.entries(groups).map(([key, vals])=>{
      if(vals.length<minN) return null;
      const delta=avg(vals)-globalMean;
      const damped=dampenByEvidence(delta, vals.length);
      return {label,key,n:vals.length,rawDelta:delta,delta:damped,avg:avg(vals),evidence:contextEvidenceLabel(vals.length)};
    }).filter(Boolean).sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta));
  }catch(err){
    console.warn("Context effect table skipped", err);
    return [];
  }
}
function highFatigueBucket(log){
  const v=Number(log?.reflectionFatigueRating ?? log?.fatigueRating ?? log?.fatigue ?? log?.reflectionFatigue ?? 0);
  if(!Number.isFinite(v) || v<=0) return "";
  return v>=4 ? "High fatigue" : "Normal/low fatigue";
}
function buildContextNormalizationModel(logs){
  try{
    const arr=(logs||[]).filter(Boolean);
    const tableEffects=contextEffectTable(arr, l=>getTableName(l)!=="Not specified"?getTableName(l):"", "Table");
    const timeEffects=contextEffectTable(arr, l=>timeOfDayBucket(l), "Time");
    const fatigueEffects=contextEffectTable(arr, highFatigueBucket, "Fatigue", 2);
    const byTable=Object.fromEntries(tableEffects.map(e=>[e.key,e]));
    const byTime=Object.fromEntries(timeEffects.map(e=>[e.key,e]));
    const byFatigue=Object.fromEntries(fatigueEffects.map(e=>[e.key,e]));
    return {tableEffects,timeEffects,fatigueEffects,byTable,byTime,byFatigue};
  }catch(err){
    console.warn("Context normalization model skipped", err);
    return {tableEffects:[],timeEffects:[],fatigueEffects:[],byTable:{},byTime:{},byFatigue:{}};
  }
}
function adjustedScoreForContext(log, model=buildContextNormalizationModel(data.logs||[])){
  try{
    const raw=safeContextNormalizationScore(log);
    if(!Number.isFinite(raw)) return null;
    const tableKey=getTableName(log)!=="Not specified"?getTableName(log):"";
    const timeKey=timeOfDayBucket(log);
    const fatigueKey=highFatigueBucket(log);
    const tableDelta=Number(model?.byTable?.[tableKey]?.delta || 0);
    const timeDelta=Number(model?.byTime?.[timeKey]?.delta || 0);
    const fatigueDelta=Number(model?.byFatigue?.[fatigueKey]?.delta || 0);
    const adjustment=tableDelta + timeDelta + fatigueDelta;
    return clampNumber(raw - adjustment, 0, 100);
  }catch(err){
    console.warn("Context-adjusted score skipped", err);
    return null;
  }
}
function routineContextNormalizationSignal(routine){
  try{
    const logs=(getLogsByRoutineMap(data.logs||[])[String(routine?.id || "")] || []);
    if(logs.length<4) return {score:0,label:"context normalization: insufficient routine history",rawRecent:null,adjustedRecent:null,n:logs.length};
    const model=buildContextNormalizationModel(data.logs||[]);
    const recent=logs.slice().sort((a,b)=>new Date(a?.createdAt||0)-new Date(b?.createdAt||0)).slice(-Math.min(8, logs.length));
    const rawVals=recent.map(safeContextNormalizationScore).filter(Number.isFinite);
    const adjVals=recent.map(l=>adjustedScoreForContext(l, model)).filter(Number.isFinite);
    if(rawVals.length<3 || adjVals.length<3) return {score:0,label:"context normalization: not enough usable scores",rawRecent:null,adjustedRecent:null,n:logs.length};
    const rawRecent=avg(rawVals);
    const adjustedRecent=avg(adjVals);
    const contextLift=rawRecent-adjustedRecent;
    let score=0;
    let label="context-adjusted performance close to raw score";
    if(contextLift>4){ score-=2; label="recent raw score is helped by favorable context"; }
    else if(contextLift<-4){ score+=3; label="recent raw score is suppressed by difficult context"; }
    return {score,label,rawRecent,adjustedRecent,contextLift,n:logs.length};
  }catch(err){
    console.warn("Routine context normalization signal skipped", err, routine);
    return {score:0,label:"context normalization unavailable",rawRecent:null,adjustedRecent:null,n:0};
  }
}
function contextNormalizationReasonForRoutine(routine){
  const s=routineContextNormalizationSignal(routine);
  if(!s || !Number.isFinite(Number(s.adjustedRecent))) return "context-adjusted score unavailable";
  return `${s.label}; adjusted recent ${Number(s.adjustedRecent).toFixed(1)} vs raw ${Number(s.rawRecent).toFixed(1)}`;
}
function contextNormalizationInsight(logs){
  try{
    const model=buildContextNormalizationModel(logs||[]);
    const effects=[...model.tableEffects, ...model.timeEffects, ...model.fatigueEffects]
      .filter(e=>e.n>=2)
      .sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))
      .slice(0,6);
    const scores=(logs||[]).map(safeContextNormalizationScore).filter(Number.isFinite);
    const adjusted=(logs||[]).map(l=>adjustedScoreForContext(l, model)).filter(Number.isFinite);
    const rawAvg=scores.length?avg(scores):null;
    const adjAvg=adjusted.length?avg(adjusted):null;
    if(!effects.length || !scores.length){
      return `<div class="insight-card watch"><strong>${htmlText(uiLabel("contextNormalized"))}</strong><div class="muted">Need more table/time/fatigue variation before normalization becomes useful.</div></div>`;
    }
    const cls=effects[0].delta<0?"risk":"good";
    const avgLine=Number.isFinite(rawAvg)&&Number.isFinite(adjAvg)
      ? `<div class="context-row"><span>Raw vs context-adjusted avg</span><strong>${rawAvg.toFixed(1)} → ${adjAvg.toFixed(1)}</strong><span>${contextEvidenceLabel(scores.length)}</span></div>`
      : "";
    return `<div class="insight-card ${cls}"><strong>${htmlText(uiLabel("contextNormalized"))}</strong>
      ${avgLine}
      ${effects.map(e=>`<div class="context-row"><span>${htmlText(e.label)}: ${htmlText(e.key)}</span><strong>${e.delta>=0?"+":""}${e.delta.toFixed(1)}</strong><span>${htmlText(e.evidence)} · n=${e.n}</span></div>`).join("")}
      <div class="adaptive-rationale">Separates raw score from table, time-of-day, and fatigue effects. This is a coaching adjustment, not a score rewrite; historical logs remain unchanged.</div>
    </div>`;
  }catch(err){
    console.warn("Context normalization insight skipped", err);
    return `<div class="insight-card watch"><strong>${htmlText(uiLabel("contextNormalized"))}</strong><div class="muted small">Context normalization unavailable for the current data set.</div></div>`;
  }
}
/* ===== end v4.36.2 Venue / Context Normalization v1 ===== */

function forecastWithConfidence(logs, horizon=5){
  if(!logs || logs.length<5) return null;
  const vals = logs.map(l=>Number(l.normalizedScore||0));
  const x = vals.map((_,i)=>i);
  const n = vals.length;
  const meanX = avg(x), meanY = avg(vals);
  let num=0,den=0;
  for(let i=0;i<n;i++){ num+=(x[i]-meanX)*(vals[i]-meanY); den+=(x[i]-meanX)**2;}
  const slope = den===0?0:num/den;
  const intercept = meanY - slope*meanX;
  const preds=[];
  const residuals=[];
  for(let i=0;i<n;i++){
    const yhat = intercept + slope*i;
    residuals.push(vals[i]-yhat);
  }
  const sd = stdDev(residuals);
  for(let h=1;h<=horizon;h++){
    const xi = n-1 + h;
    const yhat = intercept + slope*xi;
    preds.push({
      step:h,
      expected:Math.max(0, Math.min(100, yhat)),
      upper:Math.max(0, Math.min(100, yhat+sd)),
      lower:Math.max(0, Math.min(100, yhat-sd))
    });
  }
  return {slope,intercept,sd,preds};
}

function renderForecastInsight(logs){
  const fc = forecastWithConfidence(logs,5);
  if(!fc) return '<div class="insight-card watch"><strong>Forecast</strong><div class="muted">Not enough data.</div></div>';
  const last = fc.preds[fc.preds.length-1];
  return `<div class="insight-card watch">
    <strong>Performance forecast ${statHelpButton("forecast")}</strong>
    <div class="value">${last.expected.toFixed(1)}</div>
    <div class="muted">Range: ${last.lower.toFixed(1)} – ${last.upper.toFixed(1)}</div>
    <div class="adaptive-rationale">Projection based on recent trend ± variability.</div>
  </div>`;
}

function renderPhaseOneInsights() {
  const box = $("phaseOneInsightsOutput");
  if (!box) return;
  const scope = getStatsScope();
  const logs = getScopedStatsLogs();
  if (!logs.length) {
    box.innerHTML = `<div class="insight-card watch">${htmlText(uiNoDataMessage("insight"))}${scope.routineName ? `: ${htmlText(scope.routineName)}` : ""}.</div>`;
    return;
  }
  const html = `<div class="insight-grid">
    ${renderResidualInsights(logs)}
    ${renderPeakWindowInsight(logs)}
    ${renderContextEffects(logs)}
    ${contextNormalizationInsight(analyticsWindow(logs))}
    ${renderForecastInsight(analyticsWindow(logs))}
    ${reflectionPatternInsight(logs)}
    ${reflectionIntelligenceSummary(logs)}
    ${skillMapInsight(logs)}
    ${maintenanceSchedulerInsight(logs)}
    ${adaptiveSessionPeriodizationInsight(logs)}
    ${transferModelInsight(logs)}
    ${changePointInsight(analyticsWindow(logs))}
    ${currentFormInsight(analyticsWindow(logs))}
    ${targetCredibleIntervalInsight(analyticsWindow(logs))}
    ${dynamicDifficultyInsight(analyticsWindow(logs))}
    ${recommendationLearningInsight()}
    ${bayesianOptimizationInsight(analyticsWindow(logs))}
    ${personalizedPriorsInsight()}
  </div>`;
  box.innerHTML = uiInsightLanguageHtml(html);
}


function miniSparkline(values, width=110, height=30) {
  const vals = values.map(v=>Number(v||0)).filter(v=>Number.isFinite(v));
  if (vals.length < 2) return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><text x="2" y="18" font-size="10" fill="#777">not enough data</text></svg>`;
  const min = safeMin(vals, 0), max = safeMax(vals, 0);
  const range = max - min || 1;
  const pts = vals.map((v,i) => {
    const x = vals.length === 1 ? 0 : i * (width/(vals.length-1));
    const y = height - ((v-min)/range)*height;
    return Number.isFinite(x) && Number.isFinite(y) ? `${x.toFixed(1)},${y.toFixed(1)}` : "";
  }).filter(Boolean).join(" ");
  if (!pts) return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><text x="2" y="18" font-size="10" fill="#777">no data</text></svg>`;
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <polyline fill="none" stroke="currentColor" stroke-width="2" points="${pts}"></polyline>
  </svg>`;
}
function renderSwipeableHistoryCards(logs) {
  const sorted = (Array.isArray(logs) ? logs.slice() : [])
    .sort((a,b)=>Date.parse(b?.createdAt || 0)-Date.parse(a?.createdAt || 0))
    .slice(0, 10);
  if (!sorted.length) return "";
  const grouped = getLogsByRoutineMap(data.logs || []);
  return `<div class="swipe-history-wrap">
    <div class="swipe-history-title">Swipeable drill history <span class="muted">latest ${sorted.length}</span></div>
    <div class="swipe-history-cards">
      ${sorted.map(l => {
        const rLogs = (grouped[String(l.routineId || "")] || []).slice(-8);
        const values = rLogs.map(x=>Number(x.normalizedScore||0));
        return `<div class="history-card">
          <div class="history-card-top">
            <div>
              <strong>${escapeHtml(getRoutineName(l))}</strong>
              <div class="muted">${safeDateString(l.createdAt)} · ${escapeHtml(l.category || "")}</div>
            </div>
            <span class="badge">${escapeHtml(l.performance || "N/A")}</span>
          </div>
          <div class="history-card-score">
            <div><span>Score</span><strong>${escapeHtml(displayScore(l))}</strong></div>
            <div><span>Time</span><strong>${formatDurationHuman(l.timeMinutes)}</strong></div>
            <div><span>Table</span><strong>${escapeHtml(getTableName(l))}</strong></div>
          </div>
          <div class="history-card-spark">${miniSparkline(values)}</div>
          <div class="small-actions">
            <button class="secondary" data-action="open-log-edit" data-id="${attrText(l.id)}">Edit</button>
            <button class="danger" data-action="delete-log" data-id="${attrText(l.id)}">Delete</button>
          </div>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

function getStatsScope() {
  const period = $("statsPeriodSelect")?.value || "daily";
  const select = $("statsRoutineSelect");
  const selectValue = normalizeStatsRoutineFilter(select?.value || statsRoutineFilterId || "all");
  const selectedRoutineId = select ? selectValue : normalizeStatsRoutineFilter(statsRoutineFilterId || "all");
  if (selectedRoutineId !== statsRoutineFilterId) {
    statsRoutineFilterId = selectedRoutineId;
    localStorage.setItem(STATS_ROUTINE_FILTER_KEY, statsRoutineFilterId);
  }
  const rid = selectedRoutineId && selectedRoutineId !== "all" ? selectedRoutineId : "";
  const dateKey = $("statsDateSelect")?.value || localDateKey();
  const range = getPeriodRange(period, dateKey);
  const routine = rid ? routineById(rid) : null;
  return { period, selectedRoutineId, rid, dateKey, range, routine, routineName: routine ? routine.name : "" };
}
function getScopedStatsLogs() {
  const scope = getStatsScope();
  let logs = (scope.period === "overall" || scope.period === "exercise") ? (data.logs || []).slice() : logsInRange(data.logs || [], scope.range.start, scope.range.end);
  if (scope.rid) logs = logs.filter(l => String(l.routineId) === String(scope.rid));
  return logs.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
}
function getTournamentPlannerLogs(scope = getStatsScope()) {
  const base = (scope.period === "overall" || scope.period === "exercise") ? (data.logs || []).slice() : logsInRange(data.logs || [], scope.range.start, scope.range.end);
  return base.sort((a,b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}
function renderStatsScopeBanner(scope, logs) {
  const filterLabel = scope.rid ? htmlText(scope.routineName || "Selected exercise") : "All exercises";
  const periodLabel = scope.period === "exercise" ? "All history" : htmlText(scope.range.label);
  return `<div class="analytics-note stats-scope-banner"><strong>Active stats scope:</strong> ${filterLabel} · ${periodLabel} · ${logs.length} log${logs.length === 1 ? "" : "s"}</div>`;
}
function getStatsModeMeta(mode = statsMode) {
  const map = {
    overview:{tier:"Core", label:"Overview", purpose:"Immediate practice decisions"},
    insights:{tier:"Core", label:"Insights", purpose:"Actionable coaching signals"},
    trends:{tier:"Advanced", label:"Trends", purpose:"Trend diagnostics"},
    graphs:{tier:"Advanced", label:"Graphs", purpose:"Visual pattern review"},
    routines:{tier:"Advanced", label:"Routines", purpose:"Exercise-level comparison"},
    pressure:{tier:"Advanced", label:"Pressure", purpose:"Pressure-mode performance"},
    bayesian:{tier:"Research", label:"True Skill", purpose:"Probabilistic estimates"},
    ab:{tier:"Research", label:"A/B", purpose:"Period comparison"},
    counterfactual:{tier:"Research", label:"Drill Compare", purpose:"Alternative drill comparison"},
    tournament:{tier:"Research", label:"Tournament", purpose:"Readiness modelling"}
  };
  return map[normalizeStatsMode(mode)] || map.overview;
}

function renderStatsScopeChips(scope, logs) {
  const el = $("statsScopeChips");
  if (!el) return;
  const filterLabel = scope.rid ? (scope.routineName || "Selected exercise") : "All exercises";
  const periodLabel = scope.period === "exercise" ? "All history" : scope.range.label;
  const meta = getStatsModeMeta(statsMode);
  el.innerHTML = [
    `<span class="stats-scope-chip primary"><strong>${htmlText(meta.tier)}</strong><span>${htmlText(meta.label)}</span></span>`,
    `<span class="stats-scope-chip"><strong>Purpose</strong><span>${htmlText(meta.purpose)}</span></span>`,
    `<span class="stats-scope-chip"><strong>Exercise</strong><span>${htmlText(filterLabel)}</span></span>`,
    `<span class="stats-scope-chip"><strong>Period</strong><span>${htmlText(periodLabel)}</span></span>`,
    `<span class="stats-scope-chip"><strong>Logs</strong><span>${logs.length}</span></span>`
  ].join("");
}

function renderStatsSectionIntro(logs, range) {
  const meta = getStatsModeMeta(statsMode);
  const reliability = logs.length >= 30 ? "High evidence" : logs.length >= 10 ? "Moderate evidence" : logs.length ? "Low evidence" : "No evidence yet";
  return `<div class="stats-section-intro ${htmlText(meta.tier).toLowerCase()}">
    <div><span class="stats-tier-pill">${htmlText(meta.tier)}</span><h3>${htmlText(meta.label)} — ${escapeHtml(range.label)}</h3><p>${htmlText(meta.purpose)}. ${htmlText(reliability)} based on ${logs.length} log${logs.length === 1 ? "" : "s"} in scope.</p></div>
  </div>`;
}

function statsModule(title, subtitle, bodyHtml, open = false) {
  const titleText = uiInsightLanguageHtml(htmlText(title));
  const subtitleText = subtitle ? uiInsightLanguageHtml(htmlText(subtitle)) : "";
  const content = bodyHtml || `<p class="muted">${htmlText(uiNoDataMessage("module"))}</p>`;
  return `<details class="advanced-stats-module" ${open ? "open" : ""}>
    <summary><span><strong>${titleText}</strong>${subtitle ? `<small>${subtitleText}</small>` : ""}</span><span class="advanced-module-chevron">›</span></summary>
    <div class="advanced-module-body">${uiInsightLanguageHtml(content)}</div>
  </details>`;
}

function renderAdvancedStatsModules(logs, { period, rid, range, rollingWindow, benchmarkWindow }) {
  const viewTitle = period === "exercise" ? "Per exercise view" : "Training view";
  if (!logs.length) {
    return `<div class="empty-state"><h3>${escapeHtml(viewTitle)} — ${escapeHtml(range.label)}</h3><p>No data yet for this view. Complete a practice session to unlock advanced analytics.</p><button class="primary" data-action="switch-tab" data-tab="practice">Go to Practice</button></div>`;
  }

  const alloc = computeAllocation(logs);
  const allocationHtml = `<div class="analytics-note"><strong>Allocation:</strong> ${alloc.map(a=>`<span class="badge">${escapeHtml(a.cat)}: ${a.pct.toFixed(1)}%</span>`).join("")}</div>`;
  const volumeMixHtml = `<h3>Volume chart</h3>${renderTrainingTimeInsightChart(logs, period)}<h3>Exercise mix</h3>${renderCategoryChart(logs)}${allocationHtml}`;

  let exerciseHtml = "";
  if (rid) {
    const exerciseBase = period === "exercise" || period === "overall" ? (data.logs || []).filter(l => String(l.routineId) === String(rid)) : logs;
    const exerciseLogs = exerciseBase.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    exerciseHtml = renderExerciseProgression(exerciseLogs, rollingWindow, benchmarkWindow);
  }

  return `<h3>${escapeHtml(viewTitle)} — ${escapeHtml(range.label)}</h3>
    <div class="advanced-stats-modules">
      ${statsModule("Logs in scope", "Raw daily/session table for the active filter", renderDateView(logs), true)}
      ${statsModule("Volume & exercise mix", "Training volume, category split, allocation", volumeMixHtml, true)}
      ${statsModule("Core analytics", "Momentum, hit-rate, streaks, correlations", renderAdvancedAnalytics(logs, rollingWindow, benchmarkWindow), false)}
      ${statsModule("Second-order analytics", "Variance, skill gap, weakness concentration", renderSecondOrderAnalytics(logs, rid, rollingWindow), false)}
      ${statsModule(uiLabel("performanceStability"), "Consistency and volatility signals", renderPerformanceStability(logs), false)}
      ${statsModule(uiLabel("staminaDropoff"), "Session-order performance decay or lift", renderFatigueSlope(logs), false)}
      ${statsModule("Difficulty ladder", "Difficulty distribution and progression", renderDifficultyLadder(logs), false)}
      ${statsModule(uiLabel("coachingEngine"), "Decision-oriented recommendations", renderCoachingEngine(logs), true)}
      ${rid ? statsModule("Selected exercise progression", "Longitudinal drill-specific history", exerciseHtml, true) : ""}
    </div>`;
}


function renderStatsEmptySection(title, range) {
  const friendlyTitle = getInsightLanguageSetting() === "friendly" ? uiInsightLanguageHtml(escapeHtml(title)) : escapeHtml(title);
  return `<div class="empty-state">
    <h3>${friendlyTitle} — ${escapeHtml(range.label)}</h3>
    <p>${htmlText(uiNoDataMessage("stats"))}</p>
    <button class="primary" data-action="switch-tab" data-tab="practice">Go to Practice</button>
  </div>`;
}

function renderStatsTrends(logs, { period, range, rollingWindow, benchmarkWindow }) {
  if (!logs.length) return renderStatsEmptySection("Trends", range);
  const chartPeriod = period === "overall" || period === "exercise" ? "monthly" : period;
  const volumeHtml = `<h3>Volume chart</h3>${renderTrainingTimeInsightChart(logs, chartPeriod)}<h3>Exercise mix</h3>${renderCategoryChart(logs)}`;
  return `<h3>Trends — ${escapeHtml(range.label)}</h3>
    <div class="advanced-stats-modules">
      ${statsModule("Volume & mix", "Training time, category split, and exercise allocation", volumeHtml, true)}
      ${statsModule("Core analytics", "Momentum, target hit-rate, streaks, and correlations", renderAdvancedAnalytics(logs, rollingWindow, benchmarkWindow), true)}
      ${statsModule("Second-order analytics", "Variance, skill gap, and weakness concentration", renderSecondOrderAnalytics(logs, "", rollingWindow), false)}
      ${statsModule(uiLabel("performanceStability"), "Consistency and volatility signals", renderPerformanceStability(logs), false)}
      ${statsModule(uiLabel("staminaDropoff"), "Session-order performance decay or lift", renderFatigueSlope(logs), false)}
      ${statsModule("Planned vs completed", "Whether planned drills are actually completed", plannedVsCompletedSummary() || `<div class="analytics-note">No planned-session completion data yet.</div>`, false)}
    </div>`;
}

function renderStatsRoutines(logs, { period, rid, range, rollingWindow, benchmarkWindow }) {
  if (!logs.length) return renderStatsEmptySection("Routines", range);
  const alloc = computeAllocation(logs);
  const allocationHtml = `<div class="analytics-note"><strong>Allocation:</strong> ${alloc.map(a=>`<span class="badge">${escapeHtml(a.cat)}: ${a.pct.toFixed(1)}%</span>`).join("")}</div>`;
  let exerciseHtml = "";
  if (rid) {
    const exerciseBase = period === "exercise" || period === "overall" ? (data.logs || []).filter(l => String(l.routineId) === String(rid)) : logs;
    const exerciseLogs = exerciseBase.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    exerciseHtml = renderExerciseProgression(exerciseLogs, rollingWindow, benchmarkWindow);
  }
  return `<h3>Routines — ${escapeHtml(range.label)}</h3>
    <div class="advanced-stats-modules">
      ${statsModule("Logs in scope", "Raw daily/session table for the active exercise filter", renderDateView(logs), true)}
      ${statsModule("Exercise mix", "Category distribution and allocation", `${renderCategoryChart(logs)}${allocationHtml}`, true)}
      ${statsModule("Difficulty ladder", "Difficulty distribution and progression", renderDifficultyLadder(logs), false)}
      ${rid ? statsModule("Selected exercise progression", "Longitudinal drill-specific history", exerciseHtml, true) : statsModule("Selected exercise progression", "Choose one exercise in the filter to see drill-specific history", `<p class="muted">Select a specific exercise above to show longitudinal routine progression.</p>`, false)}
    </div>`;
}


function groupLogsByTrainingSession(logs) {
  const groups = new Map();
  logs.slice().sort((a,b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0)).forEach((log, index) => {
    const key = log.sessionId || `log-${log.id || index}`;
    if (!groups.has(key)) groups.set(key, { id:key, logs:[], createdAt: log.createdAt || "" });
    const group = groups.get(key);
    group.logs.push(log);
    if (!group.createdAt || new Date(log.createdAt || 0) < new Date(group.createdAt || 0)) group.createdAt = log.createdAt || group.createdAt;
  });
  return Array.from(groups.values()).sort((a,b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
}

function linearTrend(values) {
  const clean = values.map((v,i) => ({x:i, y:Number(v)})).filter(p => Number.isFinite(p.y));
  if (clean.length < 2) return null;
  const meanX = avg(clean.map(p => p.x));
  const meanY = avg(clean.map(p => p.y));
  let num = 0, den = 0;
  clean.forEach(p => { num += (p.x - meanX) * (p.y - meanY); den += (p.x - meanX) ** 2; });
  const slope = den ? num / den : 0;
  const intercept = meanY - slope * meanX;
  return { slope, start: intercept, end: intercept + slope * (values.length - 1) };
}

function shortSessionDateLabel(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return safeDateString(d, { day: "2-digit", month: "short" });
}

function buildSessionKpiSeries(logs) {
  const sessions = groupLogsByTrainingSession(logs);
  const rollingScores = [];
  return sessions.map((session, idx) => {
    const arr = session.logs || [];
    const scoreVals = arr.map(l => Number(l.normalizedScore || 0)).filter(v => Number.isFinite(v));
    const avgScore = scoreVals.length ? avg(scoreVals) : null;
    if (avgScore !== null) rollingScores.push(avgScore);
    const windowVals = rollingScores.slice(-5);
    const consistency = windowVals.length >= 2 ? Math.max(0, 100 - stdDev(windowVals)) : null;
    const pressureLogs = arr.filter(l => l.pressureEnabled || l.sessionType === "pressure");
    const pressureVals = pressureLogs.map(l => Number(l.pressureSuccessRate ?? l.normalizedScore ?? 0)).filter(v => Number.isFinite(v));
    let left = 0, right = 0, sideN = 0;
    arr.forEach(l => {
      if (logUsesSideSplit(l)) {
        const ls = getLogLeftSideScore(l);
        const rs = getLogRightSideScore(l);
        if (Number.isFinite(ls) || Number.isFinite(rs)) {
          left += Number.isFinite(ls) ? ls : 0;
          right += Number.isFinite(rs) ? rs : 0;
          sideN++;
        }
      }
    });
    const sideTotal = left + right;
    const sideBalance = sideN && sideTotal ? Math.max(0, 100 - (Math.abs(left - right) / sideTotal * 100)) : null;
    return {
      index: idx + 1,
      label: `S${idx + 1}${shortSessionDateLabel(session.createdAt) ? " · " + shortSessionDateLabel(session.createdAt) : ""}`,
      date: session.createdAt ? safeDateString(session.createdAt) : `Session ${idx + 1}`,
      logCount: arr.length,
      avgScore,
      targetHitRate: targetHitRate(arr),
      practiceMinutes: arr.reduce((sum,l) => sum + Number(l.timeMinutes || 0), 0),
      pressureSuccess: pressureVals.length ? avg(pressureVals) : null,
      consistency,
      sideBalance
    };
  });
}

function renderSessionTrendChart(title, subtitle, rows, key, suffix = "", precision = 1) {
  const values = rows.map(r => Number(r[key])).map(v => Number.isFinite(v) ? v : null);
  const valid = values.filter(v => v !== null);
  if (valid.length < 2) {
    return `<div class="trend-chart-card"><h4>${htmlText(title)}</h4><p class="muted">Not enough session-level data yet.</p></div>`;
  }
  const width = 640, height = 230, padL = 42, padR = 18, padT = 18, padB = 44;
  const minRaw = safeMin(valid, 0), maxRaw = safeMax(valid, 0);
  const padY = Math.max(1, (maxRaw - minRaw) * 0.12);
  const minY = Math.max(0, minRaw - padY);
  const maxY = Math.min(key === "practiceMinutes" ? Math.max(maxRaw + padY, 10) : 100, maxRaw + padY);
  const spanY = maxY - minY || 1;
  const xFor = i => padL + (rows.length <= 1 ? 0 : (i / (rows.length - 1)) * (width - padL - padR));
  const yFor = v => padT + ((maxY - v) / spanY) * (height - padT - padB);
  const points = values.map((v,i) => v === null ? null : `${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).filter(Boolean).join(" ");
  const pointMarkers = values.map((v,i) => {
    if (v === null) return "";
    const row = rows[i];
    const valueText = `${v.toFixed(precision)}${suffix}`;
    const ctx = `${row.label || `S${i+1}`} · ${row.logCount || 0} log${row.logCount === 1 ? "" : "s"}`;
    return `<circle class="metric-point" cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="3"><title>${attrText(`${title}: ${valueText} — ${ctx}`)}</title></circle>`;
  }).join("");
  const trend = linearTrend(values);
  const trendLine = trend ? `<line class="trendline" x1="${xFor(0).toFixed(1)}" y1="${yFor(Math.max(minY, Math.min(maxY, trend.start))).toFixed(1)}" x2="${xFor(rows.length - 1).toFixed(1)}" y2="${yFor(Math.max(minY, Math.min(maxY, trend.end))).toFixed(1)}"></line>` : "";
  const last = valid[valid.length - 1];
  const firstValid = valid[0];
  const delta = valid.length >= 2 ? last - firstValid : 0;
  const direction = delta > 0.05 ? "improving" : delta < -0.05 ? "declining" : "flat";
  const yTicks = [minY, (minY + maxY) / 2, maxY].map(v => `<text x="6" y="${yFor(v).toFixed(1)}" class="axis-label">${v.toFixed(0)}</text>`).join("");
  const firstLabel = rows[0]?.label || "S1";
  const midRow = rows.length > 2 ? rows[Math.floor((rows.length - 1) / 2)] : null;
  const lastLabel = rows[rows.length - 1]?.label || `S${rows.length}`;
  const midTick = midRow ? `<text x="${xFor(Math.floor((rows.length - 1) / 2)).toFixed(1)}" y="${height-8}" class="axis-label axis-label-mid">${htmlText(midRow.label || "")}</text>` : "";
  const latestRow = rows.slice().reverse().find((r, i) => values[rows.length - 1 - i] !== null) || rows[rows.length - 1];
  const latestContext = `${latestRow?.label || lastLabel} · ${latestRow?.logCount || 0} log${latestRow?.logCount === 1 ? "" : "s"}`;
  return `<div class="trend-chart-card">
    <div class="trend-chart-head"><div><h4>${htmlText(title)}</h4><p class="muted">${htmlText(subtitle)}</p></div><div class="trend-chart-kpi"><strong>${last.toFixed(precision)}${suffix}</strong><span>${direction} · ${delta >= 0 ? "+" : ""}${delta.toFixed(precision)}${suffix}</span></div></div>
    <div class="chart-mobile-context"><span>Latest: ${htmlText(latestContext)}</span><span>From ${htmlText(firstLabel)} to ${htmlText(lastLabel)}</span></div>
    <svg class="session-trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${attrText(title)} trend over sessions and dates">
      <line class="gridline" x1="${padL}" y1="${yFor(minY).toFixed(1)}" x2="${width-padR}" y2="${yFor(minY).toFixed(1)}"></line>
      <line class="gridline" x1="${padL}" y1="${yFor((minY+maxY)/2).toFixed(1)}" x2="${width-padR}" y2="${yFor((minY+maxY)/2).toFixed(1)}"></line>
      <line class="gridline" x1="${padL}" y1="${yFor(maxY).toFixed(1)}" x2="${width-padR}" y2="${yFor(maxY).toFixed(1)}"></line>
      ${yTicks}
      <text x="${padL}" y="${height-8}" class="axis-label">${htmlText(firstLabel)}</text>
      ${midTick}
      <text x="${width-padR-88}" y="${height-8}" class="axis-label axis-label-end">${htmlText(lastLabel)}</text>
      ${trendLine}
      <polyline class="metric-line" points="${points}"></polyline>
      ${pointMarkers}
    </svg>
  </div>`;
}

function renderStatsGraphs(logs, { range }) {
  if (!logs.length) return renderStatsEmptySection("Graphs", range);
  const rows = buildSessionKpiSeries(logs);
  if (rows.length < 2) return `<h3>Graphs — ${escapeHtml(range.label)}</h3><p class="muted">Need at least two logged sessions to show session-adjusted trend graphs.</p>`;
  return `<h3>Graphs — ${escapeHtml(range.label)}</h3>
    <div class="analytics-note"><strong>Session-adjusted view.</strong> Each point represents one training session and the labels include both session number and date where available. This avoids over-weighting calendar gaps while still giving mobile users date context.</div>
    <div class="graphs-grid">
      ${renderSessionTrendChart("Average score", "Mean normalized score per session", rows, "avgScore", "", 1)}
      ${renderSessionTrendChart("Target hit rate", "Share of logs at or above target per session", rows, "targetHitRate", "%", 1)}
      ${renderSessionTrendChart("Practice volume", "Logged minutes per session", rows, "practiceMinutes", "m", 0)}
      ${renderSessionTrendChart("Consistency", "Rolling stability score based on recent session scores", rows, "consistency", "/100", 0)}
      ${renderSessionTrendChart("Pressure success", "Pressure-mode success rate where available", rows, "pressureSuccess", "%", 1)}
      ${renderSessionTrendChart("Side balance", "Left/right balance score where side-split data exists", rows, "sideBalance", "/100", 0)}
    </div>`;
}

function renderStatsPressure(logs, { range }) {
  if (!logs.length) return renderStatsEmptySection("Pressure", range);
  const pressureLogs = logs.filter(l => l.pressureEnabled || l.sessionType === "pressure");
  const body = pressureLogs.length ? renderDateView(pressureLogs) : `<p class="muted">No pressure-mode logs in the current scope.</p>`;
  return `<h3>Pressure — ${escapeHtml(range.label)}</h3>
    <div class="advanced-stats-modules">
      ${statsModule("Pressure logs", "Pressure-mode history and hit-rate", body, true)}
      ${statsModule("Pressure analytics", "Core analytics restricted to pressure logs", pressureLogs.length ? renderAdvancedAnalytics(pressureLogs, 5, 10) : `<p class="muted">More pressure logs needed.</p>`, pressureLogs.length > 0)}
      ${statsModule("Pressure stability", "Volatility and consistency under pressure", pressureLogs.length ? renderPerformanceStability(pressureLogs) : `<p class="muted">More pressure logs needed.</p>`, false)}
    </div>`;
}

function renderStatsInsights(logs, { range, rid, rollingWindow }) {
  if (!logs.length) return renderStatsEmptySection("Insights", range);
  return `<h3>${htmlText(uiLabel("statsInsights"))} — ${escapeHtml(range.label)}</h3>
    <div class="advanced-stats-modules">
      ${statsModule(uiLabel("coachingEngine"), "Decision-oriented recommendations", renderCoachingEngine(logs), true)}
      ${statsModule(uiLabel("weaknessConcentration"), "Where underperformance is concentrated", renderSecondOrderAnalytics(logs, rid, rollingWindow), true)}
      ${statsModule(uiLabel("performanceStability"), "Consistency and volatility signals", renderPerformanceStability(logs), false)}
      ${statsModule(uiLabel("staminaDropoff"), "Session-order performance decay or lift", renderFatigueSlope(logs), false)}
    </div>`;
}

function renderStatsBayesianSection(logs, { range }) {
  const note = logs.length
    ? `True Skill models use the active stats scope where applicable. Current scope contains ${logs.length} log${logs.length === 1 ? "" : "s"}.`
    : "True Skill analytics will appear once success-rate logs exist.";
  return `<h3>${htmlText(uiLabel("trueSkill"))} — ${escapeHtml(range.label)}</h3><p class="muted">${escapeHtml(note)}</p>`;
}

function renderStatsABSection(logs, { range }) {
  const note = logs.length
    ? `Use the controls above to compare two periods. Current global scope contains ${logs.length} log${logs.length === 1 ? "" : "s"}.`
    : "Use the controls above to compare two periods once logs exist.";
  return `<h3>${htmlText(uiLabel("abComparison"))} — ${escapeHtml(range.label)}</h3><p class="muted">${escapeHtml(note)}</p>`;
}

function renderStatsCounterfactualSection(logs, { range }) {
  const note = logs.length
    ? `Select a chosen routine and an alternative routine above, then run the comparison. Current scope contains ${logs.length} log${logs.length === 1 ? "" : "s"}.`
    : "Select routines above once you have enough logged sessions.";
  return `<h3>${htmlText(uiLabel("drillComparison"))} — ${escapeHtml(range.label)}</h3><p class="muted">${escapeHtml(note)}</p>`;
}

function renderStatsTournamentSection(logs, { range, rid }) {
  const filterWarning = rid ? `<div class="analytics-note"><strong>Exercise filter ignored for tournament readiness.</strong> Tournament preparation uses all logged exercises in the selected date period so potting, safety, pressure, break-building, and balance signals are assessed together.</div>` : "";
  return `<h3>${htmlText(uiLabel("tournamentPrep"))} — ${escapeHtml(range.label)} ${statHelpButton("tournamentPrep")}</h3>
    <p class="muted">Dedicated preparation planner. It uses all exercises in the selected period and deliberately bypasses the single-exercise routine filter.</p>
    ${filterWarning}
    ${tournamentPrepPlannerHtml(logs)}`;
}

function toggleStatsStandalonePanels() {
  const abPanel = $("statsABPanel");
  if (abPanel) abPanel.classList.toggle("hidden", statsMode !== "ab");
  const regretPanel = $("regretEnginePanel");
  if (regretPanel) regretPanel.classList.toggle("hidden", statsMode !== "counterfactual");
  const phasePanel = $("phaseOneInsightsPanel");
  if (phasePanel) phasePanel.classList.toggle("hidden", statsMode !== "insights");
  const weekly = $("weeklyReviewBox");
  if (weekly) weekly.classList.toggle("hidden", statsMode !== "insights");
  const bayesianPanel = $("statsBayesianPanel");
  if (bayesianPanel) bayesianPanel.classList.toggle("hidden", statsMode !== "bayesian");
  const tableStats = $("tableStatsBox");
  if (tableStats) tableStats.classList.toggle("hidden", !(statsMode === "overview" || statsMode === "routines"));
}

function renderStats() {
  const output = $("statsOutput");
  if (!output) return;
  if (indexedDBHydrating && !indexedDBReady && !indexedDBUnavailable) {
    output.innerHTML = `<div class="analytics-note"><strong>Loading analytics…</strong><br><span class="muted">Storage hydration is still completing. Stats will render automatically when the local database is ready.</span></div>`;
    return;
  }
  statsMode = normalizeStatsMode(statsMode);
  try {
    const scope = getStatsScope();
    const { period, rid, range } = scope;
    const rollingWindow = Math.max(2, Number($("rollingWindowInput")?.value || 5));
    const benchmarkWindow = Math.max(3, Number($("benchmarkWindowInput")?.value || 10));

    let scopedLogs = getScopedStatsLogs();
    if (statsMode === "tournament") scopedLogs = getTournamentPlannerLogs(scope);
    const scopedAnalyticsLogs = analyticsWindow(scopedLogs);
    renderTableStats(scopedLogs);

    renderStatsScopeChips(scope, scopedLogs);
    let html = renderStatsScopeBanner(scope, scopedLogs) + renderStatsSectionIntro(scopedLogs, range);
    if (statsMode === "overview") {
      html += renderStatsOverview(scopedLogs, rid, period, range, rollingWindow);
    } else if (statsMode === "trends") {
      html += renderStatsTrends(scopedLogs, { period, rid, range, rollingWindow, benchmarkWindow });
     } else if (statsMode === "graphs") {
      html += renderStatsGraphs(scopedAnalyticsLogs, { period, rid, range, rollingWindow, benchmarkWindow });
    } else if (statsMode === "routines") {
      html += renderStatsRoutines(scopedLogs, { period, rid, range, rollingWindow, benchmarkWindow });
    } else if (statsMode === "pressure") {
      html += renderStatsPressure(scopedLogs, { period, rid, range, rollingWindow, benchmarkWindow });
    } else if (statsMode === "insights") {
      html += renderStatsInsights(scopedAnalyticsLogs, { period, rid, range, rollingWindow, benchmarkWindow });
    } else if (statsMode === "bayesian") {
      html += renderStatsBayesianSection(scopedAnalyticsLogs, { period, rid, range, rollingWindow, benchmarkWindow });
    } else if (statsMode === "ab") {
      html += renderStatsABSection(scopedLogs, { period, rid, range, rollingWindow, benchmarkWindow });
    } else if (statsMode === "counterfactual") {
      html += renderStatsCounterfactualSection(scopedAnalyticsLogs, { period, rid, range, rollingWindow, benchmarkWindow });
    } else if (statsMode === "tournament") {
      html += renderStatsTournamentSection(scopedAnalyticsLogs, { period, rid, range, rollingWindow, benchmarkWindow });
    } else {
      statsMode = "overview";
      html += renderStatsOverview(scopedLogs, rid, period, range, rollingWindow);
    }
    output.innerHTML = "";
    output.innerHTML = html;
    toggleStatsStandalonePanels();
    try { renderBayesianAnalyticsValidation?.(); } catch(e) { logAppError(e, "renderStats bayesian side panels"); }
    applyStoredStatsModeVisual();
  } catch (err) {
    logAppError(err, "renderStats hard failure");
    statsMode = "overview";
    try { localStorage.setItem(STATS_MODE_KEY, statsMode); } catch(e) {}
    output.innerHTML = `<h3>Stats temporarily unavailable</h3><div class="analytics-note"><strong>Rendering issue recovered.</strong> The app reset the internal Stats section to Overview. Switch tabs again or refresh once if this message remains.</div>`;
    applyStoredStatsModeVisual();
  }
}

function getStatsDetailMode() {
  const raw = localStorage.getItem(STATS_DETAIL_MODE_KEY) || $("statsDetailMode")?.value || "basic";
  return raw === "advanced" ? "advanced" : "basic";
}
function setStatsDetailMode(mode) {
  const clean = mode === "advanced" ? "advanced" : "basic";
  localStorage.setItem(STATS_DETAIL_MODE_KEY, clean);
  if ($("statsDetailMode")) $("statsDetailMode").value = clean;
  renderStats();
}

function kpiTitle(label, helpKey) {
  return `${htmlText(label)} ${statHelpButton(helpKey)}`;
}

function renderSelectedExerciseDashboard(logs, rid, rollingWindow) {
  const r = routineById(rid);
  if (!r || !logs.length) return "";
  const ordered = logs.slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const vals = ordered.map(l=>Number(l.normalizedScore||0)).filter(v=>Number.isFinite(v));
  const current = vals.length ? vals[vals.length-1] : null;
  const recentVals = vals.slice(-Math.max(2, Number(rollingWindow || 5)));
  const rolling = recentVals.length ? avg(recentVals) : null;
  const best = vals.length ? safeMax(vals, null) : null;
  const hit = targetHitRate(ordered);
  const last = ordered[ordered.length-1];
  const days = last ? daysSince(last.createdAt) : null;
  const target = Number(r.target || 0);
  let evidence = `${ordered.length} log${ordered.length === 1 ? "" : "s"}`;
  let confidenceLabel = "Not enough success-rate evidence";
  let trueSkill = "N/A";
  let interval = "N/A";
  let bayesHtml = "";
  if (r.scoring === "success_rate") {
    const agg = aggregateSuccessRateLogs(ordered.filter(l => l.scoring === "success_rate" || !l.scoring));
    evidence = `${numText(agg.attempts, "0")} effective attempts · ${numText(agg.sessions, "0")} logs`;
    const posterior = betaPosterior(agg.successes, agg.attempts, 2, 2, {rawAttempts:agg.rawAttempts, rawSuccesses:agg.rawSuccesses});
    const reliability = bayesianReliabilityLabel(posterior);
    const policy = bayesianActionPolicy(bayesianRecommendationSignal({posterior, targetPct:target}), posterior, target);
    confidenceLabel = reliability.label;
    trueSkill = formatPercent(posterior.mean);
    interval = `${formatPercent(posterior.lower)}–${formatPercent(posterior.upper)}`;
    bayesHtml = `<div class="exercise-focus-action"><strong>${htmlText(policy.title)}</strong><p>${htmlText(policy.instruction)}</p></div>`;
  }
  const bayes = r.scoring === "success_rate" ? bayesianStatsForRoutine(rid) : null;
  const uncertainty = bayes?.posterior ? (bayes.posterior.upper - bayes.posterior.lower) : 0;
  const plateau = detectPlateauState(ordered, { uncertainty });
  const action = plateauActionRecommendation(plateau.state);
  const side = sideImbalanceMetric(ordered);
  const pressure = pressureOverviewMetric(ordered);
  return `<div class="exercise-focus-dashboard">
    <div class="exercise-focus-head">
      <div><h3>Selected exercise dashboard — ${htmlText(r.name)}</h3><p class="muted">The overview is now drill-specific because an exercise filter is active.</p></div>
      <span class="badge">${htmlText(r.category || r.folder || "Exercise")}</span>
    </div>
    <div class="overview-kpi-dashboard exercise-focus-grid">
      <div class="overview-kpi primary"><span>${kpiTitle("Current level", "kpiCurrentLevel")}</span><div class="value">${current === null ? "N/A" : current.toFixed(1)}</div><small>Most recent normalized score.</small></div>
      <div class="overview-kpi primary"><span>${kpiTitle("Rolling score", "kpiRollingScore")}</span><div class="value">${rolling === null ? "N/A" : rolling.toFixed(1)}</div><small>Last ${recentVals.length || 0} logged result${recentVals.length === 1 ? "" : "s"}.</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Target hit rate", "targetHitRate")}</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div><small>Target ${target || "not set"}.</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Estimated true skill", "kpiTrueSkill")}</span><div class="value">${trueSkill}</div><small>${htmlText(confidenceLabel)} · ${htmlText(interval)}</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Evidence", "kpiEvidence")}</span><div class="value">${htmlText(evidence)}</div><small>Uses effective attempts for per-side drills.</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Best score", "bestScore")}</span><div class="value">${best === null ? "N/A" : best.toFixed(1)}</div><small>Best normalized result in scope.</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Plateau state", "plateau")}</span><div class="value">${htmlText(plateau.label)}</div><small>${htmlText(plateau.detail)}</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Last trained", "kpiLastTrained")}</span><div class="value">${days === null ? "N/A" : days+"d"}</div><small>${last ? htmlText(safeDateString(last.createdAt)) : "No date"}</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Pressure", "kpiPressure")}</span><div class="value">${pressure ? pressure.label : "N/A"}</div><small>${pressure ? `${pressure.count} pressure log${pressure.count === 1 ? "" : "s"}` : "No pressure logs"}</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Side balance", "kpiSideBalance")}</span><div class="value">${side ? htmlText(side.label) : "N/A"}</div><small>${side ? htmlText(side.detail) : "No left/right logs"}</small></div>
    </div>
    <div class="overview-exec-strip">
      <div class="overview-mini-card"><strong>Plateau action</strong><span>${htmlText(action.title)} — ${htmlText(action.instruction)}</span></div>
      <div class="overview-mini-card"><strong>Last result</strong><span>${last ? `${displayScore(last)} · ${htmlText(last.performance || "N/A")}` : "No log yet"}</span></div>
      <div class="overview-mini-card"><strong>Scoring type</strong><span>${htmlText(r.scoring || "standard")} · ${htmlText(getRoutineAttemptMode(r) || "shared")}</span></div>
    </div>
    ${bayesHtml}
  </div>`;
}

function renderStatsOverview(logs, rid, period, range, rollingWindow) {
  if (!logs.length) return `<div class="empty-state">
    <h3>Overview — ${escapeHtml(range.label)}</h3>
    <p>No data yet. Complete a practice session to see your performance trends.</p>
    <button class="primary" data-action="switch-tab" data-tab="practice">Go to Practice</button>
  </div>`;

  if (!rid && getStatsDetailMode() === "basic") {
    const totalTimeBasic = logs.reduce((a,b)=>a+Number(b.timeMinutes||0),0);
    const valsBasic = logs.map(l=>Number(l.normalizedScore||0)).filter(v=>Number.isFinite(v));
    const avgBasic = avg(valsBasic);
    const hitBasic = targetHitRate(logs);
    const recentBasic = valsBasic.slice(-Math.max(2, Number(rollingWindow || 5)));
    const rollingBasic = recentBasic.length ? avg(recentBasic) : null;
    return `<h3>Basic overview — ${escapeHtml(range.label)}</h3>
      <div class="analytics-note"><strong>Basic stats mode.</strong> Showing only the core practice dashboard. Switch Stats detail to Advanced for full diagnostics.</div>
      <div class="overview-kpi-dashboard basic-stats-dashboard">
        <div class="overview-kpi primary"><span>${kpiTitle("Average score", "avgScore")}</span><div class="value">${avgBasic.toFixed(1)}</div><small>Average normalized performance in this view.</small></div>
        <div class="overview-kpi primary"><span>${kpiTitle("Target hit rate", "targetHitRate")}</span><div class="value">${hitBasic === null ? "N/A" : hitBasic.toFixed(1)+"%"}</div><small>How often logged scores met the target.</small></div>
        <div class="overview-kpi"><span>${kpiTitle("Training time", "totalPractice")}</span><div class="value">${totalTimeBasic.toFixed(1)}m</div><small>Total logged practice time.</small></div>
        <div class="overview-kpi"><span>${kpiTitle("Recent form", "momentum")}</span><div class="value">${rollingBasic === null ? "N/A" : rollingBasic.toFixed(1)}</div><small>Rolling average over the latest ${recentBasic.length} logs.</small></div>
      </div>
      <h3>Core trend</h3>${renderTrainingTimeInsightChart(logs, period)}
      <h3>Training mix</h3>${renderCategoryChart(logs)}`;
  }

  if (rid) {
    let html = renderSelectedExerciseDashboard(logs, rid, rollingWindow);
    html += `<h3>Drill charts — ${escapeHtml(range.label)}</h3>${renderCategoryChart(logs)}${renderTrainingTimeInsightChart(logs, period)}`;
    const exerciseLogs = logs.filter(l => l.routineId === rid).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    if (exerciseLogs.length) html += renderExerciseProgression(exerciseLogs, rollingWindow, Number($("benchmarkWindowInput").value || 10));
    return html;
  }

  const totalTime = logs.reduce((a,b)=>a+Number(b.timeMinutes||0),0);
  const vals = logs.map(l=>Number(l.normalizedScore||0));
  const avgScore = avg(vals);
  const hit = targetHitRate(logs);
  const gap = skillGapIndex(logs);
  const weak = weaknessConcentration(logs)[0];
  const fatigue = fatigueCurve(logs);
  const st = streaks(logs);
  const momentum = movingTrend(vals, rollingWindow);
  const stability = performanceStabilityIndex(logs, 10);
  const pressure = pressureOverviewMetric(logs);
  const side = sideImbalanceMetric(logs);
  const bestRoutine = routinePerformanceLeader(logs, "best");
  const weakestRoutine = routinePerformanceLeader(logs, "weakest");
  const improved = mostImprovedRoutine(logs);

  let html = `<h3>Overview — ${escapeHtml(range.label)}</h3>
    <div class="overview-kpi-dashboard">
      <div class="overview-kpi primary"><span>${kpiTitle("Average score", "averagePerformance")}</span><div class="value">${Number.isFinite(avgScore) ? avgScore.toFixed(1) : "N/A"}</div><small>Mean normalized score across the selected scope.</small></div>
      <div class="overview-kpi primary"><span>${kpiTitle("Target hit rate", "targetHitRate")}</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div><small>On Target + Above Target logs.</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Total practice", "totalTrainingTime")}</span><div class="value">${formatDurationHuman(totalTime)}</div><small>${logs.length} logged exercise${logs.length === 1 ? "" : "s"}</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Current streak", "kpiStreak")}</span><div class="value">${st.current}d</div><small>Best streak ${st.best}d</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Momentum", "progressVelocity")}</span><div class="value">${escapeHtml(momentum)}</div><small>Rolling window: ${rollingWindow} logs.</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Consistency", "psi")}</span><div class="value">${stability ? stability.psi.toFixed(0)+"/100" : "N/A"}</div><small>${stability ? escapeHtml(stability.label) : "More data needed"}</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Skill gap", "kpiSkillGap")}</span><div class="value">${gap === null ? "N/A" : gap.toFixed(2)}</div><small>Best performance minus average.</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Pressure success", "kpiPressure")}</span><div class="value">${pressure ? pressure.label : "N/A"}</div><small>${pressure ? `${pressure.count} pressure log${pressure.count === 1 ? "" : "s"}` : "No pressure logs in scope"}</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Side balance", "kpiSideBalance")}</span><div class="value">${side ? side.label : "N/A"}</div><small>${side ? escapeHtml(side.detail) : "No left/right logs in scope"}</small></div>
      <div class="overview-kpi"><span>${kpiTitle("Weakest area", "kpiWeakestArea")}</span><div class="value">${weak ? escapeHtml(weak.category) : "N/A"}</div><small>${weak && weak.hitRate !== null ? `Hit rate ${weak.hitRate.toFixed(1)}%` : "More target data needed"}</small></div>
    </div>
    <div class="overview-exec-strip">
      <div class="overview-mini-card"><strong>Best exercise</strong><span>${bestRoutine ? `${escapeHtml(bestRoutine.name)} · ${bestRoutine.metric}` : "More logs needed"}</span></div>
      <div class="overview-mini-card"><strong>Weakest exercise</strong><span>${weakestRoutine ? `${escapeHtml(weakestRoutine.name)} · ${weakestRoutine.metric}` : "More logs needed"}</span></div>
      <div class="overview-mini-card"><strong>Most improved</strong><span>${improved ? `${escapeHtml(improved.name)} · ${improved.metric}` : "More history needed"}</span></div>
    </div>`;

  html += `<div class="stats-priority-stack">
    <h3>Recommended action</h3>
    ${renderCoachingEngine(logs, rid)}
  </div>`;

  const diagnosticsHtml = [
    statsModule(uiLabel("performanceStability"), "Reliability, volatility, and repeatability", renderPerformanceStability(logs), false),
    statsModule(uiLabel("staminaDropoff"), "Performance decay or lift inside sessions", renderFatigueSlope(logs), false),
    statsModule("Difficulty ladder", "Whether targets are too easy, appropriate, or too hard", renderDifficultyLadder(logs), false),
    statsModule("Second-order analytics", "Variance, skill gap, and weakness concentration", renderSecondOrderAnalytics(logs, rid, rollingWindow), false)
  ].join("");
  html += `<h3>Advanced diagnostics</h3><div class="advanced-stats-modules stats-collapsed-diagnostics">${diagnosticsHtml}</div>`;

  const decisionNotes = [];
  if (weak) decisionNotes.push(`<div class="analytics-note"><strong>Weakest area:</strong> ${escapeHtml(weak.category)} · hit rate ${weak.hitRate === null ? "N/A" : weak.hitRate.toFixed(1)+"%"} · vs overall ${weak.delta === null ? "N/A" : weak.delta.toFixed(1)+" pts"}</div>`);
  if (fatigue) decisionNotes.push(`<div class="analytics-note"><strong>Fatigue curve:</strong> first-third avg ${fatigue.first.toFixed(2)} vs final-third avg ${fatigue.last.toFixed(2)} (${fatigue.deltaPct >= 0 ? "+" : ""}${fatigue.deltaPct.toFixed(1)}%).</div>`);
  if (decisionNotes.length) html += `<details class="advanced-stats-module stats-decision-notes"><summary><span><strong>Decision notes</strong><small>Extra context behind the dashboard</small></span><span class="advanced-module-chevron">›</span></summary><div class="advanced-module-body">${decisionNotes.join("")}</div></details>`;

  html += `<h3>Compact charts</h3><div class="stats-graph-group">${renderCategoryChart(logs)}${renderTrainingTimeInsightChart(logs, period)}</div>`;
  return html;
}

function routinePerformanceLeader(logs, mode="best") {
  const groups = {};
  logs.forEach(l => {
    const rid = l.routineId || "unknown";
    if (!groups[rid]) groups[rid] = [];
    groups[rid].push(l);
  });
  const rows = Object.entries(groups).map(([rid, arr]) => {
    const routine = routineById(rid);
    const score = avg(arr.map(l => Number(l.normalizedScore || 0)).filter(v => Number.isFinite(v)));
    const hit = targetHitRate(arr);
    return {rid, name:routine?.name || arr[0]?.routineName || "Unknown exercise", count:arr.length, score, hit};
  }).filter(r => r.count >= 2 && Number.isFinite(r.score));
  if (!rows.length) return null;
  rows.sort((a,b) => mode === "weakest" ? a.score - b.score : b.score - a.score);
  const top = rows[0];
  return {name: top.name, metric: `${top.score.toFixed(1)} avg · ${top.count} logs`};
}

function mostImprovedRoutine(logs) {
  const groups = {};
  logs.slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).forEach(l => {
    const rid = l.routineId || "unknown";
    if (!groups[rid]) groups[rid] = [];
    groups[rid].push(l);
  });
  const rows = Object.entries(groups).map(([rid, arr]) => {
    if (arr.length < 4) return null;
    const split = Math.floor(arr.length / 2);
    const early = avg(arr.slice(0, split).map(l => Number(l.normalizedScore || 0)));
    const late = avg(arr.slice(split).map(l => Number(l.normalizedScore || 0)));
    const routine = routineById(rid);
    return {name:routine?.name || arr[0]?.routineName || "Unknown exercise", delta: late - early, count:arr.length};
  }).filter(Boolean).filter(r => Number.isFinite(r.delta));
  if (!rows.length) return null;
  rows.sort((a,b)=>b.delta-a.delta);
  const top = rows[0];
  return {name:top.name, metric:`${top.delta >= 0 ? "+" : ""}${top.delta.toFixed(1)} pts · ${top.count} logs`};
}

function pressureOverviewMetric(logs) {
  const arr = logs.filter(l => l.pressureEnabled || l.sessionType === "pressure");
  if (!arr.length) return null;
  const rates = arr.map(l => Number(l.pressureSuccessRate ?? l.normalizedScore ?? 0)).filter(v => Number.isFinite(v));
  if (!rates.length) return null;
  const mean = avg(rates);
  return {label:`${mean.toFixed(1)}%`, count:arr.length};
}

function sideImbalanceMetric(logs) {
  const arr = logs.filter(l => logUsesSideSplit(l));
  if (!arr.length) return null;
  let left=0, right=0;
  arr.forEach(l => {
    const ls = getLogLeftSideScore(l);
    const rs = getLogRightSideScore(l);
    left += Number.isFinite(ls) ? ls : 0;
    right += Number.isFinite(rs) ? rs : 0;
  });
  const total = left + right;
  if (!total) return {label:"0", detail:`L ${left} · R ${right}`};
  const diff = left - right;
  const pct = Math.abs(diff) / total * 100;
  const side = diff === 0 ? "Even" : diff > 0 ? "L+" : "R+";
  return {label: diff === 0 ? "Even" : `${side}${pct.toFixed(0)}%`, detail:`L ${left} · R ${right}`};
}


function skillGapIndex(logs) {
  if (logs.length < 2) return null;
  const vals = logs.map(l=>Number(l.normalizedScore||0));
  return safeMax(vals, 0) - avg(vals);
}

function weaknessConcentration(logs) {
  const overall = targetHitRate(logs);
  const groups = {};
  logs.forEach(l => {
    const k = l.category || "uncategorized";
    if (!groups[k]) groups[k] = [];
    groups[k].push(l);
  });
  return Object.entries(groups).map(([category, arr]) => {
    const hr = targetHitRate(arr);
    return {category, count: arr.length, hitRate: hr, delta: hr === null || overall === null ? null : hr - overall};
  }).sort((a,b) => {
    const av = a.hitRate === null ? 999 : a.hitRate;
    const bv = b.hitRate === null ? 999 : b.hitRate;
    return av - bv;
  });
}

function fatigueCurve(logs) {
  if (logs.length < 3) return null;
  const ordered = logs.slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const n = Math.max(1, Math.floor(ordered.length / 3));
  const first = avg(ordered.slice(0,n).map(l=>Number(l.normalizedScore||0)));
  const last = avg(ordered.slice(-n).map(l=>Number(l.normalizedScore||0)));
  const deltaPct = safePercentChange(last, first);
  return {first,last,deltaPct};
}


function coachingInsightForUI(item){
  if (getInsightLanguageSetting() !== "friendly") return item;
  const title = String(item?.title || "");
  const text = String(item?.text || "");
  const lower = (title + " " + text).toLowerCase();
  if (lower.includes("prioritize")) return {title:title.replace(/^Prioritize/i, "Focus on"), text:text.replace("Allocate more volume here in the next session.", "Add one focused block next session.")};
  if (lower.includes("high skill gap")) return {title:"Build consistency", text:"Your best scores are much higher than your average. Repeat the same setup until the baseline rises."};
  if (lower.includes("low skill gap")) return {title:"Raise the challenge", text:"Your average is close to your best. Add a constraint if your target hit rate is already strong."};
  if (lower.includes("fatigue")) return {title:"Protect your energy", text:"Late-session performance is dropping. Use shorter sets or more rest."};
  if (lower.includes("slow-start")) return {title:"Warm up first", text:"You improve later in the session. Add a short unscored calibration block before logging."};
  if (lower.includes("progressive overload")) return {title:"Make it harder", text:"Your hit rate is high. Increase the target slightly or add one constraint."};
  if (lower.includes("regression")) return {title:"Make it easier", text:"The hit rate is low. Simplify the drill until execution stabilizes."};
  if (lower.includes("plateau")) return {title:"Change the stimulus", text:"Performance has flattened. Change one constraint instead of repeating identical volume."};
  if (lower.includes("overtraining") || lower.includes("low yield")) return {title:"Reduce low-yield volume", text:"Volume increased without matching improvement. Shorten the block or add more recovery."};
  if (lower.includes("dynamic difficulty")) return {title:"Adjust difficulty", text:text.replace(/^.*?:\s*/, "")};
  if (lower.includes("difficulty ladder")) return {title:"Use the next difficulty step", text};
  if (lower.includes("maintain current")) return {title:"Keep the structure", text:"No strong bottleneck detected. Keep logging to strengthen the signal."};
  return item;
}

function coachingBaseMetrics(logs, rid=null) {
  const arr = logs || [];
  let count = 0;
  let sum = 0;
  let max = -Infinity;
  let targetCount = 0;
  let targetHits = 0;
  for (const l of arr) {
    const v = Number(l?.normalizedScore || 0);
    if (Number.isFinite(v)) { count += 1; sum += v; if (v > max) max = v; }
    const perf = l?.performance || "N/A";
    if (perf !== "N/A") {
      targetCount += 1;
      if (perf === "On Target" || perf === "Above Target") targetHits += 1;
    }
  }
  const vals = arr.map(l=>Number(l.normalizedScore||0)).filter(Number.isFinite);
  const mean = count ? sum / count : 0;
  const hit = targetCount ? targetHits / targetCount * 100 : null;
  const gap = count >= 2 && Number.isFinite(max) ? max - mean : null;
  return {vals, mean, hit, gap, weak: rid ? null : weaknessConcentration(arr)[0], fatigue: fatigueCurve(arr)};
}

function renderCoachingEngine(logs, rid=null) {
  if (!logs.length) return "";
  const metrics = coachingBaseMetrics(logs, rid);
  const vals = metrics.vals;
  const hit = metrics.hit;
  const gap = metrics.gap;
  const weak = metrics.weak;
  const fatigue = metrics.fatigue;
  const insights = [];

  if (weak && weak.hitRate !== null) {
    insights.push({
      title: `Prioritize ${weak.category}`,
      text: `This category has the weakest hit rate (${weak.hitRate.toFixed(1)}%). Allocate more volume here in the next session.`
    });
  }

  if (gap !== null) {
    if (gap > metrics.mean * 0.35) {
      insights.push({
        title: "High skill gap: consistency problem",
        text: `Your best performance is materially above your average. Use repetition blocks and reduce difficulty changes until baseline rises.`
      });
    } else {
      insights.push({
        title: "Low skill gap: ceiling problem",
        text: `Your average is close to your best. Increase constraint or difficulty if target hit rate is already acceptable.`
      });
    }
  }

  if (fatigue && fatigue.deltaPct < -12) {
    insights.push({
      title: "Fatigue effect detected",
      text: `Final-third performance is ${Math.abs(fatigue.deltaPct).toFixed(1)}% below early-session performance. Shorten sets or add breaks.`
    });
  } else if (fatigue && fatigue.deltaPct > 8) {
    insights.push({
      title: "Slow-start pattern",
      text: `Later performance is better than early performance. Add a structured warm-up before scored drills.`
    });
  }

  if (hit !== null) {
    if (hit >= 80) insights.push({title:"Progressive overload", text:"Target hit rate is high. Increase difficulty, stretch target, or reduce allowed attempts."});
    if (hit <= 35) insights.push({title:"Regression recommended", text:"Target hit rate is low. Simplify the drill and isolate the technical constraint."});
  }
  const plateau = plateauDetector(logs, 8);
  if (plateau && plateau.isPlateau) insights.push({title:"Plateau detected", text:"Performance has flattened. Change constraint, drill format, or intensity rather than repeating identical volume."});
  const over = overtrainingSignal(logs, 8);
  if (over && over.signal === "Risk") insights.push({title:"Possible overtraining / low yield", text:"Recent volume increased without matching performance gain. Reduce volume or increase rest between sets."});

  const dda = dynamicDifficultyAdjustmentForLogs(logs);
  if (dda && !["maintain","collect","unavailable"].includes(dda.state)) insights.push({title:"Dynamic difficulty", text:`${dda.label}: ${dda.reason}`});

  const ladder = difficultyLadderRecommendation(logs);
  if (ladder && ladder.type !== "maintain") insights.push({title:"Difficulty ladder", text: ladder.text});

  if (!insights.length) {
    insights.push({title:"Maintain current structure", text:"No strong bottleneck detected. Continue logging to improve signal quality."});
  }

  const viewInsights = insights.slice(0,4).map(coachingInsightForUI);
  return `<div class="coaching-box"><h3>${escapeHtml(getInsightLanguageSetting() === "friendly" ? "Coaching plan" : "Coaching insights")}</h3>${viewInsights.map(i=>`<div class="insight insight-compact"><strong>${escapeHtml(i.title)}</strong><span class="insight-subtitle">${escapeHtml(i.text)}</span></div>`).join("")}</div>`;
}


function sessionQualityImpact(logs) {
  const high = logs.filter(l=>Number(l.sessionRating||0) >= 4).map(l=>Number(l.normalizedScore||0));
  const low = logs.filter(l=>Number(l.sessionRating||0) > 0 && Number(l.sessionRating||0) <= 2).map(l=>Number(l.normalizedScore||0));
  if (high.length < 2 || low.length < 2) return null;
  const highAvg = avg(high), lowAvg = avg(low);
  const deltaPct = lowAvg ? ((highAvg-lowAvg)/Math.abs(lowAvg))*100 : 0;
  return {highAvg, lowAvg, deltaPct, highN:high.length, lowN:low.length};
}

function optimalSessionLength(logs) {
  const sessionGroups = {};
  logs.forEach(l => {
    const sid = l.sessionId || "unknown";
    if (!sessionGroups[sid]) sessionGroups[sid] = [];
    sessionGroups[sid].push(l);
  });
  const sessions = Object.values(sessionGroups).map(arr => {
    const time = arr.reduce((a,b)=>a+Number(b.timeMinutes||0),0);
    const perf = avg(arr.map(l=>Number(l.normalizedScore||0)));
    return {time, perf};
  }).filter(s=>s.time>0 && Number.isFinite(s.perf));
  if (sessions.length < 4) return null;
  const bands = [
    {label:"<30m", min:0, max:30},
    {label:"30–60m", min:30, max:60},
    {label:"60–90m", min:60, max:90},
    {label:">90m", min:90, max:9999}
  ].map(b => {
    const arr = sessions.filter(s=>s.time>=b.min && s.time<b.max);
    return {...b, n:arr.length, avgPerf:arr.length?avg(arr.map(s=>s.perf)):null};
  }).filter(b=>b.n>0);
  if (!bands.length) return null;
  const best = bands.slice().sort((a,b)=>(b.avgPerf??-999)-(a.avgPerf??-999))[0];
  const corr = correlation(sessions.map(s=>s.time), sessions.map(s=>s.perf));
  return {bands, best, corr};
}

function exerciseTransferEffect(allLogs, targetRid) {
  if (!targetRid) return null;
  const targetLogs = allLogs.filter(l=>l.routineId===targetRid).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  if (targetLogs.length < 4) return null;
  const targetRoutine = routineById(targetRid);
  const targetCategory = targetRoutine?.category;
  const candidates = Object.create(null);
  allLogs.forEach(l => {
    if (l.routineId !== targetRid && l.category && l.category !== targetCategory) {
      const day = localDateKey(l.createdAt);
      if (!candidates[l.category]) candidates[l.category] = {};
      if (!candidates[l.category][day]) candidates[l.category][day] = [];
      candidates[l.category][day].push(Number(l.normalizedScore||0));
    }
  });
  const targetByDay = Object.create(null);
  targetLogs.forEach(l => {
    const day = localDateKey(l.createdAt);
    if (!targetByDay[day]) targetByDay[day] = [];
    targetByDay[day].push(Number(l.normalizedScore||0));
  });
  const results = Object.entries(candidates).map(([cat, byDay]) => {
    const xs=[], ys=[];
    Object.keys(targetByDay).forEach(day => {
      const prev = new Date(day+"T00:00:00");
      prev.setDate(prev.getDate()-1);
      const prevKey = localDateKey(prev);
      if (byDay[prevKey]) {
        xs.push(avg(byDay[prevKey]));
        ys.push(avg(targetByDay[day]));
      }
    });
    return {category:cat, corr:correlation(xs,ys), n:xs.length};
  }).filter(r=>r.corr!==null).sort((a,b)=>Math.abs(b.corr)-Math.abs(a.corr));
  return results[0] || null;
}

function performanceStabilityIndex(logs, windowSize=10) {
  const sampleLogs = Array.isArray(logs) ? analyticsWindow(logs, Math.max(windowSize, Math.min(HEAVY_ANALYTICS_LOG_LIMIT, 500))) : [];
  const cacheKey = memoKeyForLogs("psi", sampleLogs, String(windowSize));
  if (analyticsMemoCache.has(cacheKey)) return analyticsMemoCache.get(cacheKey);
  const vals = sampleLogs.map(l=>Number(l.normalizedScore||0)).filter(v=>Number.isFinite(v));
  if (vals.length < 3) return null;
  const recent = vals.slice(-windowSize);
  const mean = avg(recent);
  let cv = mean ? stdDev(recent) / Math.max(0.1, Math.abs(mean)) : 0;
  cv = Number.isFinite(cv) ? Math.min(3, Math.max(0, cv)) : 3;
  const hitSeries = sampleLogs.slice(-windowSize).map(l => {
    const p = l.performance || "N/A";
    return (p === "On Target" || p === "Above Target") ? 1 : 0;
  });
  const hitVol = hitSeries.length > 1 ? stdDev(hitSeries) : 0;
  const psi = Math.max(0, 100 - (cv*65 + hitVol*35));
  let label = "Stable";
  if (psi < 45) label = "Unstable";
  else if (psi < 70) label = "Watch";
  const result = {psi, cv, hitVol, label, mean, n: recent.length};
  if (analyticsMemoCache.size > 80) analyticsMemoCache.clear();
  analyticsMemoCache.set(cacheKey, result);
  return result;
}

function renderPerformanceStability(logs) {
  const psi = performanceStabilityIndex(logs, 10);
  if (!psi) return `<div class="psi-card psi-watch"><strong>Consistency Rating ${statHelpButton("psi")}</strong><br>Not enough data/variation yet.</div>`;
  const cls = psi.psi >= 70 ? "psi-good" : psi.psi >= 45 ? "psi-watch" : "psi-risk";
  return `<div class="psi-card ${cls}">
    <strong>Consistency Rating ${statHelpButton("psi")}: ${psi.psi.toFixed(0)}/100 — ${escapeHtml(psi.label)}</strong><br>
    <span class="muted">CV ${(psi.cv*100).toFixed(1)}% · hit-rate volatility ${(psi.hitVol*100).toFixed(1)}% · ${psi.n} recent logs.</span>
  </div>`;
}

function renderFatigueSlope(logs) {
  const f = cachedFatigueSlope(logs);
  if (!f) return `<div class="psi-card psi-watch"><strong>Stamina drop-off ${statHelpButton("fatigueSlope")}</strong><br>Not enough data/variation yet.</div>`;
  const cls = f.slope < -0.25 ? "psi-risk" : f.slope > 0.25 ? "psi-good" : "psi-watch";
  const direction = f.slope < -0.25 ? "fatigue drag" : f.slope > 0.25 ? "slow-start / improves later" : "flat";
  return `<div class="psi-card ${cls}">
    <strong>Stamina drop-off ${statHelpButton("fatigueSlope")}: ${f.slope.toFixed(2)} pts/min — ${direction}</strong><br>
    <span class="muted">Correlation ${corrText(f.corr)} over ${f.n} logs.</span>
  </div>`;
}

function difficultyLadderRecommendation(logs) {
  if (!logs.length) return null;
  const hit = targetHitRate(logs);
  const drift = performanceDrift(logs, Math.min(10, Math.max(5, Math.floor(logs.length/2))));
  const gap = skillGapIndex(logs);
  const vals = logs.map(l=>Number(l.normalizedScore||0));
  const mean = avg(vals);
  const psi = performanceStabilityIndex(logs, 10);
  if (hit !== null && hit >= 80 && gap !== null && gap < Math.max(5, mean*0.10) && drift && drift.deltaPct > 5) {
    return {type:"increase", text:"Increase difficulty: hit rate is high, skill gap is tight, and recent drift is positive. Suggested new target: +5 to +10 points or harder constraint."};
  }
  if (hit !== null && hit <= 35) {
    return {type:"reduce", text:"Reduce difficulty: hit rate is low. Simplify the drill or lower the target until you reach the learning zone."};
  }
  if (psi && psi.psi < 45) {
    return {type:"stabilize", text:"Stabilize before raising target: performance is volatile. Repeat the same setup until Consistency improves."};
  }
  if (drift && drift.deltaPct < -10) {
    return {type:"recover", text:"Do not increase difficulty: recent performance drift is negative. Consider a lighter session or technique block."};
  }
  return {type:"maintain", text:"Maintain current difficulty: no strong signal to increase or reduce yet."};
}

function renderDifficultyLadder(logs) {
  const rec = difficultyLadderRecommendation(logs);
  if (!rec) return "";
  return `<div class="ladder-action"><strong>Difficulty ladder ${statHelpButton("difficultyLadder")}:</strong> ${escapeHtml(rec.text)}</div>`;
}

function dateFromKey(value) {
  return localDateFromKey(value) || new Date(value);
}
function metricsForLogs(logs) {
  const vals = logs.map(l=>Number(l.normalizedScore||0));
  const totalTime = logs.reduce((a,b)=>a+Number(b.timeMinutes||0),0);
  const hit = targetHitRate(logs);
  const psi = performanceStabilityIndex(logs, 10);
  return {
    logs: logs.length,
    time: totalTime,
    avg: vals.length ? avg(vals) : null,
    hit,
    psi: psi ? psi.psi : null,
    best: vals.length ? safeMax(vals, null) : null
  };
}
function deltaFmt(a,b, suffix="") {
  if (a === null || a === undefined || b === null || b === undefined) return "N/A";
  const d = a-b;
  return `${d>=0?"+":""}${d.toFixed(1)}${suffix}`;
}
function renderABComparison() {
  const out = $("compareOutput");
  if (!out) return;
  const mode = $("compareToggle")?.value || "off";
  if (mode === "off") { out.innerHTML = ""; return; }

  let aStart, aEnd, bStart, bEnd;
  const today = new Date(); today.setHours(0,0,0,0);
  if (mode === "last4" || mode === "last2") {
    const weeks = mode === "last4" ? 4 : 2;
    aEnd = new Date(today); aEnd.setDate(aEnd.getDate()+1);
    aStart = new Date(today); aStart.setDate(aStart.getDate()-(weeks*7)+1);
    bEnd = new Date(aStart);
    bStart = new Date(bEnd); bStart.setDate(bStart.getDate()-(weeks*7));
  } else {
    if (!$("compareAStart").value || !$("compareAEnd").value || !$("compareBStart").value || !$("compareBEnd").value) {
      out.innerHTML = `<p class="muted">Select all custom dates to compare.</p>`;
      return;
    }
    aStart = dateFromKey($("compareAStart").value);
    aEnd = dateFromKey($("compareAEnd").value); aEnd.setDate(aEnd.getDate()+1);
    bStart = dateFromKey($("compareBStart").value);
    bEnd = dateFromKey($("compareBEnd").value); bEnd.setDate(bEnd.getDate()+1);
  }

  const logsA = logsInRange(data.logs || [], aStart, aEnd);
  const logsB = logsInRange(data.logs || [], bStart, bEnd);
  const A = metricsForLogs(logsA), B = metricsForLogs(logsB);

  out.innerHTML = `<table class="compare-table">
    <thead><tr><th>KPI</th><th>Period A</th><th>Period B</th><th>Delta A-B</th></tr></thead>
    <tbody>
      <tr><td>Logs</td><td>${A.logs}</td><td>${B.logs}</td><td>${A.logs-B.logs}</td></tr>
      <tr><td>Training time ${statHelpButton("trainingTime")}</td><td>${formatDurationHuman(A.time)}</td><td>${formatDurationHuman(B.time)}</td><td>${deltaFmt(A.time,B.time,"m")}</td></tr>
      <tr><td>Average performance ${statHelpButton("averagePerformance")}</td><td>${A.avg===null?"N/A":A.avg.toFixed(1)}</td><td>${B.avg===null?"N/A":B.avg.toFixed(1)}</td><td>${deltaFmt(A.avg,B.avg)}</td></tr>
      <tr><td>Target hit rate ${statHelpButton("targetHitRate")}</td><td>${A.hit===null?"N/A":A.hit.toFixed(1)+"%"}</td><td>${B.hit===null?"N/A":B.hit.toFixed(1)+"%"}</td><td>${deltaFmt(A.hit,B.hit," pts")}</td></tr>
      <tr><td>Consistency ${statHelpButton("psi")}</td><td>${A.psi===null?"N/A":A.psi.toFixed(0)}</td><td>${B.psi===null?"N/A":B.psi.toFixed(0)}</td><td>${deltaFmt(A.psi,B.psi)}</td></tr>
      <tr><td>Best score ${statHelpButton("bestScore")}</td><td>${A.best===null?"N/A":A.best.toFixed(1)}</td><td>${B.best===null?"N/A":B.best.toFixed(1)}</td><td>${deltaFmt(A.best,B.best)}</td></tr>
    </tbody>
  </table>`;
}


function renderSecondOrderAnalytics(logs, selectedRid, rollingWindow=10) {
  if (!logs.length) return "";
  const drift = performanceDrift(logs, Math.max(5, rollingWindow));
  const quality = sessionQualityImpact(logs);
  const optimal = optimalSessionLength(logs);
  const velocity = progressVelocity(logs, Math.max(5, rollingWindow));
  const plateau = plateauDetector(logs, Math.max(5, rollingWindow));
  const overtraining = overtrainingSignal(logs, Math.max(5, rollingWindow));
  const transfer = selectedRid ? exerciseTransferEffect(data.logs, selectedRid) : null;

  const cards = [];
  if (drift) { const ev=evidenceStrength(Math.max(rollingWindow, logs.length)); cards.push({cls: drift.deltaPct < -7 ? "signal-risk" : drift.deltaPct > 7 ? "signal-good" : "signal-watch", title:"Performance drift", text:`Recent ${drift.recent.toFixed(2)} vs prior ${drift.prior.toFixed(2)} (${drift.deltaPct>=0?"+":""}${dampenByEvidence(drift.deltaPct, logs.length).toFixed(1)}% evidence-adjusted). ${ev.label}.`}); }
  if (quality) { const ev=evidenceStrength(logs.length); cards.push({cls: quality.deltaPct > 10 ? "signal-good" : "signal-watch", title:"Session quality impact", text:`High-rated sessions average ${quality.highAvg.toFixed(2)} vs low-rated ${quality.lowAvg.toFixed(2)} (${quality.deltaPct>=0?"+":""}${dampenByEvidence(quality.deltaPct, logs.length).toFixed(1)}% evidence-adjusted). ${ev.label}.`}); }
  if (optimal) cards.push({cls:"signal-watch", title:"Optimal session length", text:`Best observed band: ${optimal.best.label} (${optimal.best.avgPerf.toFixed(2)} avg). Treat as directional; short sessions can be selection-biased. Correlation: ${corrText(optimal.corr)}.`});
  if (velocity) { const ev=evidenceStrength(velocity.n); cards.push({cls: velocity.slope > .5 ? "signal-good" : velocity.slope < -.5 ? "signal-risk" : "signal-watch", title:"Progress velocity", text:`Evidence-adjusted slope over last ${velocity.n}: ${dampenByEvidence(velocity.slope, velocity.n).toFixed(2)} per log (${velocity.label}). ${ev.label}.`}); }
  if (plateau) { const ev=evidenceStrength(logs.length); cards.push({cls: plateau.isPlateau ? "signal-risk" : "signal-watch", title:"Plateau detector", text: plateau.isPlateau ? `Possible plateau: only ${dampenByEvidence(plateau.deltaPct, logs.length).toFixed(1)}% evidence-adjusted change. ${ev.label}.` : `No confirmed plateau: ${plateau.deltaPct>=0?"+":""}${dampenByEvidence(plateau.deltaPct, logs.length).toFixed(1)}% evidence-adjusted change. ${ev.label}.`}); }
  if (overtraining) cards.push({cls: overtraining.signal==="Risk" ? "signal-risk" : "signal-good", title:"Overtraining signal", text:`Volume ${overtraining.volumeDelta>=0?"+":""}${overtraining.volumeDelta.toFixed(1)}%, performance ${overtraining.perfDelta>=0?"+":""}${overtraining.perfDelta.toFixed(1)}% → ${overtraining.signal}.`});
  if (transfer) cards.push({cls: transfer.corr > .35 ? "signal-good" : transfer.corr < -.35 ? "signal-risk" : "signal-watch", title:"Exercise transfer effect", text:`Previous-day ${transfer.category} vs selected exercise: ${corrText(transfer.corr)} over ${transfer.n} paired days. ${evidenceStrength(transfer.n).label}.`});

  if (!cards.length) return `<h3>${htmlText(uiLabel("secondOrderAnalytics"))} ${statHelpButton("performanceDrift")}</h3><p class="muted">More logs are needed for drift, quality impact, optimal session length, transfer, plateau, and overtraining diagnostics.</p>`;
  return `<h3>${htmlText(uiLabel("secondOrderAnalytics"))} ${statHelpButton("performanceDrift")}</h3><div class="diagnostic-grid">${cards.map(c=>`<div class="diagnostic-card ${c.cls}"><strong>${escapeHtml(c.title)}</strong>${escapeHtml(c.text)}</div>`).join("")}</div>`;
}


function targetHitRateCurrentTarget(logs) {
  const evaluated = logs.filter(l => routineById(l.routineId));
  if (!evaluated.length) return null;
  const hits = evaluated.filter(l => {
    const perf = currentTargetPerformance(l);
    return perf === "On Target" || perf === "Above Target";
  }).length;
  return hits / evaluated.length * 100;
}
function renderTargetProfileSummary(logs) {
  const groups = Object.create(null);
  logs.forEach(l => {
    const label = getTargetProfileLabel(l);
    if (!groups[label]) groups[label] = [];
    groups[label].push(l);
  });
  const entries = Object.entries(groups);
  if (entries.length <= 1) return "";
  return `<div class="analytics-note"><strong>Target versions:</strong>${entries.map(([label, arr]) => {
    const hr = targetHitRate(arr);
    return `<span class="target-profile-badge">${escapeHtml(label)} · ${arr.length} logs · hit rate ${hr === null ? "N/A" : hr.toFixed(1)+"%"}</span>`;
  }).join("")}</div>`;
}

function renderAdvancedAnalytics(logs, rollingWindow, benchmarkWindow) {
  const vals = logs.map(l => Number(l.normalizedScore || 0));
  const durations = logs.map(l => Number(l.timeMinutes || 0));
  const ratings = logs.map(l => Number(l.sessionRating || 0));
  const hit = targetHitRate(logs);
  const st = streaks(logs);
  const corrTime = correlation(durations, vals);
  const corrRating = correlation(ratings, vals);

  return `<h3>Advanced analytics</h3>
    <div class="stats-grid">
      <div class="stat-card"><span>${kpiTitle("Momentum", "progressVelocity")}</span><div class="value">${escapeHtml(movingTrend(vals, rollingWindow))}</div></div>
      <div class="stat-card"><span>Hit rate at-time target ${statHelpButton("targetHitRate")}</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div><div class="stat-card"><span>Hit rate current target</span><div class="value">${targetHitRateCurrentTarget(logs) === null ? "N/A" : targetHitRateCurrentTarget(logs).toFixed(1)+"%"}</div></div>
      <div class="stat-card"><span>${kpiTitle("Current streak", "kpiStreak")}</span><div class="value">${st.current}d</div></div>
      <div class="stat-card"><span>Best streak</span><div class="value">${st.best}d</div></div>
      <div class="stat-card"><span>Duration correlation</span><div class="value">${escapeHtml(corrText(corrTime))}</div></div>
      <div class="stat-card"><span>Rating correlation</span><div class="value">${escapeHtml(corrText(corrRating))}</div></div>
    </div>
    <div class="analytics-note"><strong>Personal benchmark:</strong> ${escapeHtml(benchmarkText(vals, benchmarkWindow))}</div>`;
}
function renderExerciseProgression(logs, rollingWindow=5, benchmarkWindow=10) {
  if (!logs.length) return `<div class="empty-state"><h3>Routine progression</h3><p>No logs for this exercise yet. Log it once to start building a routine trend.</p><button class="primary" data-action="switch-tab" data-tab="practice">Go to Practice</button></div>`;
  const vals = logs.map(l => Number(l.normalizedScore || 0));
  const last5 = vals.slice(-5);
  const best = safeMax(vals, 0);
  const latest = vals[vals.length - 1];
  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  const hit = targetHitRate(logs);
  const suggestion = progressionSuggestion(vals, hit);
  const ceilingGap = best - avg(vals);
  const rolling = rollingAverage(vals, rollingWindow);

  return `<h3>Routine progression</h3><div class="stats-grid">
    <div class="stat-card"><span>Latest</span><div class="value">${latest.toFixed(2)}</div></div>
    <div class="stat-card"><span>Average ${statHelpButton("avgPerformance")}</span><div class="value">${avg(vals).toFixed(2)}</div></div>
    <div class="stat-card"><span>Best / ceiling</span><div class="value">${best.toFixed(2)}</div></div>
    <div class="stat-card"><span>${kpiTitle("Consistency", "psi")}</span><div class="value">${stdDev(vals).toFixed(2)}</div></div>
    <div class="stat-card"><span>Ceiling gap</span><div class="value">${ceilingGap.toFixed(2)}</div></div>
    <div class="stat-card"><span>${kpiTitle("Target hit rate", "targetHitRate")}</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div>
  </div>
  <div class="trend">${escapeHtml(movingTrend(vals, rollingWindow))}</div>
  <div class="analytics-note"><strong>Benchmark:</strong> ${escapeHtml(benchmarkText(vals, benchmarkWindow))}<br><strong>Progression suggestion:</strong> ${escapeHtml(suggestion)}</div>
  ${renderTargetUpgradeButton(logs[0]?.routineId)}${renderChart(logs)}
  ${renderRollingChart(logs, rolling)}
  <table class="history-table"><thead><tr><th>Date</th><th>Score</th><th>Normalized</th><th>Performance</th><th>Target version</th><th>Time</th><th>Actions</th></tr></thead><tbody>${logs.slice(-20).reverse().map(l => renderLogRow(l)).join("")}</tbody></table>`;
}

function renderDateLogRow(l) {
  return `<tr data-log-row-id="${attrText(l.id)}"><td>${safeTimeString(l.createdAt, {hour:"2-digit", minute:"2-digit"})}</td><td>${escapeHtml(getPlanName(l))}</td><td>${escapeHtml(getRoutineName(l))}</td><td>${escapeHtml(l.category || "")}</td><td>${displayScore(l)}</td><td>${escapeHtml(l.performance || "N/A")}</td><td>${escapeHtml(getTargetProfileLabel(l))}</td><td>${formatDurationHuman(l.timeMinutes)}</td><td><button class="secondary" data-action="open-log-edit" data-id="${attrText(l.id)}">Edit</button> <button class="danger" data-action="delete-log" data-id="${attrText(l.id)}">Delete</button></td></tr>`;
}
function renderSessionLogRow(l) {
  return `<tr data-log-row-id="${attrText(l.id)}"><td>${escapeHtml(getRoutineName(l))}</td><td>${escapeHtml(l.category || "")}</td><td>${displayScore(l)}</td><td>${escapeHtml(l.performance || "N/A")}</td><td>${escapeHtml(getTargetProfileLabel(l))}</td><td>${formatDurationHuman(l.timeMinutes)}</td><td><button class="secondary" data-action="open-log-edit" data-id="${attrText(l.id)}">Edit</button> <button class="danger" data-action="delete-log" data-id="${attrText(l.id)}">Delete</button></td></tr>`;
}
function renderEditLogForm(l) {
  return `<div class="log-edit" data-log-edit-id="${attrText(l.id)}">
    <div class="log-edit-summary">
      <strong>${escapeHtml(getRoutineName(l))}</strong>
      <span class="muted">${escapeHtml(getPlanName(l))} · ${escapeHtml(l.performance || "N/A")}</span>
    </div>
    <div class="log-edit-grid">
      <div><label>Date/time</label><input class="edit-createdAt" type="datetime-local" value="${attrText(toDateTimeLocal(l.createdAt))}"></div>
      ${logUsesSideSplit(l) ? `<div><label>Left side score</label><input class="edit-left-side-score" type="number" step="0.01" value="${numAttr(getLogLeftSideScore(l) || "")}"></div><div><label>Right side score</label><input class="edit-right-side-score" type="number" step="0.01" value="${numAttr(getLogRightSideScore(l) || "")}"></div><div><label>Combined score</label><input class="edit-score" type="number" step="0.01" value="${numAttr(effectiveLogScore(l))}" readonly></div><div><label>Attempt mode</label><select class="edit-attempt-mode"><option value="shared" ${getLogAttemptMode(l) === "shared" ? "selected" : ""}>Shared total attempts</option><option value="per_side" ${getLogAttemptMode(l) === "per_side" ? "selected" : ""}>Attempts per side</option></select></div>` : `<div><label>Score</label><input class="edit-score" type="number" step="0.01" value="${numAttr(l.score)}"></div>`}
      <div><label>${logUsesSideSplit(l) ? "Attempts" : "Attempts"}</label><input class="edit-attempts" type="number" step="1" value="${numAttr(l.attempts || "")}"></div>
      <div><label>Time minutes</label><input class="edit-time" type="number" step="0.1" value="${numAttr(l.timeMinutes || "")}"></div>
      <div><label>Venue / table</label><select class="edit-venue">${renderEditTableOptions(l.tableId, l.venueTable)}</select></div>
      ${l.scoring === "progressive_completion" ? `<div><label>Total units</label><input class="edit-total-units" type="number" step="1" value="${numAttr(l.totalUnitsAtLog || l.totalUnits || "")}"></div><div><label>Best attempt</label><input class="edit-best" type="number" step="0.01" value="${numAttr(l.bestAttempt || "")}"></div><div><label>Completions</label><input class="edit-completions" type="number" step="1" value="${numAttr(l.completionCount || "")}"></div><div><label>Highest break</label><input class="edit-break" type="number" step="1" value="${numAttr(l.highestBreak || "")}"></div>` : ""}
      <div><label>Rating</label><input class="edit-rating" type="number" min="1" max="5" step="1" value="${numAttr(l.sessionRating || "")}"></div>
      <div><label>Category</label><select class="edit-category">${editCategoryOptions(l.category)}</select></div>
      <div><label>Tags</label><input class="edit-tags" value="${attrText(l.sessionTags || "")}"></div>
    </div>
    <label>Notes</label><textarea class="edit-notes" rows="3">${escapeHtml(l.notes || "")}</textarea>
  </div>`;
}
function toDateTimeLocal(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fallbackDateKey(d) {
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function safeDateString(value, options) {
  if (!value) return "Unknown date";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "Invalid date";
  try { return d.toLocaleDateString(undefined, options); } catch(e) { return fallbackDateKey(d); }
}
function safeTimeString(value, options) {
  if (!value) return "Unknown time";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "Invalid time";
  try { return d.toLocaleTimeString(undefined, options); } catch(e) { return `${fallbackDateKey(d)} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
}
function openLogEditModal(id) {
  const log = (data.logs || []).find(l => l.id === id);
  if (!log) return alert("Log not found.");
  const modal = $("logEditModal");
  const body = $("logEditModalBody");
  if (!modal || !body) return;
  modal.dataset.logId = id;
  body.innerHTML = renderEditLogForm(log);
  const leftField = body.querySelector(".edit-left-side-score");
  const rightField = body.querySelector(".edit-right-side-score");
  const combinedField = body.querySelector(".edit-score[readonly]");
  if (leftField && rightField && combinedField) {
    const refreshCombined = () => { combinedField.value = computeSideCombinedScore(leftField.value || 0, rightField.value || 0); };
    leftField.addEventListener("input", refreshCombined);
    rightField.addEventListener("input", refreshCombined);
    refreshCombined();
  }
  modal.classList.remove("hidden");
  document.body?.classList?.add("modal-open");
  bindModalFocusTrap(modal);
  setTimeout(() => body.querySelector("input,select,textarea")?.focus(), 80);
}
let activeModalFocusTrap = null;
function bindModalFocusTrap(modal) {
  if (!modal || modal.dataset.focusTrapBound === "1") return;
  const handler = event => {
    if (event.key !== "Tab" || modal.classList.contains("hidden")) return;
    const focusable = Array.from(modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled && el.offsetParent !== null);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  modal.addEventListener("keydown", handler);
  modal.dataset.focusTrapBound = "1";
  activeModalFocusTrap = handler;
}
function unbindModalFocusTrap(modal) {
  if (!modal || !activeModalFocusTrap) return;
  modal.removeEventListener("keydown", activeModalFocusTrap);
  modal.dataset.focusTrapBound = "";
  activeModalFocusTrap = null;
}
function closeLogEditModal(event) {
  if (event && event.target && event.target.id !== "logEditModal") return;
  const modal = $("logEditModal");
  if (!modal) return;
  modal.classList.add("hidden");
  document.body?.classList?.remove("modal-open");
  unbindModalFocusTrap(modal);
  modal.dataset.logId = "";
  const body = $("logEditModalBody");
  if (body) body.innerHTML = "";
}
async function saveEditedLogFromModal() {
  const modal = $("logEditModal");
  const id = modal?.dataset?.logId || "";
  const form = modal?.querySelector?.(".log-edit");
  const btn = modal?.querySelector?.('[data-action="save-log-edit"], .save-log-edit-btn, button[type="submit"]');
  if (!id || !form) return validationNotice("Edit form not found.");
  if (modal?.dataset?.saving === "1") return;
  if (modal) modal.dataset.saving = "1";
  if (btn) btn.disabled = true;
  try {
    await saveEditedLog(id, form);
    closeLogEditModal();
  } finally {
    if (modal) modal.dataset.saving = "";
    if (btn) btn.disabled = false;
  }
}
function showEditLog(source) {
  if (typeof source === "string") return openLogEditModal(source);
  const card = source?.closest?.(".history-card");
  const row = source?.closest?.("tr");
  const id = card?.querySelector?.(".log-edit")?.dataset?.logEditId || row?.dataset?.logRowId || "";
  if (id) openLogEditModal(id);
}
async function saveEditedLogFromButton(button, id) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    const form = button?.closest?.(".log-edit");
    await saveEditedLog(id, form);
  } finally {
    if (button) button.disabled = false;
  }
}
async function saveEditedLog(id, formEl) {
  const idx = data.logs.findIndex(l => l.id === id);
  if (idx < 0) return;
  const l = structuredCloneSafe(data.logs[idx]);
  const routine = routineById(l.routineId) || makeRoutineSnapshotFromLog(l);
  const form = formEl || document.querySelector(`.log-edit[data-log-edit-id="${cssEscapeSafe(id)}"]`);
  if (!form) return validationNotice("Edit form not found.");
  const field = cls => form.querySelector(`.${cls}`);
  const editedDate = new Date(field("edit-createdAt")?.value || l.createdAt);
  if (Number.isNaN(editedDate.getTime())) return validationNotice("Invalid date/time.");
  l.createdAt = editedDate.toISOString();
  if (logUsesSideSplit(l) || field("edit-left-side-score") || field("edit-right-side-score")) {
    const left = Number(field("edit-left-side-score")?.value || 0);
    const right = Number(field("edit-right-side-score")?.value || 0);
    if (Number.isNaN(left) || Number.isNaN(right)) return validationNotice("Enter valid left and right side scores.");
    if (left < 0 || right < 0) return validationNotice("Left and right side scores cannot be negative.");
    l.leftSideScore = left;
    l.rightSideScore = right;
    l.sideMode = normalizeSideMode(l.sideMode || "left_right");
    l.sideSplitEnabled = true;
    l.attemptMode = normalizeAttemptMode(field("edit-attempt-mode")?.value || l.attemptMode || "shared");
    l.sideScores = {left, right};
    l.score = computeSideCombinedScore(left, right);
  } else {
    l.score = Number(field("edit-score")?.value || 0);
    if (Number.isNaN(l.score)) return validationNotice("Enter a valid score.");
    if (l.scoring !== "points" && l.score < 0) return validationNotice("Score cannot be negative.");
  }
  l.attempts = Number(field("edit-attempts")?.value || 0) || "";
  if (Number(l.attempts || 0) < 0) return validationNotice("Attempts cannot be negative.");
  if (l.scoring === "success_rate" || l.scoring === "progressive_completion") {
    const attemptCheck = validateWholeNumberField(l.attempts, "Attempts", {required:l.scoring === "success_rate", min:l.scoring === "success_rate" ? 1 : 0});
    if (attemptCheck.error) return validationNotice(attemptCheck.error);
    l.attempts = attemptCheck.value || "";
  }
  if (l.scoring === "success_rate") {
    if (!logUsesSideSplit(l)) {
      const madeCheck = validateWholeNumberField(l.score, "Score", {required:true, min:0, max:Number(l.attempts || 0)});
      if (madeCheck.error) return validationNotice(madeCheck.error);
      l.score = madeCheck.value;
    } else {
      const leftCheck = validateWholeNumberField(l.leftSideScore, "Left side score", {required:true, min:0});
      const rightCheck = validateWholeNumberField(l.rightSideScore, "Right side score", {required:true, min:0});
      if (leftCheck.error) return validationNotice(leftCheck.error);
      if (rightCheck.error) return validationNotice(rightCheck.error);
      l.leftSideScore = leftCheck.value;
      l.rightSideScore = rightCheck.value;
      l.score = computeSideCombinedScore(l.leftSideScore, l.rightSideScore);
    }
  }
  if (!logUsesSideSplit(l) && l.scoring === "success_rate" && Number(l.score || 0) > Number(l.attempts || 0)) return validationNotice("Score cannot exceed attempts.");
  l.effectiveAttempts = effectiveLogAttempts(l);
  if (logUsesSideSplit(l) && l.scoring === "success_rate") {
    const sideError = validateSideSuccessRateInputs({left:l.leftSideScore, right:l.rightSideScore, attempts:l.attempts, attemptMode:l.attemptMode});
    if (sideError) return validationNotice(sideError);
  }
  l.timeMinutes = Number(field("edit-time")?.value || 0);
  if (Number.isNaN(l.timeMinutes) || l.timeMinutes < 0) return validationNotice("Time cannot be negative.");
  if (l.timeMinutes > MAX_SINGLE_DRILL_MINUTES) {
    l.timeMinutes = MAX_SINGLE_DRILL_MINUTES;
    notifyUser?.("Edited duration capped to 240 minutes to protect analytics.", "info");
  }
  l.timeMinutes = roundStoredMinutes(l.timeMinutes);
  l.sessionRating = Number(field("edit-rating")?.value || 0) || "";
  l.category = field("edit-category")?.value || l.category || "uncategorized";
  l.sessionTags = field("edit-tags")?.value || "";
  if (l.scoring === "progressive_completion") {
    const totalUnitsInput = field("edit-total-units")?.value;
    if (totalUnitsInput !== undefined && totalUnitsInput !== "") {
      const totalCheck = validateWholeNumberField(totalUnitsInput, "Total units", {required:false, min:0});
      if (totalCheck.error) return validationNotice(totalCheck.error);
      l.totalUnitsAtLog = totalCheck.value ?? "";
      l.totalUnits = (l.totalUnitsAtLog ?? l.totalUnits ?? "");
    }
    const totalUnits = Number(l.totalUnitsAtLog ?? l.totalUnits ?? routine?.totalUnits ?? 0);
    if (totalUnits > 0 && Number(l.score || 0) > totalUnits) return validationNotice(`Score cannot exceed completion size (${totalUnits}).`);
    if (field("edit-best")) {
      const bestCheck = validateWholeNumberField(field("edit-best").value || "", "Best attempt", {required:false, min:0, max:Number.isFinite(totalUnits) ? totalUnits : null});
      if (bestCheck.error) return validationNotice(bestCheck.error);
      l.bestAttempt = bestCheck.value ?? "";
    }
    if (field("edit-completions")) {
      const editAttemptMax = Number.isFinite(Number(l.attempts)) ? Number(l.attempts) : null;
      const completionCheck = validateWholeNumberField(field("edit-completions").value || "", "Completions", {required:false, min:0, max:editAttemptMax});
      if (completionCheck.error) return validationNotice(completionCheck.error);
      l.completionCount = completionCheck.value ?? "";
    }
    if (field("edit-break")) {
      const breakCheck = validateWholeNumberField(field("edit-break").value || "", "Highest break", {required:false, min:0, max:Number.isFinite(totalUnits) ? totalUnits : null});
      if (breakCheck.error) return validationNotice(breakCheck.error);
      l.highestBreak = breakCheck.value ?? "";
    }
  }
  updateTagHistoryFromInput(l.sessionTags);
  l.notes = field("edit-notes")?.value || "";
  const venue = field("edit-venue");
  if (venue) {
    l.tableId = venue.value || "";
    l.venueTable = getTableName(l.tableId);
    l.venueTableSnapshot = getTableName(l.tableId);
  }
  if (l.targetProfileId && routine?.targetHistory && !routine.targetHistory.some(p => p.id === l.targetProfileId)) {
    l.targetProfileId = "";
  }
  l.normalizedScore = normalizeScore(l);
  l.performance = classifyPerformance(l, routine);
  data.logs = data.logs.map(log => log.id === id ? l : log);
  const persisted = await persistLogDelta(l, "saveEditedLog log put");
  if (!persisted && !indexedDBUnavailable) notifyUser("Edited log saved locally, but IndexedDB sync is pending.", "warn");
  saveData({render:"logEdit", idbSync:"skip", allowReadOnlyCleanup:true});
}
function makeRoutineSnapshotFromLog(l) {
  return {
    id: l.routineId || "",
    name: l.routineNameSnapshot || l.routineName || "Deleted exercise",
    scoring: l.scoring,
    target: l.targetAtLog || "",
    stretchTarget: l.stretchTargetAtLog || "",
    totalUnits: l.totalUnitsAtLog || l.totalUnits || "",
    attemptsPerSession: l.attemptsPerSessionAtLog || l.attempts || "",
    sideMode: normalizeSideMode(l.sideMode || l.sideSplitMode || l.sideSplit || "none"),
    attemptMode: getLogAttemptMode(l),
    category: l.category || "uncategorized",
    folder: l.folder || "Unfiled",
    subfolder: l.subfolder || "General"
  };
}
function deleteLog(id) {
  if (!allowRateLimitedOperation("deleteLog", 20, 60000, "Too many delete actions. Wait a moment and try again.")) return;
  return confirmDeleteAction("this session log", async () => {
    const previousLogs = data.logs || [];
    const target = previousLogs.find(l => l.id === id);
    purgePendingIndexedDBDelta("log", id);
    const deleted = await deleteLogDelta(id, "deleteLog log delete");
    if (!deleted && !storageReadOnlyMode) {
      if (target) data.logs = previousLogs;
      notifyUser("Could not delete this log from storage. Nothing was removed.", "warn");
      return;
    }
    data.logs = previousLogs.filter(l => l.id !== id);
    saveData({render:"logEdit", idbSync:"skip", allowReadOnlyCleanup:true});
  });
}

function renderDateView(logs) {
  if (!logs.length) return "<p>No exercises logged for this view.</p>";
  const sourceLogs = Array.isArray(logs) ? logs : [];
  const totalTime = sourceLogs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  const types = Object.create(null);
  sourceLogs.forEach(l => { types[l.category || "uncategorized"] = (types[l.category || "uncategorized"] || 0) + 1; });
  const hit = targetHitRate(sourceLogs);
  const activeLimit = Math.max(HISTORY_RENDER_ROW_LIMIT, Number(historyRenderRowLimit || HISTORY_RENDER_ROW_LIMIT));
  const displayLogs = sourceLogs.length > activeLimit ? sourceLogs.slice(-activeLimit) : sourceLogs;
  const rowLimitNote = sourceLogs.length > displayLogs.length
    ? `<div class="analytics-note muted">Showing latest ${displayLogs.length} of ${sourceLogs.length} logs in this table. Use filters or exports for full history. <button type="button" class="secondary small" data-action="show-more-history">Show more</button></div>`
    : "";
  return `<div class="stats-grid">
    <div class="stat-card"><span>Exercises ${statHelpButton("exercisesCompleted")}</span><div class="value">${sourceLogs.length}</div></div>
    <div class="stat-card"><span>Total time ${statHelpButton("totalTrainingTime")}</span><div class="value">${formatDurationHuman(totalTime)}</div></div>
    <div class="stat-card"><span>${kpiTitle("Target hit rate", "targetHitRate")}</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div>
  </div><p>${Object.entries(types).map(([k,v]) => `<span class="badge">${escapeHtml(k)}: ${v}</span>`).join("")}</p>
  ${progressiveStatsForLogs(sourceLogs) ? `<div class="analytics-note"><strong>Progressive completion:</strong><span class="pc-kpi">Avg completion ${progressiveStatsForLogs(sourceLogs).avgCompletion.toFixed(1)}%</span><span class="pc-kpi">Best attempt ${progressiveStatsForLogs(sourceLogs).bestAttempt}</span><span class="pc-kpi">Completions ${progressiveStatsForLogs(sourceLogs).completionCount}</span><span class="pc-kpi">Highest break ${progressiveStatsForLogs(sourceLogs).highestBreak || "N/A"}</span></div>` : ""}
  ${renderTargetProfileSummary(sourceLogs)}
  ${rowLimitNote}
  <div class="history-table-scroll" role="region" aria-label="Log history table" tabindex="0"><table class="history-table"><thead><tr><th>Time</th><th>Session</th><th>Exercise</th><th>Type</th><th>Score</th><th>Performance</th><th>Target version</th><th>Duration</th><th>Actions</th></tr></thead><tbody>${displayLogs.map(l => renderDateLogRow(l)).join("")}</tbody></table></div>`;
}
function renderPracticeTodayCommand() {
  const box = $("practiceTodayCommand");
  if (!box) return;
  const today = localDateKey();
  const logs = (data.logs || []).filter(l => sameDate(l, today));
  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  const hit = targetHitRate(logs);
  const resume = normalizePersistedSessionDraft(getPersistedActiveSession());
  const nextRoutine = resume ? routineById(resume.routineIds?.[resume.index]) : null;
  const recentPeriodization = safeCall("practice periodization summary", () => adaptiveSessionPeriodizationSummary?.(data.logs || []), null);
  const theme = recentPeriodization?.nextSessionBias || recentPeriodization?.weeklyTheme || "Start with a short calibration block.";
  box.innerHTML = `<div class="practice-command-grid">
    <div>
      <p class="eyebrow">Today</p>
      <h2>${logs.length ? `${logs.length} logged exercise${logs.length===1?"":"s"}` : "No logs yet today"}</h2>
      <p class="muted">${formatDurationHuman(totalTime)} logged${hit===null ? "" : ` · ${hit.toFixed(0)}% target hit rate`}</p>
      <p class="tiny muted">Suggested focus: ${escapeHtml(String(theme))}</p>
    </div>
    <div class="practice-command-actions">
      ${resume ? `<div class="resume-inline"><strong>Resume active session</strong><span>${Number(resume.index||0)+1}/${resume.routineIds?.length || 0}: ${escapeHtml(nextRoutine?.name || "Missing exercise")}</span></div><button type="button" data-action="resume-session">Resume</button>` : `<button type="button" data-action="practice-main-tab" data-practice-tab="smart">Start Smart Session</button>`}
      <button type="button" class="secondary" data-action="practice-main-tab" data-practice-tab="regular">Log Single Drill</button>
      <button type="button" class="secondary" data-action="open-today-panel">Full Today View</button>
    </div>
  </div>`;
}

function renderToday() {
  const today = localDateKey();
  const logs = data.logs.filter(l => sameDate(l, today)).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!logs.length) { $("todaySummary").innerHTML = "<p>No training logged today yet.</p>"; return; }

  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  const byType = {}, bySession = {};
  logs.forEach(l => {
    byType[l.category || "uncategorized"] = (byType[l.category || "uncategorized"] || 0) + 1;
    if (!bySession[l.sessionId]) bySession[l.sessionId] = {name: getPlanName(l), type: l.sessionType || "", logs: []};
    bySession[l.sessionId].logs.push(l);
  });
  const hit = targetHitRate(logs);

  $("todaySummary").innerHTML = `<div class="stats-grid">
    <div class="stat-card"><span>Exercises ${statHelpButton("exercisesCompleted")}</span><div class="value">${sourceLogs.length}</div></div>
    <div class="stat-card"><span>Total time ${statHelpButton("totalTrainingTime")}</span><div class="value">${formatDurationHuman(totalTime)}</div></div>
    <div class="stat-card"><span>${kpiTitle("Target hit rate", "targetHitRate")}</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div>
  </div><p>${Object.entries(byType).map(([k,v]) => `<span class="badge">${escapeHtml(k)}: ${v}</span>`).join("")}</p>
  <h3>Today’s exercise mix</h3>${renderCategoryChart(logs)}
  ${Object.values(bySession).map(s => {
    const st = s.logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
    return `<div class="item"><div class="item-title"><strong>${escapeHtml(s.name)}</strong><span class="badge">${s.logs.length} exercises · ${st.toFixed(1)}m</span></div><table class="history-table today-table"><thead><tr><th>Exercise</th><th>Type</th><th>Score</th><th>Performance</th><th>Target version</th><th>Time</th><th>Actions</th></tr></thead><tbody>${s.logs.map(l => renderSessionLogRow(l)).join("")}</tbody></table></div>`;
  }).join("")}`;
}

function renderVolumeChart(buckets, metric, title) {
  if (!buckets.length) return `<div class="chart-wrap"><p class="muted">No data for chart.</p></div>`;
  const w=520,h=170,padL=38,padR=18,padT=16,padB=38;
  const values = buckets.map(b => metric === "count" ? b.count : b.time);
  const maxV = Math.max(safeMax(values, 1), 1);
  const barW = Math.max(8, Math.min(42, (w-padL-padR) / buckets.length * 0.62));
  const step = (w-padL-padR) / buckets.length;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
    <line class="chart-axis" x1="${padL}" x2="${padL}" y1="${padT}" y2="${h-padB}"></line>
    <line class="chart-axis" x1="${padL}" x2="${w-padR}" y1="${h-padB}" y2="${h-padB}"></line>
    ${buckets.map((b,i) => {
      const v = metric === "count" ? b.count : b.time;
      const bh = (v / maxV) * (h-padT-padB);
      const x = padL + i*step + (step-barW)/2;
      const y = h-padB-bh;
      return `<rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}"><title>${htmlText(b.label)}: ${Number(v).toFixed(1)}</title></rect>`;
    }).join("")}
    ${buckets.filter((_,i)=> i===0 || i===buckets.length-1 || i===Math.floor((buckets.length-1)/2)).map(b => {
      const idx = buckets.indexOf(b); const x = padL + idx*step + step/2;
      return `<text class="chart-label" text-anchor="middle" x="${x.toFixed(1)}" y="${h-18}">${escapeHtml(b.label.slice(-10))}</text>`;
    }).join("")}
    <text class="chart-label" x="5" y="18">${escapeHtml(title)}</text>
  </svg></div>`;
}

function renderTrainingTimeInsightChart(logs, periodLabel="overall") {
  if (!logs.length) return `<div class="chart-wrap"><p class="muted">No training-time data for chart.</p></div>`;
  const rows = buildSessionKpiSeries(logs).filter(r => Number(r.practiceMinutes || 0) > 0);
  if (!rows.length) return `<div class="chart-wrap"><p class="muted">No logged minutes yet.</p></div>`;
  const vals = rows.map(r => Number(r.practiceMinutes || 0));
  const total = vals.reduce((a,b)=>a+b,0);
  const sessionCount = rows.length;
  const avgMinutes = total / sessionCount;
  const longest = safeMax(vals, 0);
  const trend = linearTrend(vals);
  const trendText = trend ? `${trend.slope >= 0 ? "+" : ""}${trend.slope.toFixed(1)} min/session` : "N/A";
  const w=520,h=190,padL=38,padR=20,padT=18,padB=40;
  const maxV = Math.max(longest, 1);
  const step = (w-padL-padR) / Math.max(1, rows.length);
  const barW = Math.max(4, Math.min(28, step * 0.58));
  const yScale = v => h-padB - (v / maxV) * (h-padT-padB);
  const xCenter = i => padL + i*step + step/2;
  const rolling = rows.map((_,i) => avg(vals.slice(Math.max(0, i-2), i+1)));
  const rollingPath = rolling.map((v,i) => `${i===0 ? "M" : "L"} ${xCenter(i).toFixed(1)} ${yScale(v).toFixed(1)}`).join(" ");
  const maxLabel = maxV >= 60 ? `${(maxV/60).toFixed(1)}h` : `${maxV.toFixed(0)}m`;
  return `<div class="training-time-insight">
    <div class="mini-metric-grid training-time-metrics">
      <div class="mini-metric"><span>Total</span><strong>${formatDurationHuman(total)}</strong></div>
      <div class="mini-metric"><span>Sessions</span><strong>${sessionCount}</strong></div>
      <div class="mini-metric"><span>Avg/session</span><strong>${avgMinutes.toFixed(0)}m</strong></div>
      <div class="mini-metric"><span>Load trend</span><strong>${htmlText(trendText)}</strong></div>
    </div>
    <div class="chart-wrap"><svg class="chart training-time-chart" style="--chart-h:190px" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Training time by session">
      <line class="chart-axis" x1="${padL}" x2="${padL}" y1="${padT}" y2="${h-padB}"></line>
      <line class="chart-axis" x1="${padL}" x2="${w-padR}" y1="${h-padB}" y2="${h-padB}"></line>
      <line class="chart-grid" x1="${padL}" x2="${w-padR}" y1="${yScale(maxV/2).toFixed(1)}" y2="${yScale(maxV/2).toFixed(1)}"></line>
      <text class="chart-label" x="5" y="${yScale(maxV).toFixed(1)+4}">${htmlText(maxLabel)}</text>
      <text class="chart-label" x="5" y="${yScale(maxV/2).toFixed(1)+4}">${(maxV/2).toFixed(0)}m</text>
      ${rows.map((r,i) => {
        const v = Number(r.practiceMinutes || 0);
        const bh = Math.max(1, (v / maxV) * (h-padT-padB));
        const x = xCenter(i) - barW/2;
        const y = h-padB-bh;
        return `<rect class="chart-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}"><title>${htmlText(r.label)} · ${htmlText(r.date)}: ${v.toFixed(1)} min, ${r.logCount} log${r.logCount===1?"":"s"}</title></rect>`;
      }).join("")}
      ${rows.length >= 2 ? `<path class="chart-line training-time-rolling" d="${rollingPath}"><title>3-session rolling average</title></path>` : ""}
      ${rows.filter((_,i)=> i===0 || i===rows.length-1 || i===Math.floor((rows.length-1)/2)).map((r) => {
        const idx = rows.indexOf(r);
        return `<text class="chart-label" text-anchor="middle" x="${xCenter(idx).toFixed(1)}" y="${h-18}">${htmlText(r.label)}</text>`;
      }).join("")}
      <text class="chart-label" x="${padL}" y="14">Training time by session · ${htmlText(periodLabel)}</text>
    </svg></div>
    <div class="analytics-note"><strong>Interpretation:</strong> bars show minutes per actual training session; the line shows a 3-session rolling load. This is more useful than a single monthly total because it shows whether volume is consistent, front-loaded, or tapering.</div>
  </div>`;
}

function renderCategoryChart(logs) {
  if (!logs.length) return `<div class="chart-wrap"><p class="muted">No data for chart.</p></div>`;
  const grouped = {};
  logs.forEach(l => {
    const k = l.category || "uncategorized";
    if (!grouped[k]) grouped[k] = {label:k, count:0, time:0};
    grouped[k].count += 1;
    grouped[k].time += Number(l.timeMinutes || 0);
  });
  const buckets = Object.values(grouped).sort((a,b)=>b.time-a.time);
  const totalTime = buckets.reduce((sum,b)=>sum + Number(b.time || 0), 0) || 1;
  const w=520,padL=112,padR=104,padT=14,padB=18,rowH=28;
  const h=Math.max(160, padT + padB + buckets.length * rowH);
  const maxV = Math.max(safeMax(buckets.map(b=>b.time), 1), 1);
  const barMaxW = w-padL-padR;
  return `<div class="chart-wrap"><svg class="chart category-mix-chart" style="--chart-h:${h}px" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Training category mix">
    ${buckets.map((b,i) => {
      const y = padT + i*rowH;
      const pct = b.time / totalTime * 100;
      const bw = Math.max(1, (b.time / maxV) * barMaxW);
      return `<text class="chart-label" x="6" y="${y+16}">${escapeHtml(b.label.slice(0,18))}</text><rect class="chart-bar-alt" x="${padL}" y="${y+3}" width="${bw.toFixed(1)}" height="${Math.max(12,rowH*0.58).toFixed(1)}"><title>${htmlText(b.label)}: ${b.time.toFixed(1)} min, ${pct.toFixed(1)}%, ${b.count} exercise${b.count===1?"":"s"}</title></rect><text class="chart-label category-pct-label" text-anchor="end" x="${w-8}" y="${y+16}">${pct.toFixed(1)}% · ${b.time.toFixed(0)}m</text>`;
    }).join("")}
  </svg></div>`;
}
function downsampleChartLogs(logs, maxPoints = 80) {
  const arr = Array.isArray(logs) ? logs : [];
  if (arr.length <= maxPoints) return arr;
  const out = [];
  const step = (arr.length - 1) / Math.max(1, maxPoints - 1);
  let lastIndex = -1;
  for (let i = 0; i < maxPoints; i += 1) {
    const idx = Math.min(arr.length - 1, Math.round(i * step));
    if (idx !== lastIndex) out.push(arr[idx]);
    lastIndex = idx;
  }
  return out;
}
function renderChart(logs) {
  if (logs.length < 2) return `<div class="chart-wrap"><p class="muted">Add at least two logs to display a progression curve.</p></div>`;
  const chartLogs = downsampleChartLogs(logs, 80);
  const points = chartLogs.map((l,i) => ({i, y: Number(l.normalizedScore || 0), label: localDateKey(l.createdAt)}));
  const w=520,h=160,padL=34,padR=12,padT=12,padB=30;
  const pointYs = points.map(p=>p.y); const minY=safeMin(pointYs, 0), maxY=safeMax(pointYs, 0), yRange=maxY===minY?1:maxY-minY;
  const xScale=i=>padL+(i/Math.max(1,points.length-1))*(w-padL-padR);
  const yScale=y=>padT+(maxY-y)/yRange*(h-padT-padB);
  const path=points.map((p,idx)=>`${idx===0?"M":"L"} ${xScale(p.i).toFixed(1)} ${yScale(p.y).toFixed(1)}`).join(" ");
  const yTicks=[0,.25,.5,.75,1].map(t=>minY+yRange*t);
  const xLabels=points.filter((_,i)=>i===0||i===points.length-1||i===Math.floor((points.length-1)/2));
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${yTicks.map(y=>`<line class="chart-grid" x1="${padL}" x2="${w-padR}" y1="${yScale(y)}" y2="${yScale(y)}"></line>`).join("")}<line class="chart-axis" x1="${padL}" x2="${padL}" y1="${padT}" y2="${h-padB}"></line><line class="chart-axis" x1="${padL}" x2="${w-padR}" y1="${h-padB}" y2="${h-padB}"></line><path class="chart-line" d="${path}"></path>${points.map(p=>`<circle class="chart-point" cx="${xScale(p.i)}" cy="${yScale(p.y)}" r="2.5"><title>${p.label}: ${p.y.toFixed(2)}</title></circle>`).join("")}${yTicks.map(y=>`<text class="chart-label" x="5" y="${yScale(y)+4}">${y.toFixed(1)}</text>`).join("")}${xLabels.map(p=>`<text class="chart-label" x="${xScale(p.i)-28}" y="${h-15}">${p.label.slice(5)}</text>`).join("")}</svg></div>`;
}
function renderRollingChart(logs, rollingVals) {
  if (logs.length < 2) return "";
  const fakeLogs = logs.map((l,i)=>({...l, normalizedScore: rollingVals[i]}));
  return `<h3>Rolling average</h3>${renderChart(fakeLogs)}`;
}



const ROUTINE_PACK_SCHEMA_VERSION = "1.0";
const ROUTINE_LEVEL_KEYS = ["sub30", "break30", "break50", "break70", "century", "pro"];

function slugifyToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeRoutineCanonicalId(value) {
  const slug = slugifyToken(value);
  return slug || `routine-${uuid()}`;
}

function getRoutineCanonicalId(routine) {
  if (!routine) return "";
  const existing = normalizeRoutineCanonicalId(routine.canonicalId || routine.catalogueId || routine.packRoutineId || "");
  if (existing && !existing.startsWith("routine-id-")) return existing;
  const prefix = slugifyToken(routine.category || routine.folder || "routine") || "routine";
  return normalizeRoutineCanonicalId(`${prefix}-${routine.name || routine.id || uuid()}`);
}

function routinePackMetaDefaults(overrides = {}) {
  return {
    schema: "snookerRoutinePack",
    schemaVersion: ROUTINE_PACK_SCHEMA_VERSION,
    name: overrides.name || "Snooker Practice Routine Pack",
    version: overrides.version || APP_VERSION,
    author: overrides.author || "Snooker Practice PWA",
    createdAt: overrides.createdAt || new Date().toISOString(),
    appVersion: APP_VERSION,
    notes: overrides.notes || ""
  };
}

function exportableRoutineRecord(routine) {
  const r = structuredCloneSafe(routine || {});
  const canonicalId = getRoutineCanonicalId(r);
  const skillMap = normalizeRoutineSkillMap(r, getRoutineSkillMap(r));
  return {
    ...r,
    canonicalId,
    metadataVersion: Number(r.metadataVersion || 1),
    isCatalogueRoutine: !!r.isCatalogueRoutine,
    skillMap,
    primarySkill: skillMap.primarySkill,
    secondarySkills: normalizeSkillList(skillMap.secondarySkills),
    transferTags: normalizeSkillList(skillMap.transferTags),
    targetProfiles: Array.isArray(r.targetHistory) ? structuredCloneSafe(r.targetHistory) : [],
    activeTargetProfileId: r.activeTargetProfileId || ""
  };
}

function buildRoutinePack() {
  const routines = (data.routines || [])
    .filter(r => r && !r.isDeleted)
    .map(exportableRoutineRecord);
  return {
    packMeta: routinePackMetaDefaults({
      name: `Snooker Practice Routine Library — ${new Date().toISOString().slice(0,10)}`,
      version: APP_VERSION
    }),
    taxonomyVersion: data.skillTaxonomy?.version || "1.0",
    skillTaxonomy: normalizeSkillTaxonomy(data.skillTaxonomy || defaultSkillTaxonomy()),
    routines,
    skillMaps: routines.map(r => ({canonicalId:r.canonicalId, routineId:r.id, ...normalizeRoutineSkillMap(r, r.skillMap)})),
    targetProfiles: routines.map(r => ({
      canonicalId: r.canonicalId,
      routineId: r.id,
      activeTargetProfileId: r.activeTargetProfileId || "",
      targetHistory: Array.isArray(r.targetHistory) ? structuredCloneSafe(r.targetHistory) : []
    }))
  };
}

function validateRoutinePack(pack) {
  const errors = [];
  const warnings = [];
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) errors.push("Pack must be a JSON object.");
  const routines = Array.isArray(pack?.routines) ? pack.routines : [];
  if (!routines.length) errors.push("Pack contains no routines.");
  const seen = new Set();
  const allowedScoring = new Set(["raw","success_rate","points","score_per_minute","progressive_completion"]);
  routines.forEach((r, idx) => {
    const label = `Routine ${idx + 1}`;
    if (!r || typeof r !== "object") { errors.push(`${label} is not an object.`); return; }
    if (!String(r.name || "").trim()) errors.push(`${label} is missing a name.`);
    const canonicalId = normalizeRoutineCanonicalId(r.canonicalId || r.id || r.name);
    if (seen.has(canonicalId)) errors.push(`Duplicate canonicalId: ${canonicalId}`);
    seen.add(canonicalId);
    if (r.scoring && !allowedScoring.has(String(r.scoring))) errors.push(`${label} has unsupported scoring mode: ${r.scoring}`);
    const skillMap = normalizeRoutineSkillMap(r, r.skillMap || {});
    if (!skillMap.primarySkill) warnings.push(`${label} has no primary skill; it will be inferred.`);
    ["target","stretchTarget","attempts","duration","totalUnits","attemptsPerSession"].forEach(field => {
      if (r[field] !== "" && r[field] !== undefined && r[field] !== null && !Number.isFinite(Number(r[field]))) warnings.push(`${label} has non-numeric ${field}; it will be normalized.`);
    });
  });
  return {ok: errors.length === 0, errors, warnings, routineCount: routines.length};
}

function mergeRoutinePack(pack, options = {}) {
  const validation = validateRoutinePack(pack);
  if (!validation.ok) return {ok:false, ...validation, added:0, updated:0, skipped:0};
  const preserveUserTargets = options.preserveUserTargets !== false;
  const preserveUserDescriptions = options.preserveUserDescriptions !== false;
  const now = new Date().toISOString();
  data.routines = data.routines || [];
  data.routineSkillMap = data.routineSkillMap || {};
  const byCanonical = new Map((data.routines || []).map(r => [getRoutineCanonicalId(r), r]));
  const byId = new Map((data.routines || []).map(r => [String(r.id), r]));
  let added = 0, updated = 0, skipped = 0;
  (pack.routines || []).forEach(source => {
    const canonicalId = normalizeRoutineCanonicalId(source.canonicalId || source.id || source.name);
    const existing = byCanonical.get(canonicalId) || byId.get(String(source.id || ""));
    const skillMap = normalizeRoutineSkillMap(source, source.skillMap || {});
    const incoming = {
      ...structuredCloneSafe(source),
      id: existing?.id || (source.id && !byId.has(String(source.id)) ? String(source.id) : uuid()),
      canonicalId,
      routinePackSource: pack.packMeta?.name || "Imported routine pack",
      routinePackVersion: pack.packMeta?.version || "",
      metadataVersion: Number(source.metadataVersion || 1),
      isCatalogueRoutine: true,
      name: String(source.name || "Imported routine").trim(),
      scoring: source.scoring || "raw",
      category: source.category || source.folder || "uncategorized",
      folder: source.folder || source.category || "Imported",
      subfolder: source.subfolder || "General",
      description: source.description || "",
      target: source.target === "" || source.target === undefined ? "" : Number(source.target),
      stretchTarget: source.stretchTarget === "" || source.stretchTarget === undefined ? "" : Number(source.stretchTarget),
      attempts: source.attempts === "" || source.attempts === undefined ? "" : Number(source.attempts),
      duration: source.duration === "" || source.duration === undefined ? "" : Number(source.duration),
      totalUnits: source.totalUnits === "" || source.totalUnits === undefined ? "" : Number(source.totalUnits),
      attemptsPerSession: source.attemptsPerSession === "" || source.attemptsPerSession === undefined ? "" : Number(source.attemptsPerSession),
      sideMode: normalizeSideMode(source.sideMode || "none"),
      attemptMode: normalizeSideMode(source.sideMode || "none") === "left_right" ? normalizeAttemptMode(source.attemptMode || "shared") : "shared",
      skillMap,
      isDeleted: false,
      deletedAt: ""
    };
    if (existing) {
      const merged = {
        ...existing,
        ...incoming,
        id: existing.id,
        createdAt: existing.createdAt || incoming.createdAt || now,
        updatedAt: now,
        description: preserveUserDescriptions && existing.description ? existing.description : incoming.description,
        targetHistory: preserveUserTargets && Array.isArray(existing.targetHistory) && existing.targetHistory.length
          ? existing.targetHistory
          : (Array.isArray(source.targetHistory) ? structuredCloneSafe(source.targetHistory) : existing.targetHistory || []),
        activeTargetProfileId: preserveUserTargets && existing.activeTargetProfileId ? existing.activeTargetProfileId : (source.activeTargetProfileId || existing.activeTargetProfileId || "")
      };
      data.routines = data.routines.map(r => r.id === existing.id ? ensureTargetHistory(merged) : r);
      data.routineSkillMap[existing.id] = normalizeRoutineSkillMap(merged, skillMap);
      updated += 1;
    } else {
      const normalized = ensureTargetHistory(incoming);
      data.routines.push(normalized);
      data.routineSkillMap[normalized.id] = normalizeRoutineSkillMap(normalized, skillMap);
      added += 1;
    }
  });
  data.routinePackImports = data.routinePackImports || [];
  data.routinePackImports.unshift({
    name: pack.packMeta?.name || "Imported routine pack",
    version: pack.packMeta?.version || "",
    importedAt: now,
    added,
    updated,
    skipped
  });
  data.routinePackImports = data.routinePackImports.slice(0, 20);
  return {ok:true, ...validation, added, updated, skipped};
}

function exportRoutinePackJson() {
  const pack = buildRoutinePack();
  const filename = `snooker-routine-pack-${new Date().toISOString().slice(0,10)}.json`;
  return exportFile(filename, JSON.stringify(pack), "application/json");
}


function parseRoutineLibraryCsv(text) {
  const src = String(text || "").replace(/^\ufeff/, "");
  const rows = [];
  let row = [], cell = "", quote = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quote) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quote = false;
      else cell += ch;
    } else if (ch === '"') quote = true;
    else if (ch === ',') { row.push(cell); cell = ""; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const header = (rows.shift() || []).map(h => String(h || "").trim());
  const normalizedHeader = header.map(h => h.toLowerCase());
  return rows.filter(r => r.some(v => String(v || "").trim())).map((r, rowIndex) => {
    const obj = {__row: rowIndex + 2};
    normalizedHeader.forEach((h, i) => { obj[h] = String(r[i] ?? "").trim(); });
    return obj;
  });
}

function splitCsvSkillList(value) {
  return String(value || "").split(/[|;,]/).map(x => x.trim()).filter(Boolean);
}

function parseOptionalNumber(value) {
  const raw = String(value ?? "").trim().replace(",", ".");
  if (raw === "") return "";
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
}

function routineCsvImportRecord(row) {
  const canonicalId = normalizeRoutineCanonicalId(row.canonicalid || row.canonical_id || row.catalogueid || row.catalogue_id || row.id || row.name || "");
  const name = String(row.name || row.title || "").trim();
  const scoring = String(row.scoring || "raw").trim() || "raw";
  const sideMode = normalizeSideMode(row.sidemode || row.side_mode || "none");
  const skillMap = normalizeRoutineSkillMap({name, category: row.category || row.folder || ""}, {
    primarySkill: row.primaryskill || row.primary_skill || "cueing",
    secondarySkills: splitCsvSkillList(row.secondaryskills || row.secondary_skills),
    transferTags: splitCsvSkillList(row.transfertags || row.transfer_tags || row.transferskills || row.transfer_skills),
    source: "csv-import",
    updatedAt: new Date().toISOString()
  });
  const numericFields = ["attempts", "duration", "target", "stretchtarget", "totalunits", "attemptspersession"];
  const nums = Object.create(null);
  numericFields.forEach(key => { nums[key] = parseOptionalNumber(row[key] || row[key.replace(/([a-z])([A-Z])/g, "$1_$2")] || ""); });
  return {
    canonicalId,
    name,
    folder: row.folder || row.category || "Imported",
    subfolder: row.subfolder || "General",
    category: row.category || row.folder || "uncategorized",
    scoring,
    attempts: nums.attempts,
    duration: nums.duration,
    target: nums.target,
    stretchTarget: nums.stretchtarget,
    totalUnits: nums.totalunits,
    attemptsPerSession: nums.attemptspersession,
    sideMode,
    attemptMode: sideMode === "left_right" ? normalizeAttemptMode(row.attemptmode || row.attempt_mode || "shared") : "shared",
    unitType: row.unittype || row.unit_type || "",
    difficultyLabel: row.difficultylabel || row.difficulty_label || "Base target",
    description: row.description || "",
    skillMap,
    __row: row.__row
  };
}

function validateRoutineCsvRows(rows) {
  const errors = [], warnings = [], seen = new Set();
  const records = rows.map(routineCsvImportRecord);
  records.forEach(rec => {
    if (!rec.name) errors.push(`Row ${rec.__row}: routine name is required.`);
    if (!rec.canonicalId) errors.push(`Row ${rec.__row}: canonicalId could not be inferred.`);
    if (seen.has(rec.canonicalId)) errors.push(`Row ${rec.__row}: duplicate canonicalId ${rec.canonicalId}.`);
    seen.add(rec.canonicalId);
    ["attempts","duration","target","stretchTarget","totalUnits","attemptsPerSession"].forEach(field => {
      if (Number.isNaN(rec[field])) errors.push(`Row ${rec.__row}: ${field} is not a valid number.`);
    });
    if (!rec.skillMap.primarySkill) warnings.push(`Row ${rec.__row}: missing primary skill; cueing fallback will be used.`);
    if (!["raw","success_rate","time","score_per_minute","progressive_completion","points"].includes(rec.scoring)) warnings.push(`Row ${rec.__row}: unknown scoring mode "${rec.scoring}" kept as-is.`);
  });
  return {ok: errors.length === 0, errors, warnings, records};
}

function routineCsvDiffSummary(records) {
  const byCanonical = Object.create(null);
  (data.routines || []).forEach(r => { byCanonical[getRoutineCanonicalId(r)] = r; });
  let added = 0, updated = 0, unchanged = 0;
  records.forEach(rec => {
    const existing = byCanonical[rec.canonicalId];
    if (!existing) { added += 1; return; }
    const fields = ["name","folder","subfolder","category","scoring","attempts","duration","target","stretchTarget","totalUnits","attemptsPerSession","sideMode","attemptMode","unitType","difficultyLabel","description"];
    const changed = fields.some(f => String(existing[f] ?? "") !== String(rec[f] ?? ""));
    const existingMap = normalizeRoutineSkillMap(existing, getRoutineSkillMap(existing));
    const skillChanged = JSON.stringify(existingMap) !== JSON.stringify(rec.skillMap);
    if (changed || skillChanged) updated += 1; else unchanged += 1;
  });
  return {added, updated, unchanged};
}

function applyRoutineCsvImport(records) {
  const now = new Date().toISOString();
  data.routines = data.routines || [];
  data.routineSkillMap = data.routineSkillMap || {};
  const byCanonical = Object.create(null);
  data.routines.forEach(r => { byCanonical[getRoutineCanonicalId(r)] = r; });
  let added = 0, updated = 0;
  records.forEach(rec => {
    const existing = byCanonical[rec.canonicalId];
    const clean = {
      canonicalId: rec.canonicalId,
      metadataVersion: existing ? Number(existing.metadataVersion || 1) + 1 : 1,
      isCatalogueRoutine: true,
      name: rec.name,
      folder: rec.folder,
      subfolder: rec.subfolder,
      category: rec.category,
      scoring: rec.scoring,
      attempts: rec.attempts === "" || Number.isNaN(rec.attempts) ? "" : rec.attempts,
      duration: rec.duration === "" || Number.isNaN(rec.duration) ? "" : rec.duration,
      target: rec.target === "" || Number.isNaN(rec.target) ? "" : rec.target,
      stretchTarget: rec.stretchTarget === "" || Number.isNaN(rec.stretchTarget) ? "" : rec.stretchTarget,
      totalUnits: rec.totalUnits === "" || Number.isNaN(rec.totalUnits) ? "" : rec.totalUnits,
      attemptsPerSession: rec.attemptsPerSession === "" || Number.isNaN(rec.attemptsPerSession) ? "" : rec.attemptsPerSession,
      sideMode: rec.sideMode,
      attemptMode: rec.attemptMode,
      unitType: rec.unitType,
      difficultyLabel: rec.difficultyLabel,
      description: rec.description,
      updatedAt: now
    };
    if (existing) {
      const merged = ensureTargetHistory({...existing, ...clean, id: existing.id, createdAt: existing.createdAt || now, updatedAt: now});
      data.routines = data.routines.map(r => r.id === existing.id ? merged : r);
      data.routineSkillMap[existing.id] = normalizeRoutineSkillMap(merged, rec.skillMap);
      updated += 1;
    } else {
      const routine = ensureTargetHistory({id: uuid(), createdAt: now, ...clean, isDeleted:false, deletedAt:""});
      data.routines.push(routine);
      data.routineSkillMap[routine.id] = normalizeRoutineSkillMap(routine, rec.skillMap);
      added += 1;
    }
  });
  data.routineCsvImports = data.routineCsvImports || [];
  data.routineCsvImports.unshift({importedAt: now, added, updated, rowCount: records.length});
  data.routineCsvImports = data.routineCsvImports.slice(0, 20);
  return {added, updated};
}

async function importRoutineLibraryCsvFile(event) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;
  const lowerName = String(file.name || "").toLowerCase();
  if (file.size > 4 * 1024 * 1024) {
    input.value = "";
    return alert("Routine CSV is too large. Maximum size is 4MB.");
  }
  if (!lowerName.endsWith(".csv") && !String(file.type || "").includes("csv")) {
    input.value = "";
    return alert("Invalid routine library file. Please select a .csv file.");
  }
  try {
    const rows = parseRoutineLibraryCsv(await file.text());
    const validation = validateRoutineCsvRows(rows);
    if (!validation.ok) return alert(`Routine CSV validation failed:\n${validation.errors.slice(0,12).join("\n")}`);
    const diff = routineCsvDiffSummary(validation.records);
    const warningText = validation.warnings.length ? `\n\nWarnings:\n${validation.warnings.slice(0,5).join("\n")}` : "";
    const msg = `Routine CSV preview:\n${validation.records.length} valid row(s)\n${diff.added} to add\n${diff.updated} to update\n${diff.unchanged} unchanged${warningText}\n\nApply these changes?`;
    if (!confirm(msg)) return;
    const result = applyRoutineCsvImport(validation.records);
    saveData({render:"all", immediateIDB:true});
    showTransientNotice(`Routine CSV imported: ${result.added} added, ${result.updated} updated.`, "ok");
  } catch(error) {
    logAppError(error, "importRoutineLibraryCsvFile");
    alert("Could not import this routine CSV. Export Debug Info if the issue persists.");
  } finally {
    if (input) input.value = "";
  }
}

function exportRoutineLibraryCsv() {
  const headers = [
    "canonicalId","id","name","folder","subfolder","category","scoring","attempts","duration","target","stretchTarget",
    "primarySkill","secondarySkills","transferTags","sideMode","attemptMode","totalUnits","attemptsPerSession","unitType",
    "difficultyLabel","description"
  ];
  const rows = [headers.join(",")];
  (data.routines || []).filter(r => !r.isDeleted).forEach(r => {
    const skillMap = normalizeRoutineSkillMap(r, getRoutineSkillMap(r));
    const row = {
      canonicalId: getRoutineCanonicalId(r),
      id: r.id || "",
      name: r.name || "",
      folder: r.folder || "",
      subfolder: r.subfolder || "",
      category: r.category || "",
      scoring: r.scoring || "",
      attempts: r.attempts || "",
      duration: r.duration || "",
      target: r.target || "",
      stretchTarget: r.stretchTarget || "",
      primarySkill: skillMap.primarySkill || "",
      secondarySkills: normalizeSkillList(skillMap.secondarySkills).join("|"),
      transferTags: normalizeSkillList(skillMap.transferTags).join("|"),
      sideMode: normalizeSideMode(r.sideMode || "none"),
      attemptMode: getRoutineAttemptMode(r),
      totalUnits: r.totalUnits || "",
      attemptsPerSession: r.attemptsPerSession || "",
      unitType: r.unitType || "",
      difficultyLabel: r.difficultyLabel || "",
      description: r.description || ""
    };
    rows.push(headers.map(h => csvEscape(row[h])).join(","));
  });
  const filename = `snooker-routine-library-${new Date().toISOString().slice(0,10)}.csv`;
  return exportFile(filename, rows.join("\n"), "text/csv");
}


function aiSafeValue(value, depth = 0) {
  if (depth > 5) return null;
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? Number(value.toFixed(4)) : null;
  if (typeof value === "string") return value.length > 1200 ? value.slice(0, 1200) : value;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 200).map(v => aiSafeValue(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    Object.entries(value).slice(0, 80).forEach(([k, v]) => {
      if (["logs", "trajectory", "eventHistory"].includes(k)) return;
      out[k] = aiSafeValue(v, depth + 1);
    });
    return out;
  }
  return String(value);
}

function aiTry(label, fn, fallback = null) {
  try { return aiSafeValue(fn()); }
  catch (e) {
    try { logAppError?.(e, `aiCoachingExport ${label}`); } catch (_) {}
    return fallback;
  }
}

function aiLearningBandForRoutine(routine) {
  const scoring = routine?.scoring || "raw";
  if (scoring === "progressive_completion") return {low:40, high:65, rationale:"Progressive snooker routines should be challenging enough to expose break-building limits without creating constant failure."};
  if (scoring === "points") return {low:null, high:null, rationale:"Points-based tactical/safety routines need contextual interpretation rather than a fixed percentage band."};
  const skills = new Set(normalizeSkillList([...(getRoutineSkillMap(routine)?.secondarySkills || []), ...(getRoutineSkillMap(routine)?.transferTags || []), getRoutineSkillMap(routine)?.primarySkill]));
  if (skills.has("pressure_resilience")) return {low:35, high:60, rationale:"Pressure drills can be productive at lower success rates than technical potting drills."};
  if (skills.has("safety") || skills.has("tactical_awareness")) return {low:50, high:70, rationale:"Safety and tactical snooker drills should stay difficult but not random."};
  if (skills.has("break_building") || skills.has("cue_ball_control")) return {low:45, high:70, rationale:"Positional and break-building routines need a wider productive band because transfer value matters."};
  return {low:55, high:75, rationale:"Technical potting routines are usually most productive in a moderate success band."};
}

function aiRoutineMaturityForLogs(logs, routine=null) {
  const n = Array.isArray(logs) ? logs.length : 0;
  const vals = (logs || []).map(l => Number(l.normalizedScore ?? normalizeScore(l))).filter(Number.isFinite);
  const volatility = vals.length >= 3 ? stdDev(vals) : null;
  const recent = vals.length ? vals.slice(-Math.min(10, vals.length)) : [];
  const recentAverage = recent.length ? avg(recent) : null;
  const confidence = n >= 10 ? "high" : n >= 6 ? "medium" : n >= 4 ? "low" : "insufficient";
  const label = n >= 10 ? "Mature" : n >= 6 ? "Usable baseline" : n >= 4 ? "Early baseline" : "Insufficient evidence";
  return {n, confidence, label, recentAverage, volatility};
}

function aiRoutineSchemaFlags(routine, logs) {
  const flags = [];
  const routineScoring = String(routine?.scoring || "");
  const seen = new Set((logs || []).map(l => String(l?.scoring || "")).filter(Boolean));
  if (seen.size > 1) flags.push({type:"mixed_scoring_logs", severity:"medium", detail:`Historical logs use multiple scoring modes: ${Array.from(seen).join(", ")}. Interpret trend and target hit rate cautiously.`});
  if (seen.size && routineScoring && !seen.has(routineScoring)) flags.push({type:"routine_log_scoring_mismatch", severity:"medium", detail:`Routine currently uses ${routineScoring}, but recent logs use ${Array.from(seen).join(", ")}.`});
  const legacyPoints = (logs || []).filter(l => String(l?.scoring || "") === "points" && ["success_rate", "progressive_completion"].includes(routineScoring)).length;
  if (legacyPoints) flags.push({type:"legacy_points_logs", severity:"low", detail:`${legacyPoints} older log(s) use points-style scoring under a ${routineScoring} routine. Keep target advice conservative.`});
  return flags;
}

function aiTargetHealthForRoutine(routine, logs) {
  const hit = targetHitRate(logs);
  const band = aiLearningBandForRoutine(routine);
  const maturity = aiRoutineMaturityForLogs(logs, routine);
  const values = (logs || []).map(l => Number(l.normalizedScore ?? normalizeScore(l))).filter(Number.isFinite);
  const recent = values.slice(-Math.min(10, values.length));
  const recentAverage = recent.length ? avg(recent) : null;
  if (maturity.n < 6 || hit === null || band.low === null) {
    return {
      state:"insufficient_data",
      label:"Insufficient data",
      hitRate:hit,
      band,
      maturity,
      recentAverage,
      confidence:"low",
      recommendation:"Collect at least 6 comparable snooker logs before changing this routine target. Keep the setup stable so the baseline becomes meaningful."
    };
  }
  const highVol = Number.isFinite(maturity.volatility) && maturity.volatility > 18;
  if (highVol && maturity.n < 10) {
    return {
      state:"volatile",
      label:"Volatile / noisy",
      hitRate:hit,
      band,
      maturity,
      recentAverage,
      confidence:"low",
      recommendation:"Performance is too volatile for an aggressive target change. Repeat the same setup before recalibrating."
    };
  }
  const confidence = maturity.n >= 10 && !highVol ? "high" : maturity.n >= 6 ? "medium" : "low";
  if (hit < band.low - 15) return {state:"too_hard", label:"Too hard", hitRate:hit, band, maturity, recentAverage, confidence, recommendation:"Lower the target one controlled step or simplify one constraint; failure is currently too frequent for productive snooker repetition."};
  if (hit < band.low) return {state:"stretching", label:"Difficult stretch", hitRate:hit, band, maturity, recentAverage, confidence, recommendation:"Keep the drill stable or lower the target slightly if confidence is dropping."};
  if (hit <= band.high) return {state:"productive", label:"Productive band", hitRate:hit, band, maturity, recentAverage, confidence, recommendation:"Hold the current target. This routine is in the productive snooker training band."};
  if (hit <= band.high + 15) return {state:"getting_easy", label:"Getting easy", hitRate:hit, band, maturity, recentAverage, confidence, recommendation:"Consider increasing the stretch target or adding one small constraint if form is stable."};
  return {state:"too_easy", label:"Too easy", hitRate:hit, band, maturity, recentAverage, confidence, recommendation:"Increase difficulty gradually or progress to a harder snooker routine."};
}

function aiTargetStepSize(current, scoring, attempts) {
  const c = Number(current);
  if (!Number.isFinite(c) || c <= 0) return 1;
  if (scoring === "highest_break") return Math.max(2, Math.round(c * 0.15));
  if (attempts > 0 && attempts <= 15) return 1;
  if (attempts > 0 && attempts <= 30) return 2;
  return Math.max(2, Math.round(c * 0.12));
}

function aiSuggestedTargetForRoutine(routine, logs, health) {
  const current = Number(routine?.target ?? 0);
  const attempts = Number(routine?.attempts || routine?.attemptsPerSession || routine?.totalUnits || 0);
  const scoring = String(routine?.scoring || "");
  const hit = Number(health?.hitRate);
  const band = health?.band || aiLearningBandForRoutine(routine);
  const maturity = health?.maturity || aiRoutineMaturityForLogs(logs, routine);
  if (!Number.isFinite(current) || current <= 0 || !Number.isFinite(hit) || band.low === null) return null;
  if ((maturity?.n || 0) < 6 || ["insufficient_data", "volatile"].includes(health?.state)) return null;

  const values = (logs || []).map(l => Number(l.normalizedScore ?? normalizeScore(l))).filter(Number.isFinite);
  const recent = values.slice(-Math.min(10, values.length));
  const recentAverage = recent.length ? avg(recent) : null;
  const step = aiTargetStepSize(current, scoring, attempts);
  let suggested = current;
  let direction = "hold";

  if (hit < band.low - 15) {
    const evidenceTarget = Number.isFinite(recentAverage) ? Math.round(recentAverage + Math.max(2, step)) : current - step;
    suggested = Math.max(current - step * 2, Math.min(current - step, evidenceTarget));
    direction = "reduce";
  } else if (hit < band.low) {
    suggested = current - step;
    direction = "reduce_slightly";
  } else if (hit > band.high + 15 && health?.confidence !== "low") {
    suggested = current + step * 2;
    direction = "raise";
  } else if (hit > band.high && health?.confidence !== "low") {
    suggested = current + step;
    direction = "raise_slightly";
  }

  const minFloor = scoring === "highest_break" ? Math.max(6, Math.round(current * 0.5)) : attempts > 0 ? Math.max(1, Math.round(attempts * 0.15)) : Math.max(1, Math.round(current * 0.5));
  const maxCeiling = attempts > 0 && ["success_rate", "progressive_completion"].includes(scoring) ? attempts : Math.max(suggested, Math.round(current * 1.5));
  suggested = Math.max(minFloor, Math.min(maxCeiling, Math.round(suggested)));
  if (suggested === current) return null;

  const stretchGap = scoring === "highest_break" ? Math.max(3, Math.round(suggested * 0.15)) : Math.max(1, Math.round(suggested * 0.15));
  const suggestedStretch = attempts > 0 && ["success_rate", "progressive_completion"].includes(scoring) ? Math.min(attempts, suggested + stretchGap) : suggested + stretchGap;
  return {
    currentTarget: current,
    suggestedTarget: suggested,
    suggestedStretchTarget: Math.max(suggested, suggestedStretch),
    direction,
    confidence: health?.confidence || maturity?.confidence || "medium",
    routineMaturity: maturity,
    recentAverageLast10: Number.isFinite(recentAverage) ? recentAverage : null,
    rationale: `${health.recommendation} Suggested as a one-step calibration, not a permanent downgrade.`,
    applyAsNewTargetProfile: true
  };
}

function aiRecentEvidenceLogs(logs, limit = 20) {
  return (logs || []).slice(-limit).map(l => ({
    id: l.id,
    createdAt: l.createdAt,
    routineId: l.routineId,
    routineName: getRoutineName(l),
    scoring: l.scoring,
    score: Number(l.score || 0),
    attempts: Number(l.attempts || 0),
    normalizedScore: Number(l.normalizedScore || 0),
    performance: l.performance || "N/A",
    targetAtLog: l.targetAtLog ?? null,
    stretchTargetAtLog: l.stretchTargetAtLog ?? null,
    timeMinutes: Number(l.timeMinutes || 0),
    sessionRating: l.sessionRating || "",
    tags: l.sessionTags || "",
    notes: l.notes ? String(l.notes).slice(0, 300) : ""
  }));
}

function buildAiRoutineSnapshot(routine, groupedLogs) {
  const logs = (groupedLogs[String(routine.id)] || []).slice();
  const skillMap = normalizeRoutineSkillMap(routine, getRoutineSkillMap(routine));
  const stats = aiTry("routineStats", () => routineStats(routine, groupedLogs), {});
  const health = aiTargetHealthForRoutine(routine, logs);
  const suggested = aiSuggestedTargetForRoutine(routine, logs, health);
  const maturity = aiRoutineMaturityForLogs(logs, routine);
  const schemaFlags = aiRoutineSchemaFlags(routine, logs);
  const values = logs.map(l => Number(l.normalizedScore || 0)).filter(Number.isFinite);
  const successLogs = logs.filter(l => l.scoring === "success_rate" || routine.scoring === "success_rate");
  return {
    routine: {
      id: routine.id,
      canonicalId: getRoutineCanonicalId(routine),
      name: routine.name || "Exercise",
      folder: routine.folder || routine.category || "",
      subfolder: routine.subfolder || "",
      scoring: routine.scoring || "raw",
      attempts: routine.attempts || routine.attemptsPerSession || "",
      duration: routine.duration || "",
      target: routine.target || "",
      stretchTarget: routine.stretchTarget || "",
      totalUnits: routine.totalUnits || "",
      difficultyLabel: routine.difficultyLabel || "",
      description: routine.description || "",
      primarySkill: skillMap.primarySkill || "",
      secondarySkills: normalizeSkillList(skillMap.secondarySkills),
      transferSkills: normalizeSkillList(skillMap.transferTags),
      targetHistory: Array.isArray(routine.targetHistory) ? routine.targetHistory.slice(-8).map(aiSafeValue) : [],
      activeTargetProfileId: routine.activeTargetProfileId || ""
    },
    statisticalSnapshot: {
      logCount: logs.length,
      firstPracticedAt: logs[0]?.createdAt || null,
      lastPracticedAt: logs[logs.length - 1]?.createdAt || null,
      allTimeAverage: values.length ? avg(values) : null,
      recentAverageLast5: values.length ? avg(values.slice(-5)) : null,
      recentAverageLast10: values.length ? avg(values.slice(-10)) : null,
      bestNormalizedScore: values.length ? safeMax(values, null) : null,
      volatility: values.length >= 3 ? stdDev(values) : null,
      targetHitRate: targetHitRate(logs),
      metrics: aiSafeValue(metricsForLogs(logs)),
      routineStats: stats,
      maturity,
      schemaFlags
    },
    analyses: {
      bayesianSuccessRate: aiTry("bayesianStatsForRoutine", () => bayesianStatsForRoutine(routine), null),
      targetCredibleInterval: aiTry("targetCredibleIntervalForRoutine", () => targetCredibleIntervalForRoutine(routine), null),
      dynamicDifficulty: aiTry("dynamicDifficultyAdjustmentForLogs", () => dynamicDifficultyAdjustmentForLogs(logs, routine), null),
      currentForm: aiTry("estimateCurrentFormForLogs", () => estimateCurrentFormForLogs(logs), null),
      changePoint: aiTry("detectSeriesChangePoint", () => detectSeriesChangePoint(values, {minN:8, maxWindow:150}), null),
      performanceStability: aiTry("performanceStabilityIndex", () => performanceStabilityIndex(logs, 10), null),
      fatigueSlope: aiTry("fatigueSlope", () => cachedFatigueSlope(logs), null),
      plateau: aiTry("plateauDetector", () => plateauDetector(logs, 8), null),
      overtraining: aiTry("overtrainingSignal", () => overtrainingSignal(logs, 8), null),
      difficultyLadder: aiTry("difficultyLadderRecommendation", () => difficultyLadderRecommendation(logs), null),
      forecast: aiTry("forecastWithConfidence", () => forecastWithConfidence(logs, 5), null),
      progressiveCompletion: aiTry("progressiveStatsForLogs", () => routine.scoring === "progressive_completion" ? progressiveStatsForLogs(logs) : null, null),
      contextNormalization: aiTry("routineContextNormalizationSignal", () => routineContextNormalizationSignal(routine), null),
      transferValue: aiTry("routineTransferValue", () => routineTransferValue(routine), null)
    },
    targetCalibration: {
      health,
      suggestion: suggested,
      maturity,
      schemaFlags
    },
    recentEvidence: aiRecentEvidenceLogs(logs, 20)
  };
}

function buildAiSkillProfile(routineSnapshots) {
  const skillRows = Object.create(null);
  routineSnapshots.forEach(row => {
    const skills = [row.routine.primarySkill, ...(row.routine.secondarySkills || []), ...(row.routine.transferSkills || [])].filter(Boolean);
    skills.forEach(skill => {
      skillRows[skill] ||= {skill, routines:0, logCount:0, avgValues:[], hitRates:[], tooHard:0, tooEasy:0, productive:0};
      const rec = skillRows[skill];
      rec.routines += 1;
      rec.logCount += Number(row.statisticalSnapshot.logCount || 0);
      if (Number.isFinite(Number(row.statisticalSnapshot.allTimeAverage))) rec.avgValues.push(Number(row.statisticalSnapshot.allTimeAverage));
      if (Number.isFinite(Number(row.statisticalSnapshot.targetHitRate))) rec.hitRates.push(Number(row.statisticalSnapshot.targetHitRate));
      if (row.targetCalibration?.health?.state === "too_hard") rec.tooHard += 1;
      if (row.targetCalibration?.health?.state === "too_easy") rec.tooEasy += 1;
      if (row.targetCalibration?.health?.state === "productive") rec.productive += 1;
    });
  });
  return Object.values(skillRows).map(s => ({
    skill: s.skill,
    label: skillLabel(s.skill),
    routineCount: s.routines,
    logCount: s.logCount,
    averageScore: s.avgValues.length ? avg(s.avgValues) : null,
    averageTargetHitRate: s.hitRates.length ? avg(s.hitRates) : null,
    targetHealthMix: {tooHard:s.tooHard, tooEasy:s.tooEasy, productive:s.productive}
  })).sort((a,b) => b.logCount - a.logCount);
}


function buildAiCoachingExecutiveSummary(playerProfile, routineSnapshots, targetCalibrationCandidates) {
  const mature = routineSnapshots.filter(r => Number(r.statisticalSnapshot?.logCount || 0) >= 6);
  const tooHard = mature.filter(r => r.targetCalibration?.health?.state === "too_hard");
  const productive = mature.filter(r => r.targetCalibration?.health?.state === "productive");
  const volatile = routineSnapshots.filter(r => r.targetCalibration?.health?.state === "volatile");
  const insufficient = routineSnapshots.filter(r => r.targetCalibration?.health?.state === "insufficient_data");
  const schemaFlags = routineSnapshots.flatMap(r => (r.statisticalSnapshot?.schemaFlags || []).map(f => ({routineId:r.routine.id, routineName:r.routine.name, ...f})));
  const topRecalibration = targetCalibrationCandidates
    .filter(c => c.suggestion && c.confidence !== "low")
    .slice(0, 8);
  return {
    summary: "Snooker coaching snapshot generated for routine target calibration, skill prioritization, and next-block planning.",
    maturityCounts: {mature:mature.length, insufficient:insufficient.length, volatile:volatile.length},
    targetHealthCounts: {tooHard:tooHard.length, productive:productive.length, candidates:targetCalibrationCandidates.length},
    warningFlags: schemaFlags.slice(0, 20),
    topRecalibrationCandidates: topRecalibration,
    recommendation: playerProfile?.globalTargetHitRate !== null && Number(playerProfile.globalTargetHitRate) < 25
      ? "Most targets are currently above the productive range. Prioritize repeatable core routines and one-step target reductions, not broad routine expansion."
      : "Targets appear broadly usable. Prioritize stable repetition and only recalibrate mature routines."
  };
}

function buildAiCoachingSnapshot(options = {}) {
  const includeRawRecentLogs = options.includeRawRecentLogs !== false;
  const routines = activeRoutines();
  const logs = (data.logs || []).slice().sort((a,b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
  const grouped = getLogsByRoutineMap(logs);
  const routineSnapshots = routines.map(r => buildAiRoutineSnapshot(r, grouped));
  const targetCalibrationCandidates = routineSnapshots
    .filter(r => r.targetCalibration?.suggestion)
    .map(r => ({
      routineId: r.routine.id,
      canonicalId: r.routine.canonicalId,
      routineName: r.routine.name,
      scoring: r.routine.scoring,
      health: r.targetCalibration.health,
      suggestion: r.targetCalibration.suggestion,
      recentAverageLast10: r.statisticalSnapshot.recentAverageLast10,
      targetHitRate: r.statisticalSnapshot.targetHitRate,
      logCount: r.statisticalSnapshot.logCount,
      confidence: r.targetCalibration.suggestion?.confidence || r.targetCalibration.health?.confidence || "low",
      maturity: r.targetCalibration.maturity || r.statisticalSnapshot.maturity || null,
      schemaFlags: r.targetCalibration.schemaFlags || []
    }));
  const globalValues = logs.map(l => Number(l.normalizedScore || 0)).filter(Number.isFinite);
  const playerProfile = {
    totalRoutines: routines.length,
    totalLogs: logs.length,
    totalSessions: (data.sessions || []).length,
    totalPracticeMinutes: logs.reduce((sum,l)=>sum + Number(l.timeMinutes || 0), 0),
    firstLogAt: logs[0]?.createdAt || null,
    lastLogAt: logs[logs.length - 1]?.createdAt || null,
    globalAverage: globalValues.length ? avg(globalValues) : null,
    globalVolatility: globalValues.length >= 3 ? stdDev(globalValues) : null,
    globalTargetHitRate: targetHitRate(logs),
    currentForm: aiTry("globalCurrentForm", () => estimateCurrentFormForLogs(logs), null),
    performanceStability: aiTry("globalPerformanceStability", () => performanceStabilityIndex(logs, 10), null),
    fatigueSlope: aiTry("globalFatigueSlope", () => cachedFatigueSlope(logs), null),
    plateau: aiTry("globalPlateau", () => plateauDetector(logs, 8), null),
    overtraining: aiTry("globalOvertraining", () => overtrainingSignal(logs, 8), null),
    targetCredibleInterval: aiTry("globalTargetCredibleInterval", () => targetCredibleIntervalForLogs(logs), null),
    changePoint: aiTry("globalChangePoint", () => detectSeriesChangePoint(globalValues, {minN:10, maxWindow:150}), null),
    forecast: aiTry("globalForecast", () => forecastWithConfidence(logs, 5), null)
  };
  const skillProfile = buildAiSkillProfile(routineSnapshots);
  const coachingSummary = buildAiCoachingExecutiveSummary(playerProfile, routineSnapshots, targetCalibrationCandidates);
  return {
    exportType: "snooker_ai_coaching_snapshot",
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    purpose: "AI-readable snooker practice coaching export for target calibration, routine prioritization, skill-gap analysis, and training-plan recommendations.",
    privacy: {
      localOnlySource: true,
      containsPersonalPracticeData: true,
      recommendation: "Share only with AI/tools you trust. This file may include notes, timestamps, and performance history."
    },
    instructionsForAI: {
      sport: "snooker",
      context: "The data describes snooker practice routines, logs, scoring modes, targets, cue-ball/control skills, safety/tactical skills, break-building, pressure practice, and match-preparation signals.",
      task: "Analyze the player's snooker routine performance and recommend target adjustments, routine prioritization, skill focus, and next-session structure.",
      interpretationRules: [
        "Do not recommend changing a snooker routine target if sample size is too small, the routine is immature, or volatility is very high.",
        "For technical potting drills, prefer targets that keep recent success roughly in the 55% to 75% band.",
        "For safety/tactical snooker drills, a productive band is often closer to 50% to 70% because quality of leave matters, not only success count.",
        "For pressure drills, productive success may be 35% to 60%; do not treat lower success as automatically bad.",
        "For progressive completion or break-building routines, judge improvement using trend, consistency, and total-units context rather than one isolated score.",
        "Preserve historical target versions. Recommend creating a new target profile rather than overwriting old logs.",
        "Prefer one-step target changes. Do not collapse a target from 50 to 10 unless the evidence is mature and the routine design itself is inappropriate.",
        "When mixed scoring modes or legacy points logs are flagged, treat target advice as conservative and mention the data-quality caveat.",
        "Distinguish between global player level and skill-specific level. A player can be strong at break-building but weak at safety or long potting.",
        "Prioritize recommendations that increase transfer to real snooker frames, not only isolated drill scores."
      ],
      requestedOutputFormat: [
        "Summarize current strengths and weaknesses by snooker skill category.",
        "List routines that are too hard, too easy, or in the productive band.",
        "Recommend target changes with current target, suggested target, rationale, and confidence.",
        "Recommend 5-10 priority routines for the next training block.",
        "Identify tags/metadata that appear inconsistent or missing."
      ]
    },
    coachingSummary,
    playerProfile,
    skillProfile,
    targetCalibrationCandidates,
    routineSnapshots,
    recentLogs: includeRawRecentLogs ? aiRecentEvidenceLogs(logs, 100) : [],
    metadata: {
      routinePackSchemaVersion: ROUTINE_PACK_SCHEMA_VERSION,
      exportLimits: {globalRecentLogs:100, perRoutineRecentLogs:20, targetHistoryPerRoutine:8},
      generatedBy: "Snooker Practice PWA AI Coaching Export"
    }
  };
}

async function exportAiCoachingSnapshot() {
  const payload = buildAiCoachingSnapshot({includeRawRecentLogs:true});
  const filename = `snooker-ai-coaching-export-${APP_VERSION}-${new Date().toISOString().slice(0,10)}.json`;
  await exportFile(filename, JSON.stringify(payload), "application/json");
  showTransientNotice("Target calibration v2 created.", "ok");
}

async function importRoutinePackFile(event) {
  const input = event?.target;
  const file = input?.files?.[0];
  if (!file) return;
  const maxBytes = 8 * 1024 * 1024;
  const lowerName = String(file.name || "").toLowerCase();
  if (file.size > maxBytes) {
    input.value = "";
    return alert("Routine pack is too large. Maximum size is 8MB.");
  }
  if (!lowerName.endsWith(".json") && file.type !== "application/json") {
    input.value = "";
    return alert("Invalid routine pack type. Please select a .json routine pack file.");
  }
  try {
    const pack = JSON.parse(await file.text());
    const validation = validateRoutinePack(pack);
    if (!validation.ok) {
      return alert(`Routine pack validation failed:\n${validation.errors.slice(0,8).join("\n")}`);
    }
    const preview = [
      `${validation.routineCount} routine(s) found.`,
      validation.warnings.length ? `${validation.warnings.length} warning(s). First: ${validation.warnings[0]}` : "No validation warnings.",
      "Import will add missing catalogue routines and merge metadata into existing routines by canonical ID. Existing user target histories are preserved."
    ].join("\n");
    if (!confirm(`${preview}\n\nContinue import?`)) return;
    const result = mergeRoutinePack(pack, {preserveUserTargets:true, preserveUserDescriptions:true});
    if (!result.ok) return alert(`Routine pack import failed:\n${result.errors.join("\n")}`);
    saveData({render:"all", immediateIDB:true});
    showTransientNotice(`Routine pack imported: ${result.added} added, ${result.updated} updated.`, "ok");
  } catch(error) {
    logAppError(error, "importRoutinePackFile");
    alert("Could not import this routine pack. Export Debug Info if the issue persists.");
  } finally {
    if (input) input.value = "";
  }
}


function exportValue(log, field) {
  if (field === "currentRoutineName") return getRoutineName(log);
  if (field === "currentPlanName") return getPlanName(log);
  if (field === "sessionName") return getPlanName(log);
  if (field === "routineName") return getRoutineName(log);
  if (field === "currentTargetPerformance") return currentTargetPerformance(log);
  const val = log[field] ?? "";
  if (typeof val === "object" && val !== null) {
    try { return JSON.stringify(val); } catch(e) { return String(val); }
  }
  return val;
}

safeOn("exportCsvBtn", "click", async () => {
  const headers = ["createdAt","sessionName","currentPlanName","planNameSnapshot","sessionType","routineName","currentRoutineName","routineNameSnapshot","routineId","folder","subfolder","category","scoring","score","attempts","attemptMode","effectiveAttempts","leftSideScore","rightSideScore","timeMinutes","normalizedScore","performance","sessionRating","sessionTags","bestAttempt","completionCount","highestBreak","totalUnits","unitType","targetMode","targetColour","targetProfileId","targetAtLog","stretchTargetAtLog","difficultyLabelAtLog","currentTargetPerformance","notes"];
  const rows = [headers.join(",")].concat(data.logs.map(l => headers.map(h => csvEscape(exportValue(l, h))).join(",")));
  downloadFile("snooker-practice-logs.csv", rows.join("\n"), "text/csv");
});
safeOn("exportRoutinePackBtn", "click", exportRoutinePackJson);
safeOn("exportRoutineCsvBtn", "click", exportRoutineLibraryCsv);
safeOn("exportAiCoachingBtn", "click", exportAiCoachingSnapshot);
safeOn("importRoutinePackInput", "change", importRoutinePackFile);
safeOn("importRoutineCsvInput", "change", importRoutineLibraryCsvFile);
safeOn("exportJsonBtn", "click", async () => exportFullBackup("manual-json-export"));
safeOn("runRegretBtn", "click", runRegretComparison);
["periodizationPhase","periodizationHorizon","competitionDate"].forEach(id => safeOn(id, "change", event => {
  if (id === "competitionDate") {
    try { localStorage.setItem("snookerPracticePWA.competitionDate", event?.target?.value || ""); } catch(e) { logAppError?.(e, "competitionDate persist"); }
  }
  renderPeriodization();
}));
safeOn("generateAdaptiveSessionBtn", "click", renderAdaptiveSession);
safeOn("loadAdaptiveSessionBtn", "click", loadAdaptiveSessionIntoPlanBuilder);
safeOn("saveTableBtn", "click", saveTableDefinition);
safeOn("clearTableFormBtn", "click", clearTableForm);
safeOn("chooseExportFolderBtn", "click", chooseExportFolder);
safeOn("clearExportFolderBtn", "click", clearExportFolder);
safeOn("exportDebugBtn", "click", exportDebugInfo);
safeOn("exportRawStorageBtn", "click", exportRawLocalData);
$("refreshStorageDashboardBtn")?.addEventListener("click", renderStorageDashboard);
$("preMigrationBackupBtn")?.addEventListener("click", async () => exportFullBackup("pre-indexeddb-migration"));
function clearVolatileDatasetKeysForImport() {
  const keys = [
    "snookerPracticePWA.activeSessionDraft",
    "snookerPracticePWA.pressureDraft",
    "snookerPracticePWA.lastTableId",
    LAST_TABLE_NOTE_KEY,
    "snookerPracticePWA.errorLog",
    "snookerPracticePWA.compDate"
  ];
  keys.forEach(key => { try { localStorage.removeItem(key); } catch(e) {} });
}

function validateBackupShape(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {ok:false, message:"Backup is not a JSON object."};
  const requiredArrays = ["routines", "plans", "logs", "sessions"];
  const missing = requiredArrays.filter(k => !Array.isArray(candidate[k]));
  if (missing.length) return {ok:false, message:`Backup is missing required array(s): ${missing.join(", ")}.`};
  const badRoutine = candidate.routines.find(r => !r || typeof r !== "object" || !r.id || !r.name);
  if (badRoutine) return {ok:false, message:"At least one routine is missing an id or name."};
  const badLog = candidate.logs.find(l => !l || typeof l !== "object" || !l.id || !l.createdAt);
  if (badLog) return {ok:false, message:"At least one log is missing an id or createdAt timestamp."};
  return {ok:true};
}
safeOn("importJsonInput", "change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const maxBackupBytes = 25 * 1024 * 1024;
  const lowerName = String(file.name || "").toLowerCase();
  if (file.size > maxBackupBytes) {
    e.target.value = "";
    return alert("File is too large. Maximum backup size is 25MB.");
  }
  if (!lowerName.endsWith(".json") && file.type !== "application/json") {
    e.target.value = "";
    return alert("Invalid file type. Please select a .json backup file.");
  }
  try {
    const raw = JSON.parse(await file.text());
    const precheck = validateBackupShape(raw);
    if (!precheck.ok) return alert(`Invalid backup file. ${precheck.message}`);
    const baseImport = structuredCloneSafe(defaultData);
    const allowedImportKeys = new Set([
      ...Object.keys(baseImport),
      "backupVersion", "exportedAt", "appVersion", "updatedAt", "createdAt",
      "indexedDBStorage", "smartSessionBuilder", "interfaceSettings", "routineSkillMap",
      "skillTaxonomy", "skillTrendCache", "recommendationFeedback"
    ]);
    Object.keys(raw || {}).forEach(key => {
      if (allowedImportKeys.has(key)) baseImport[key] = raw[key];
    });
    const imported = migrateData(baseImport);
    const postcheck = validateBackupShape(imported);
    if (!postcheck.ok) return alert(`Invalid backup after migration. ${postcheck.message}`);
    if (activeSession) {
      stopTimer();
      activeSession = null;
      clearPersistedActiveSession();
      $("activeSession")?.classList.add("hidden");
      $("freeNextCard")?.classList.add("hidden");
    }
    if (pressureSession) {
      pressureSession = null;
      persistPressureSession?.();
      $("pressureSessionPanel")?.classList.add("hidden");
    }
    clearVolatileDatasetKeysForImport();
    data = imported;
    storageReadOnlyMode = false;
    indexedDBUnavailable = false;
    const idbOk = await persistIndexedDBCollections("backup import indexedDB replace");
    if (!idbOk && storageReadOnlyMode) return alert("Import loaded in memory, but device storage is full. Export a backup or free space before continuing.");
    saveData({idbSync:"skip"});
    alert("Backup imported.");
  } catch (err) {
    logAppError(err, "importJsonInput validation/import");
    alert("Import failed. The selected file is not a valid Snooker Practice JSON backup.");
  } finally {
    e.target.value = "";
  }
});
safeOn("clearDataBtn", "click", async () => {
  if (!allowRateLimitedOperation("clearData", 3, 300000, "Clear-data action is temporarily rate-limited.")) return;
  if (!confirm("Clear all data? This cannot be undone unless you have exported a backup.")) return;
  localStorage.removeItem(STORAGE_KEY);
  try { await idbReplaceAll(INDEXEDDB_LOG_STORE, []); await idbReplaceAll(INDEXEDDB_SESSION_STORE, []); } catch(e) { logAppError(e, "clearData indexedDB clear"); }
  data = loadData();
  renderAll();
});
async function downloadFile(filename, content, type) {
  const blob = new Blob([content], {type});
  try {
    if (isIOSSafariLike() && typeof File !== "undefined" && navigator.canShare && navigator.share) {
      const file = new File([blob], filename, {type});
      if (navigator.canShare({files:[file]})) {
        await navigator.share({files:[file], title:filename});
        notifyUser?.("Export shared through iOS share sheet.", "ok");
        return true;
      }
    }
  } catch(e) { logAppError?.(e, "downloadFile share fallback"); }
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch(e) {
    logAppError?.(e, "downloadFile blob fallback");
    try {
      const reader = new FileReader();
      reader.onload = () => { window.location.href = String(reader.result || ""); };
      reader.readAsDataURL(blob);
      return true;
    } catch(ex) { logAppError?.(ex, "downloadFile data-uri fallback"); }
  }
  notifyUser?.("Export could not be started by this browser. Try Export Folder or another browser.", "warn");
  return false;
}
function csvEscape(value) {
  const s = String(value ?? "");
  let escaped = s.replace(/"/g, '""');
  if (/^[=+\-@]/.test(escaped)) escaped = "'" + escaped;
  return '"' + escaped + '"';
}


function confirmDeleteAction(label, callback) {
  const msg = `Delete ${label}? This cannot be undone unless you have a JSON backup.`;
  if (confirm(msg)) callback();
}
function updateTagHistoryFromInput(raw) {
  const recent = new Set((data.tagHistory || []).map(t => sanitizeTagToken(t)).filter(Boolean));
  String(raw || "").split(",").map(t => sanitizeTagToken(t)).filter(Boolean).forEach(t => recent.add(t));
  data.tagHistory = Array.from(recent).sort().slice(-200);
}
function renderTagSuggestions() {
  const dl = $("tagSuggestions");
  if (!dl) return;
  const tagSet = new Set();
  (data.logs || []).slice(-200).forEach(l => String(l.sessionTags || "").split(",").map(t => sanitizeTagToken(t)).filter(Boolean).forEach(t => tagSet.add(t)));
  (data.tagHistory || []).slice(-100).map(t => sanitizeTagToken(t)).filter(Boolean).forEach(t => tagSet.add(t));
  dl.innerHTML = Array.from(tagSet).sort().slice(0,200).map(t => `<option value="${escapeAttr(t)}"></option>`).join("");
}
function progressiveUnitLabel(r) {
  return ({
    balls_cleared:"balls cleared",
    points_scored:"points scored",
    pairs_completed:"pairs completed",
    steps_completed:"steps completed"
  })[r.unitType || "balls_cleared"] || "units";
}
function progressiveStatsForLogs(logs) {
  const pc = logs.filter(l => l.scoring === "progressive_completion");
  if (!pc.length) return null;
  const avgCompletion = avg(pc.map(l => Number(l.normalizedScore || 0)));
  const bestAttempt = safeMax(pc.map(l => {
    const raw = l.bestAttempt !== undefined && l.bestAttempt !== null && l.bestAttempt !== "" ? l.bestAttempt : l.score;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }), 0);
  const completionCount = pc.filter(l => Number(l.completionCount || 0) > 0 || Number(l.normalizedScore || 0) >= 100).length;
  const highestBreak = Math.max(0, safeMax(pc.map(l => Number(l.highestBreak || 0)), 0));
  return {avgCompletion, bestAttempt, completionCount, highestBreak, count:pc.length};
}




function inferTargetColour(targetMode) {
  if (targetMode === "blacks_only") return "black";
  return "";
}
function fmtTargetColour(colour) {
  return ({
    red:"Red",
    yellow:"Yellow",
    green:"Green",
    brown:"Brown",
    blue:"Blue",
    pink:"Pink",
    black:"Black",
    custom:"Custom / other"
  })[colour || ""] || "Not applicable";
}
function fmtTargetMode(mode) {
  return ({
    blacks_only:"Blacks only",
    mixed_colours:"Mixed colours",
    nominated_colour:"Nominated colour",
    custom:"Custom"
  })[mode || ""] || "Custom";
}


function makeTargetProfile(routine, label) {
  return {
    id: uuid(),
    effectiveFrom: new Date().toISOString(),
    target: Number(routine.target || 0) || "",
    stretchTarget: Number(routine.stretchTarget || 0) || "",
    totalUnits: Number(routine.totalUnits || 0) || "",
    attemptsPerSession: Number(routine.attemptsPerSession || routine.attempts || 0) || "",
    difficultyLabel: label || routine.difficultyLabel || "Base target",
    scoring: routine.scoring || "raw"
  };
}
function ensureTargetHistory(routine) {
  routine.targetHistory = routine.targetHistory || [];
  if (!routine.targetHistory.length) {
    routine.targetHistory.push(makeTargetProfile(routine, routine.difficultyLabel || "Base target"));
    routine.activeTargetProfileId = routine.targetHistory[0].id;
  }
  if (!routine.activeTargetProfileId) routine.activeTargetProfileId = routine.targetHistory[routine.targetHistory.length-1].id;
  return routine;
}
function getActiveTargetProfile(routine) {
  if (!routine) return null;
  ensureTargetHistory(routine);
  return routine.targetHistory.find(p => p.id === routine.activeTargetProfileId) || routine.targetHistory[routine.targetHistory.length-1] || null;
}
function hasTargetProfileChanged(oldRoutine, newRoutine) {
  if (!oldRoutine) return false;
  return Number(oldRoutine.target || 0) !== Number(newRoutine.target || 0)
    || Number(oldRoutine.stretchTarget || 0) !== Number(newRoutine.stretchTarget || 0)
    || Number(oldRoutine.totalUnits || 0) !== Number(newRoutine.totalUnits || 0)
    || Number(oldRoutine.attemptsPerSession || oldRoutine.attempts || 0) !== Number(newRoutine.attemptsPerSession || newRoutine.attempts || 0)
    || (oldRoutine.scoring || "") !== (newRoutine.scoring || "");
}
function classifyPerformanceAgainstTarget(normalizedScore, targetAtLog, stretchTargetAtLog) {
  const target = Number(targetAtLog || 0);
  const stretch = Number(stretchTargetAtLog || 0);
  const s = Number(normalizedScore || 0);
  if (!target) return "N/A";
  const eps = 0.0001;
  if (stretch && s + eps >= stretch) return "Above Target";
  if (s + eps >= target) return "On Target";
  return "Fail";
}
function currentTargetPerformance(log) {
  const r = routineById(log.routineId);
  if (!r) return log.performance || "N/A";
  const p = getActiveTargetProfile(r);
  return classifyPerformanceAgainstTarget(log.normalizedScore, p?.target || r.target, p?.stretchTarget || r.stretchTarget);
}
function getTargetProfileLabel(log) {
  return log.difficultyLabelAtLog || log.targetProfileLabel || "Legacy / unversioned";
}

function planById(id) {
  return (data.plans || []).find(p => p.id === id);
}
function getRoutineName(logOrId) {
  const id = typeof logOrId === "string" ? logOrId : logOrId?.routineId;
  const fallback = typeof logOrId === "string" ? "" : (logOrId?.routineName || logOrId?.routineNameSnapshot || "");
  return routineById(id)?.name || fallback || "Deleted exercise";
}
function getPlanName(logOrSessionOrId) {
  const id = typeof logOrSessionOrId === "string" ? logOrSessionOrId : (logOrSessionOrId?.planId || logOrSessionOrId?.sessionPlanId);
  const fallback = typeof logOrSessionOrId === "string" ? "" : (logOrSessionOrId?.sessionName || logOrSessionOrId?.planName || logOrSessionOrId?.planNameSnapshot || logOrSessionOrId?.name || "");
  return planById(id)?.name || fallback || "Deleted / free session";
}
function enrichLogReferences(log) {
  const r = routineById(log.routineId);
  if (r) {
    log.routineNameSnapshot = log.routineNameSnapshot || log.routineName || r.name;
    log.routineName = r.name;
    log.category = log.category || r.category || "uncategorized";
    log.folder = log.folder || r.folder || "Unfiled";
    log.subfolder = log.subfolder || r.subfolder || "General";
  }
  const p = planById(log.planId || log.sessionPlanId);
  if (p) {
    log.planNameSnapshot = log.planNameSnapshot || log.sessionName || p.name;
    log.sessionName = p.name;
  }
  return log;
}
function refreshReferenceNames() {
  if (!data) return false;
  let mutated = false;
  data.logs = (data.logs || []).map(log => {
    const before = `${log.routineNameSnapshot || ""}|${log.currentRoutineName || ""}|${log.planNameSnapshot || ""}|${log.sessionName || ""}`;
    const enriched = enrichLogReferences(log);
    const after = `${enriched.routineNameSnapshot || ""}|${enriched.currentRoutineName || ""}|${enriched.planNameSnapshot || ""}|${enriched.sessionName || ""}`;
    if (before !== after) mutated = true;
    return enriched;
  });
  data.sessions = (data.sessions || []).map(s => {
    const before = `${s.planNameSnapshot || ""}|${s.name || ""}`;
    const p = planById(s.planId);
    if (p) {
      s.planNameSnapshot = s.planNameSnapshot || s.name || p.name;
      s.name = p.name;
    }
    const after = `${s.planNameSnapshot || ""}|${s.name || ""}`;
    if (before !== after) mutated = true;
    return s;
  });
  return mutated;
}


function logAppError(error, context="runtime") {
  try {
    let errors = [];
    try {
      const parsed = JSON.parse(localStorage.getItem("snookerPracticePWA.errorLog") || "[]");
      errors = Array.isArray(parsed) ? parsed.slice(0,5) : [];
    } catch(parseError) {
      errors = [];
      try { localStorage.removeItem("snookerPracticePWA.errorLog"); } catch(_) {}
    }
    let safeMessage = "Unknown error";
    let safeStack = "";
    try {
      if (typeof error === "string") safeMessage = error;
      else if (error instanceof Error) { safeMessage = error.message || safeMessage; safeStack = error.stack || ""; }
      else if (error && typeof error.message === "string") safeMessage = error.message;
      else if (error && typeof error.toString === "function") safeMessage = error.toString();
    } catch(ex) { safeMessage = "Unserializable error"; }
    errors.unshift({
      at: new Date().toISOString(),
      appVersion: typeof APP_VERSION !== "undefined" ? APP_VERSION : "unknown",
      location: typeof location !== "undefined" ? location.href : "",
      context:String(context || "runtime").slice(0,160),
      message:String(safeMessage || "Unknown error").slice(0,500),
      stack:String(safeStack || "").slice(0,1000)
    });
    localStorage.setItem("snookerPracticePWA.errorLog", JSON.stringify(errors.slice(0,5)));
  } catch(e) {}
}
window.addEventListener("error", e => logAppError(e.error || e.message, "window.error"));
window.addEventListener("unhandledrejection", e => logAppError(e.reason || "Unhandled promise rejection", "unhandledrejection"));


function safeStorageSet(key, value, context="safeStorageSet", force=false) {
  if (storageReadOnlyMode && !force) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch(e) {
    logAppError(e, context);
    if (isQuotaError(e)) {
      notifyUser("Storage appears full. Export JSON Backup and Raw Local Data before continuing.", "warn");
      if (key === STORAGE_KEY) enterStorageReadOnlyMode(context);
    } else {
      notifyUser("Could not save local data. Export a backup/debug file before continuing.", "warn");
    }
    return false;
  }
}
function storageSizeBytes() {
  try {
    return new Blob([localStorage.getItem(STORAGE_KEY) || ""]).size;
  } catch(e) {
    return 0;
  }
}
function renderStorageWarning() {
  const bytes = storageSizeBytes();
  if (bytes > 4.5 * 1024 * 1024) {
    console.warn("Snooker app storage is above 4.5MB; export backup recommended.");
  }
  if (typeof renderStorageDashboard === "function" && isPanelActive("data")) renderStorageDashboard();
}

function formatStorageBytes(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${Math.max(0, Math.round(n))} B`;
}
function getLocalStorageUsageBytes() {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || "";
      const value = localStorage.getItem(key) || "";
      total += new Blob([key + value]).size;
    }
  } catch(e) {
    logAppError(e, "getLocalStorageUsageBytes");
  }
  return total;
}
function indexedDBStatusText() {
  if (indexedDBUnavailable) return "Fallback";
  if (indexedDBReady) return "Active";
  return "Initializing";
}
function estimatedIndexedDBDataBytes() {
  try { return new Blob([JSON.stringify(data.logs || []), JSON.stringify(data.sessions || [])]).size; }
  catch(e) { return 0; }
}
function storageRiskLevel(mainBytes, totalBytes) {
  const assumedLimit = 5 * 1024 * 1024;
  const ratio = Math.max(mainBytes, totalBytes) / assumedLimit;
  if (ratio >= 0.90) return {label:"Critical", cls:"risk", text:"Export a full backup now. New saves may fail soon."};
  if (ratio >= 0.70) return {label:"High", cls:"watch", text:"Plan the IndexedDB migration before adding many more logs."};
  if (ratio >= 0.45) return {label:"Moderate", cls:"watch", text:"Storage is still usable, but backups should be routine."};
  return {label:"Low", cls:"good", text:"Current local storage usage is well below the usual browser ceiling."};
}
function renderStorageDashboard() {
  const box = $("storageDashboard");
  if (!box) return;
  const mainBytes = storageSizeBytes();
  const totalBytes = getLocalStorageUsageBytes();
  const assumedLimit = 5 * 1024 * 1024;
  const pct = Math.min(999, (Math.max(mainBytes, totalBytes) / assumedLimit) * 100);
  const risk = storageRiskLevel(mainBytes, totalBytes);
  const lastBackup = localStorage.getItem("snookerPracticePWA.lastBackupAt") || "";
  const backupDays = daysSinceIso(lastBackup);
  const activeCount = (data.routines || []).filter(r => !r.isDeleted).length;
  const archivedCount = (data.routines || []).filter(r => r.isDeleted).length;
  const errorCount = (() => { try { return JSON.parse(localStorage.getItem("snookerPracticePWA.errorLog") || "[]").length; } catch(e) { return 0; } })();
  const backupText = lastBackup
    ? `${Number.isFinite(backupDays) ? backupDays : "?"} day${backupDays === 1 ? "" : "s"} ago`
    : "Never exported from this browser";
  box.innerHTML = `<div class="storage-status storage-${safeClassToken(risk.cls, ["good","watch","risk"], "watch")}">
    <div class="storage-status-top"><strong>Storage risk: ${htmlText(risk.label)}</strong><span>${numText(pct, "0.0")}% of assumed 5 MB localStorage limit</span></div>
    <p>${htmlText(risk.text)}</p>
    <div class="stats-grid storage-grid">
      <div class="stat-card"><span>Main app data</span><div class="value">${htmlText(formatStorageBytes(mainBytes))}</div></div>
      <div class="stat-card"><span>Total localStorage</span><div class="value">${htmlText(formatStorageBytes(totalBytes))}</div></div>
      <div class="stat-card"><span>IndexedDB</span><div class="value">${htmlText(indexedDBStatusText())}</div></div>
      <div class="stat-card"><span>IDB logs/sessions estimate</span><div class="value">${htmlText(formatStorageBytes(estimatedIndexedDBDataBytes()))}</div></div>
      <div class="stat-card"><span>Loaded version</span><div class="value">${htmlText(APP_VERSION)}</div></div>
      <div class="stat-card"><span>Build timestamp</span><div class="value">${htmlText(APP_BUILD_TIMESTAMP)}</div></div>
      <div class="stat-card"><span>Page URL version</span><div class="value">${htmlText(new URLSearchParams(location.search).get("v") || "none")}</div></div>
      <div class="stat-card"><span>Last full backup</span><div class="value storage-backup-value">${htmlText(backupText)}</div></div>
      <div class="stat-card"><span>Logs</span><div class="value">${numText((data.logs || []).length, "0")}</div></div>
      <div class="stat-card"><span>Sessions</span><div class="value">${numText((data.sessions || []).length, "0")}</div></div>
      <div class="stat-card"><span>Exercises</span><div class="value">${numText(activeCount, "0")}${archivedCount ? `<small> + ${numText(archivedCount, "0")} archived</small>` : ""}</div></div>
      <div class="stat-card"><span>Plans</span><div class="value">${numText((data.plans || []).length, "0")}</div></div>
      <div class="stat-card"><span>Tables</span><div class="value">${numText((data.tables || []).length, "0")}</div></div>
      <div class="stat-card"><span>Recent errors</span><div class="value">${numText(errorCount, "0")}</div></div>
    </div>
    <p class="muted">Logs and sessions now live in IndexedDB when available. The 5 MB limit applies mainly to localStorage; IndexedDB normally supports much larger datasets, but full backups are still recommended before major imports or browser changes.</p>
  </div>`;
}

async function exportFullBackup(reason="manual") {
  markBackupExported();
  const payload = {
    ...data,
    backupVersion: APP_VERSION,
    backupReason: reason,
    exportedAt: new Date().toISOString(),
    storageSummary: {
      mainDataBytes: storageSizeBytes(),
      totalLocalStorageBytes: getLocalStorageUsageBytes(),
      logs: (data.logs || []).length,
      sessions: (data.sessions || []).length,
      routines: (data.routines || []).length,
      plans: (data.plans || []).length,
      tables: (data.tables || []).length
    }
  };
  await exportFile(`snooker-practice-backup-${APP_VERSION}-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload), "application/json");
  renderBackupReminder();
  renderStorageDashboard();
}

function safeParseData(raw) {
  try {
    return JSON.parse(raw);
  } catch(e) {
    logAppError(e, "JSON.parse localStorage");
    return null;
  }
}
function markBackupExported() {
  localStorage.setItem("snookerPracticePWA.lastBackupAt", new Date().toISOString());
}
function daysSinceIso(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}
function renderBackupReminder() {
  const el = $("backupReminderBanner");
  if (!el) return;
  const last = localStorage.getItem("snookerPracticePWA.lastBackupAt");
  const days = daysSinceIso(last);
  if (days >= 30 && (data.logs || []).length) {
    el.classList.remove("hidden");
    el.innerHTML = `Backup reminder: you have not exported a JSON backup ${Number.isFinite(days) ? "in "+days+" days" : "yet"}. <button class="secondary" data-action="open-data-tab">Go to Data</button>`;
  } else {
    el.classList.add("hidden");
    el.innerHTML = "";
  }
}

async function exportRawLocalData() {
  const payload = {
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    storageKey: STORAGE_KEY,
    rawMainData: localStorage.getItem(STORAGE_KEY),
    indexedDBStatus: indexedDBStatusText(),
    indexedDBMemorySnapshot: {logs: data.logs || [], sessions: data.sessions || []},
    activeSessionDraft: localStorage.getItem("snookerPracticePWA.activeSessionDraft"),
    lastVenueTable: localStorage.getItem("snookerPracticePWA.lastVenueTable"),
    lastTableId: localStorage.getItem("snookerPracticePWA.lastTableId"),
    lastTableNote: localStorage.getItem("snookerPracticePWA.lastTableNote"),
    errorLog: localStorage.getItem("snookerPracticePWA.errorLog")
  };
  await exportFile(`snooker-raw-local-data-${APP_VERSION}-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload,null,2), "application/json");
}

async function exportDebugInfo() {
  const payload = {
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    userAgent: String(navigator.userAgent || "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0,500),
    location: String(location.href || "").replace(/[\u0000-\u001f\u007f]/g, "").slice(0,500),
    urlVersionParam: new URLSearchParams(location.search).get("v") || "",
    counts: {
      routines: (data.routines || []).length,
      plans: (data.plans || []).length,
      sessions: (data.sessions || []).length,
      logs: (data.logs || []).length
    },
    errors: JSON.parse(localStorage.getItem("snookerPracticePWA.errorLog") || "[]"),
    lastBackupAt: localStorage.getItem("snookerPracticePWA.lastBackupAt") || "",
    indexedDBStatus: indexedDBStatusText(),
    indexedDBEstimatedBytes: estimatedIndexedDBDataBytes()
  };
  await exportFile(`snooker-debug-${APP_VERSION}-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload,null,2), "application/json");
}

function setDiagnosticsOutput(html, cls="analytics-note") {
  const out = $("storageIntegrityOutput");
  if (!out) return;
  out.className = cls;
  out.innerHTML = html;
}
function syncLoadedVersionDisplay() {
  const el = $("loadedVersionDisplay");
  if (el) el.value = `${APP_VERSION} · Build ${APP_BUILD_TIMESTAMP} · URL v=${new URLSearchParams(location.search).get("v") || "none"}`;
}
async function idbCount(storeName) {
  if (indexedDBUnavailable) return null;
  try {
    const db = await openSnookerDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  } catch(e) {
    logAppError(e, `idbCount ${storeName}`);
    return null;
  }
}
function duplicateIds(rows) {
  const seen = new Set(), dup = new Set();
  (rows || []).forEach(r => {
    if (!r || !r.id) return;
    if (seen.has(r.id)) dup.add(r.id);
    seen.add(r.id);
  });
  return [...dup];
}
async function verifyStorageIntegrity() {
  try {
    syncLoadedVersionDisplay();
    const idbLogs = indexedDBUnavailable ? [] : await idbGetAll(INDEXEDDB_LOG_STORE);
    const idbSessions = indexedDBUnavailable ? [] : await idbGetAll(INDEXEDDB_SESSION_STORE);
    const rawCore = localStorage.getItem(STORAGE_KEY) || "";
    const core = rawCore ? safeParseData(rawCore) : null;
    const coreLogs = Array.isArray(core?.logs) ? core.logs.length : 0;
    const coreSessions = Array.isArray(core?.sessions) ? core.sessions.length : 0;
    const memoryLogs = (data.logs || []).length;
    const memorySessions = (data.sessions || []).length;
    const exportPayload = {...data, backupVersion: APP_VERSION, exportedAt: new Date().toISOString()};
    const exportLogs = Array.isArray(exportPayload.logs) ? exportPayload.logs.length : 0;
    const exportSessions = Array.isArray(exportPayload.sessions) ? exportPayload.sessions.length : 0;
    const idbLogCount = indexedDBUnavailable ? null : idbLogs.length;
    const idbSessionCount = indexedDBUnavailable ? null : idbSessions.length;
    const logDups = duplicateIds(data.logs || []);
    const sessionDups = duplicateIds(data.sessions || []);
    const localCoreCompact = !indexedDBUnavailable && coreLogs === 0 && coreSessions === 0;
    const countsMatch = indexedDBUnavailable
      ? true
      : memoryLogs === idbLogCount && memorySessions === idbSessionCount && exportLogs === memoryLogs && exportSessions === memorySessions;
    const ok = countsMatch && !logDups.length && !sessionDups.length;
    const warnings = [];
    if (!localCoreCompact && !indexedDBUnavailable) warnings.push("localStorage core still contains logs/sessions; compact core expected after IndexedDB migration.");
    if (new URLSearchParams(location.search).get("v") && new URLSearchParams(location.search).get("v") !== APP_VERSION.replace("-final", "")) warnings.push("URL version parameter differs from loaded APP_VERSION; this can be normal after GitHub cache updates but should be watched.");
    if (logDups.length) warnings.push(`${logDups.length} duplicate log id(s) detected.`);
    if (sessionDups.length) warnings.push(`${sessionDups.length} duplicate session id(s) detected.`);
    const rows = [
      ["Memory logs", memoryLogs],
      ["IndexedDB logs", idbLogCount === null ? "Unavailable" : idbLogCount],
      ["Backup-export logs", exportLogs],
      ["Core localStorage logs", coreLogs],
      ["Memory sessions", memorySessions],
      ["IndexedDB sessions", idbSessionCount === null ? "Unavailable" : idbSessionCount],
      ["Backup-export sessions", exportSessions],
      ["Core localStorage sessions", coreSessions],
      ["IndexedDB status", indexedDBStatusText()],
      ["Main core size", formatStorageBytes(storageSizeBytes())],
      ["Total localStorage", formatStorageBytes(getLocalStorageUsageBytes())],
      ["IDB estimate", formatStorageBytes(estimatedIndexedDBDataBytes())]
    ];
    setDiagnosticsOutput(`<strong>Integrity check: ${ok ? "PASS" : "REVIEW REQUIRED"}</strong>
      <table class="history-table"><tbody>${rows.map(r => `<tr><td>${htmlText(r[0])}</td><td>${htmlText(r[1])}</td></tr>`).join("")}</tbody></table>
      ${warnings.length ? `<div class="warning-note"><strong>Warnings</strong><ul>${warnings.map(w => `<li>${htmlText(w)}</li>`).join("")}</ul></div>` : `<p class="muted">Counts match across memory, IndexedDB, and backup payload. No duplicate ids detected.</p>`}`, ok ? "analytics-note storage-good" : "analytics-note storage-watch");
    renderStorageDashboard();
  } catch(e) {
    logAppError(e, "verifyStorageIntegrity");
    setDiagnosticsOutput(`<strong>Integrity check failed:</strong> ${htmlText(e.message || e)}`, "warning-note");
  }
}
function makeSyntheticLog(routine, session, index, batchId) {
  const created = new Date(Date.now() - (index * 60000)).toISOString();
  const scoring = routine?.scoring || "success_rate";
  const attempts = Number(routine?.attempts || routine?.attemptsPerSession || 10) || 10;
  const made = scoring === "success_rate" ? index % (attempts + 1) : ((index * 7) % 100);
  const score = scoring === "success_rate" ? made : scoreNumberForSynthetic(index, scoring);
  const log = {
    id: `test-log-${batchId}-${index}`,
    isTestData: true,
    testBatchId: batchId,
    sessionId: session.id,
    sessionName: session.name,
    sessionType: "test",
    planId: "",
    routineId: routine?.id || "test-routine-missing",
    routineName: routine?.name || "Synthetic test routine",
    routineNameSnapshot: routine?.name || "Synthetic test routine",
    folder: routine?.folder || "Diagnostics",
    subfolder: routine?.subfolder || "Storage test",
    category: routine?.category || "diagnostics",
    ...(routine ? skillSnapshotForRoutine(routine) : {}),
    scoring,
    score,
    attempts,
    timeMinutes: 5,
    normalizedScore: 0,
    performance: "N/A",
    tableId: "",
    venueTable: "Storage test",
    venueTableSnapshot: "Storage test",
    sessionRating: 3,
    sessionTags: "storage_test",
    notes: `Synthetic storage test log ${index}`,
    createdAt: created
  };
  log.normalizedScore = normalizeScore(log);
  log.performance = classifyPerformance(log, routine || {});
  return log;
}
function scoreNumberForSynthetic(index, scoring) {
  if (scoring === "points") return ((index % 9) - 4);
  if (scoring === "score_per_minute") return (index * 3) % 80;
  return (index * 7) % 100;
}
async function generateTestLogs() {
  try {
    const n = Math.max(1, Math.min(20000, Number($("testLogCountInput")?.value || 1000)));
    const label = ($("testBatchLabelInput")?.value || "").trim();
    const batchId = `${new Date().toISOString().replace(/[:.]/g,"-")}${label ? "-" + label.replace(/[^a-z0-9_-]/gi,"_") : ""}`;
    const activeRoutines = (data.routines || []).filter(r => !r.isDeleted && r.recommendationMode !== "excluded");
    const fallbackRoutine = activeRoutines[0] || (data.routines || [])[0] || null;
    if (!fallbackRoutine) return alert("Create at least one exercise before generating synthetic test logs.");
    const sessionCount = Math.max(1, Math.ceil(n / 50));
    const sessions = [];
    const logs = [];
    for (let sIdx = 0; sIdx < sessionCount; sIdx++) {
      const session = {
        id: `test-session-${batchId}-${sIdx}`,
        isTestData: true,
        testBatchId: batchId,
        name: `Storage test session ${sIdx + 1}`,
        type: "test",
        startedAt: new Date(Date.now() - ((n + sIdx) * 60000)).toISOString(),
        endedAt: new Date(Date.now() - (sIdx * 60000)).toISOString(),
        logIds: []
      };
      sessions.push(session);
    }
    for (let i = 0; i < n; i++) {
      const routine = activeRoutines.length ? activeRoutines[i % activeRoutines.length] : fallbackRoutine;
      const session = sessions[Math.floor(i / 50) % sessions.length];
      const log = makeSyntheticLog(routine, session, i, batchId);
      session.logIds.push(log.id);
      logs.push(log);
    }
    data.sessions = mergeById(sessions, data.sessions || []);
    data.logs = mergeById(logs, data.logs || []).sort((a,b)=>new Date(a.createdAt||0)-new Date(b.createdAt||0));
    await persistIndexedDBCollections("generateTestLogs");
    saveCoreData("generateTestLogs core save");
    renderAfterSave("all");
    setDiagnosticsOutput(`<strong>Generated ${numText(n, "0")} synthetic logs</strong><p class="muted">Batch: ${htmlText(batchId)}. Use Verify Storage Integrity, then Clear Test Logs Only when finished.</p>`, "analytics-note storage-good");
    await verifyStorageIntegrity();
  } catch(e) {
    logAppError(e, "generateTestLogs");
    alert("Could not generate test logs. Export debug info and review the error log.");
  }
}
async function clearTestLogsOnly() {
  if (!allowRateLimitedOperation("clearTestLogs", 5, 300000, "Test-log cleanup is temporarily rate-limited.")) return;
  if (!confirm("Clear synthetic storage-test logs and sessions only? Real logs are preserved.")) return;
  try {
    const testSessionIds = new Set((data.sessions || []).filter(s => s.isTestData).map(s => s.id));
    data.logs = (data.logs || []).filter(l => !l.isTestData && !testSessionIds.has(l.sessionId));
    data.sessions = (data.sessions || []).filter(s => !s.isTestData);
    await persistIndexedDBCollections("clearTestLogsOnly");
    saveCoreData("clearTestLogsOnly core save");
    renderAfterSave("all");
    setDiagnosticsOutput("<strong>Test logs cleared.</strong>", "analytics-note storage-good");
    await verifyStorageIntegrity();
  } catch(e) {
    logAppError(e, "clearTestLogsOnly");
    alert("Could not clear test logs. Export debug info and review the error log.");
  }
}
function clearErrorLog() {
  localStorage.removeItem("snookerPracticePWA.errorLog");
  renderStorageDashboard();
  setDiagnosticsOutput("<strong>Error log cleared.</strong><p class=\"muted\">Run your test sequence, then export debug info to see only new errors.</p>", "analytics-note storage-good");
}
let storageDiagnosticsBound = false;
function bindStorageDiagnostics() {
  syncLoadedVersionDisplay();
  if (storageDiagnosticsBound) return;
  storageDiagnosticsBound = true;
  $("verifyStorageIntegrityBtn")?.addEventListener("click", verifyStorageIntegrity);
  $("generateTestLogsBtn")?.addEventListener("click", generateTestLogs);
  $("clearTestLogsBtn")?.addEventListener("click", clearTestLogsOnly);
  $("clearErrorLogBtn")?.addEventListener("click", clearErrorLog);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindStorageDiagnostics); else bindStorageDiagnostics();

const FIELD_HELP = {
  targetScore: {
    title: "Target score",
    body: `
      <p><strong>What it means:</strong> the minimum normalized score that counts as a good result for this exercise.</p>
      <div class="example"><strong>Example:</strong> for long potting 10 attempts, a target score of 70 means 7/10 or better.</div>
      <p><strong>Best use:</strong> set a realistic threshold that you can hit around 40–70% of the time. If you hit it almost always, increase difficulty.</p>`
  },
  totalUnits: {
    title: "Total units / completion size",
    body: `
      <p><strong>What it means:</strong> the full size of the drill when completed. This is used to calculate completion percentage.</p>
      <div class="example"><strong>Example:</strong> for a T line-up with 15 reds + 15 blacks, total units could be 30 balls, or 15 red-black pairs if you prefer pair-based scoring.</div>
      <p><strong>Best use:</strong> choose the unit that best reflects the drill objective. For black-only line-up work, pairs completed is often cleaner than points.</p>`
  },
  attemptsPerSession: {
    title: "Attempts per session",
    body: `
      <p><strong>What it means:</strong> the number of tries you normally give yourself in one logged session.</p>
      <div class="example"><strong>Example:</strong> 10 attempts to complete the T line-up.</div>
      <p><strong>Best use:</strong> keep this stable across sessions so the statistics are comparable. Change it only if you deliberately change the drill format.</p>`
  },
  unitType: {
    title: "Unit type",
    body: `
      <p><strong>What it means:</strong> the way progress is counted inside a progressive completion exercise.</p>
      <div class="example"><strong>Example:</strong> balls cleared, points scored, red-colour pairs completed, or steps completed.</div>
      <p><strong>Best use:</strong> use balls or pairs for completion drills. Use points only when scoring output is the real objective, because points can hide different technical difficulty.</p>`
  },
  targetColourMode: {
    title: "Target colour mode",
    body: `
      <p><strong>What it means:</strong> describes the colour rule of the exercise, so similar-looking drills do not get mixed statistically.</p>
      <div class="example"><strong>Example:</strong> “blacks only” for red-black-red-black line-up practice; “mixed colours” for general clearance work.</div>
      <p><strong>Best use:</strong> create separate exercises for materially different colour rules. A black-only line-up and a mixed-colour line-up should not share the same data series.</p>`
  },
  targetColour: {
    title: "Target colour",
    body: `
      <p><strong>What it means:</strong> the specific colour constraint when the drill is built around one colour.</p>
      <div class="example"><strong>Example:</strong> choose Blue for a blue-only break-building drill; choose Black for a black-only line-up.</div>
      <p><strong>Best use:</strong> set this at exercise level when the colour changes the technical demand. Do not track colour ball-by-ball unless you are doing match analysis.</p>`
  }

};

FIELD_HELP.smartSessionBuilder = {
  title:"Smart Session Builder",
  body:`
  <p><strong>What it does:</strong> builds one coherent training session from your available time, current performance data, training phase, and target competition timing.</p>
  <p><strong>Internal logic:</strong> the priority layer selects suitable drills; the adaptive layer turns them into blocks with minutes, purpose, and difficulty guidance.</p>
  <div class="example"><strong>Use it when:</strong> you want the app to decide the next useful session rather than manually selecting drills.</div>`
};

FIELD_HELP.smartRecommendationMode = {
  title:"Recommendation mode",
  body:`
  <p><strong>Stable heuristic:</strong> ranks drills using weakness, recency, undertraining, context and True Skill signals.</p>
  <p><strong>Hybrid:</strong> combines stable scoring with a small exploration effect. This is the safest default.</p>
  <p><strong>Thompson sampling:</strong> samples each drill's likely upside, so uncertain or neglected drills can occasionally beat familiar drills when the expected training value is high.</p>`
};


FIELD_HELP.targetScoreMode = {
  title:"Target score",
  body:`
  <p><strong>Meaning:</strong> performance threshold for success.</p>
  <p><strong>Use %</strong> for success-rate or completion drills.</p>
  <p><strong>Use number</strong> for highest break or raw score drills.</p>
  <div class="example"><strong>Example:</strong> 50% = 7/14 pots; 35 = break of 35.</div>`
};
FIELD_HELP.stretchScoreMode = {
  title:"Stretch target",
  body:`
  <p><strong>Meaning:</strong> higher performance goal above target.</p>
  <p>Same input logic as target score.</p>
  <div class="example"><strong>Example:</strong> Target 50%, Stretch 75% or Target 35, Stretch 50.</div>`
};


FIELD_HELP.psi = {title:"Consistency Rating",body:`<p><strong>What it means:</strong> a 0-100 stability score combining score variability and hit-rate volatility.</p>`};
FIELD_HELP.fatigueSlope = {title:"Stamina drop-off",body:`<p><strong>What it means:</strong> the relationship between accumulated session time and performance.</p>`};
FIELD_HELP.difficultyLadder = {title:"Difficulty ladder",body:`<p><strong>What it means:</strong> recommendation to increase, reduce, stabilize, or maintain difficulty.</p>`};
FIELD_HELP.abComparison = {title:"A/B period comparison",body:`<p><strong>What it means:</strong> compares two periods to show whether training volume and performance improved or declined.</p>`};
FIELD_HELP.drift = {title:"Performance drift",body:`<p><strong>What it means:</strong> compares recent performance against a prior window.</p>`};
FIELD_HELP.qualityImpact = {title:"Session quality impact",body:`<p><strong>What it means:</strong> compares high-rated sessions against low-rated sessions.</p>`};
FIELD_HELP.optimalLength = {title:"Optimal session length",body:`<p><strong>What it means:</strong> groups sessions by duration and identifies which band performs best.</p>`};
FIELD_HELP.velocity = {title:"Progress velocity",body:`<p><strong>What it means:</strong> estimates the recent slope of improvement.</p>`};
FIELD_HELP.plateau = {title:"Plateau detector",body:`<p><strong>What it means:</strong> flags flat recent performance despite continued practice.</p>`};
FIELD_HELP.overtraining = {title:"Overtraining signal",body:`<p><strong>What it means:</strong> flags when volume rises but performance does not improve.</p>`};


Object.assign(FIELD_HELP, {
  avgPerformance: {title:"Average performance", body: analyticsHelp("Average performance","Your average normalized score on the selected period or exercise.","Mean of normalized scores, usually on a 0–100 scale.","Higher is better, but compare similar drills or use target-version context.","Use it to see general direction, not as the only decision metric.")},
  targetHitRate: {title:"Target hit rate", body: analyticsHelp("Target hit rate","How often you met or exceeded the target active at the time of logging.","Logs classified as On Target or Above Target divided by evaluated logs.","High hit rate may mean target is too easy; low hit rate may mean target is too hard.","Use it before changing target versions.")},
  trainingTime: {title:"Training time", body: analyticsHelp("Training time","Total time logged in the selected period.","Sum of log durations, displayed in minutes or hours/minutes.","Rising time with flat performance may indicate low-yield volume or fatigue.","Use it to manage training load.")},
  progressVelocity: {title:"Progress velocity", body: analyticsHelp("Progress velocity","Recent direction and speed of improvement.","Simple slope of recent normalized scores over the latest logs.","Positive means improving; negative means declining; flat means stabilization or plateau.","Use it to decide whether to continue, vary, or rest a drill.")},
  psi: {title:"Consistency Rating", body: analyticsHelp("Consistency","Consistency of performance.","Combines score variability and hit-rate volatility into a 0–100 stability index.","High Consistency = reliable execution; low Consistency = unstable performance.","Use it before increasing difficulty or assessing competition readiness.")},
  fatigueSlope: {title:"Stamina drop-off", body: analyticsHelp("Stamina drop-off","Whether performance changes as session time accumulates.","Slope of normalized performance versus accumulated session minutes.","Negative suggests fatigue; positive suggests slow warm-up.","Use it to adjust warm-up, breaks, and session length.")},
  drift: {title:"Performance drift", body: analyticsHelp("Performance drift","Short-term trend versus the previous baseline.","Recent average compared with the prior average window.","Positive drift suggests progress; negative drift suggests regression or changed conditions.","Use it to detect recent changes before they appear in long-term averages.")},
  qualityImpact: {title:"Session quality impact", body: analyticsHelp("Session quality impact","Whether high-rated sessions actually perform better.","Compares average performance in high quality ratings versus low quality ratings.","If quality and score diverge, your rating may capture effort rather than execution.","Use it to calibrate reflection.")},
  optimalLength: {title:"Optimal session length", body: analyticsHelp("Optimal session length","Which session-duration band has produced the best performance.","Groups sessions by duration and compares average score.","Best band suggests your highest-yield session length, not maximum volume.","Use it to plan efficient sessions.")},
  plateau: {title:"Plateau detector", body: analyticsHelp("Plateau detector","Whether recent performance has flattened.","Compares recent window versus previous window and flags very small change.","A plateau means repetition alone may no longer be enough.","Use it to vary constraints or change target difficulty.")},
  overtraining: {title:"Overtraining signal", body: analyticsHelp("Overtraining signal","Whether rising volume is failing to produce better performance.","Compares recent volume change with performance change.","Volume up with performance flat/down can indicate fatigue or low-quality practice.","Use it to schedule lighter sessions or deload.")},
  difficultyLadder: {title:"Difficulty ladder", body: analyticsHelp("Difficulty ladder","Whether the current target is too easy, too hard, or appropriate.","Combines hit rate, Consistency, drift, and sample size.","Increase if stable and high hit rate; reduce if consistently failing; maintain if in learning zone.","Use it to create target versions.")},
  abComparison: {title:"A/B period comparison", body: analyticsHelp("A/B comparison","Whether one period performed better than another.","Compares logs, time, average score, hit rate, Consistency, and best score across two periods.","Useful for before/after blocks, recent months, or training changes.","Use it to judge whether a training phase worked.")}
});


FIELD_HELP.adaptiveEngine = {
  title:"Adaptive Training Engine",
  body:`<div class="help-rich">
    <p><strong>What it does:</strong> builds a full training session structure, not just a drill list.</p>
    <p><strong>How it works:</strong> diagnoses your current state using hit rate, Consistency, drift, stamina drop-off, plateau detection, training load, anchor drills, and days since last practice.</p>
    <p><strong>Output:</strong> a session mode and blocks such as Anchor Baseline, Stability, Progression, Recovery, Robustness, and Completion.</p>
    <p><strong>How to interpret:</strong> this is the closest thing in the app to a coach. It decides whether today should be about improving, stabilizing, recovering, or varying the drill constraints.</p>
    <div class="example"><strong>Difference vs Training Orchestrator:</strong> the Orchestrator selects routines; the Adaptive Engine decides the training logic, session structure, and action for each routine.</div>
  </div>`
};
FIELD_HELP.trainingOrchestrator = {
  title:"Training Orchestrator",
  body:`<div class="help-rich">
    <p><strong>What it does:</strong> creates a practical routine mix for a session.</p>
    <p><strong>How it works:</strong> ranks exercises using weak routines, undertrained categories, recency, anchor drills, and your selected strategy: Exploit, Balanced, or Explore.</p>
    <p><strong>Output:</strong> a list of routines to load into a session or plan.</p>
    <p><strong>How to interpret:</strong> use it when you already know roughly what kind of session you want and just need a good drill selection.</p>
    <div class="example"><strong>Difference vs Adaptive Engine:</strong> the Orchestrator answers “which drills should I do?”; the Adaptive Engine answers “what type of session should I do, how should it be structured, and why?”</div>
  </div>`
};

FIELD_HELP.adaptiveSessionGoal = {
  title:"Adaptive Engine — Session goal",
  body:`<div class="help-rich">
    <p><strong>What it controls:</strong> the overall logic of the adaptive session.</p>
    <p><strong>Auto:</strong> lets the app choose between stability, progression, recovery, and variety based on current data.</p>
    <p><strong>Stability:</strong> prioritizes repeated execution and consistency.</p>
    <p><strong>Progression:</strong> prioritizes drills ready for target increases or harder constraints.</p>
    <p><strong>Recovery:</strong> reduces load when fatigue or negative drift appears.</p>
    <p><strong>Variety:</strong> adds robustness and avoids overfitting to one setup.</p>
  </div>`
};
FIELD_HELP.adaptiveStrictness = {
  title:"Adaptive Engine — Strictness",
  body:`<div class="help-rich">
    <p><strong>What it controls:</strong> how strongly the engine follows the data-driven recommendation.</p>
    <p><strong>Flexible:</strong> allows more variety and practical session balance.</p>
    <p><strong>Normal:</strong> balanced default.</p>
    <p><strong>Strict:</strong> gives more weight to anchors and the highest-priority diagnostic drills.</p>
    <div class="example"><strong>Use strict</strong> when you want the app to behave like a coach and override preference.</div>
  </div>`
};
FIELD_HELP.periodizationPhase = {
  title:"Training phase / periodization",
  body:`<div class="help-rich">
    <p><strong>What it controls:</strong> the broader training objective over the next weeks.</p>
    <p><strong>Skill acquisition:</strong> more variation and new skill coverage.</p>
    <p><strong>Stabilization:</strong> repeat key drills until performance becomes reliable.</p>
    <p><strong>Performance prep:</strong> pressure-like work and justified target upgrades.</p>
    <p><strong>Deload:</strong> lower volume and lower complexity when fatigue/load is high.</p>
    <div class="example"><strong>Decision use:</strong> periodization adjusts the adaptive engine so every session fits a larger training phase.</div>
  </div>`
};
FIELD_HELP.regretEngine = {
  title:"Drill Comparison Engine",
  body:`<div class="help-rich">
    <p><strong>What it measures:</strong> whether an alternative routine might have been a better choice than the one selected.</p>
    <p><strong>How calculated:</strong> compares expected recent performance using average score, Consistency adjustment, and drift adjustment.</p>
    <p><strong>How to interpret:</strong> positive regret means the alternative currently looks better; negative regret means the chosen routine looks better.</p>
    <div class="example"><strong>Important:</strong> this is not causal proof. It is a decision-quality signal for drill selection.</div>
  </div>`
};

FIELD_HELP.reflectionPatterns = {
  title: "Reflection patterns",
  body: "Shows repeated post-session focus or limiter themes. These signals now add small recommendation weight when a drill is repeatedly linked to the same limiter or focus area."
};
FIELD_HELP.orchestratorIntensity = {
  title:"Training Orchestrator — Intensity",
  body:`<div class="help-rich">
    <p><strong>What it controls:</strong> the size and demand of the generated routine mix.</p>
    <p><strong>Lower intensity:</strong> shorter/easier session with fewer demanding picks.</p>
    <p><strong>Higher intensity:</strong> more drills or harder-priority selections.</p>
    <div class="example"><strong>Use:</strong> adjust intensity based on available time, energy, and whether the session is diagnostic or light practice.</div>
  </div>`
};
FIELD_HELP.orchestratorStrategy = {
  title:"Training Orchestrator — Training strategy",
  body:`<div class="help-rich">
    <p><strong>What it controls:</strong> how the Orchestrator chooses routines.</p>
    <p><strong>Exploit weaknesses:</strong> emphasizes poor hit rate and underperformance.</p>
    <p><strong>Balanced:</strong> mixes weaknesses, anchors, and undertrained areas.</p>
    <p><strong>Explore neglected drills:</strong> prioritizes routines not practiced recently.</p>
    <div class="example"><strong>Difference vs Adaptive Engine:</strong> strategy changes which drills are selected; the Adaptive Engine decides the full session logic.</div>
  </div>`
};
FIELD_HELP.orchestratorFocusOverride = {
  title:"Training Orchestrator — Focus override",
  body:`<div class="help-rich">
    <p><strong>What it controls:</strong> whether the generated routine list is biased toward a specific category.</p>
    <p><strong>Example:</strong> choose Potting if you only want potting drills in this session.</p>
    <p><strong>How to interpret:</strong> this is a manual override. It can be useful, but it may reduce the objectivity of the recommendation.</p>
    <div class="example"><strong>Use carefully:</strong> if you always override toward preferred drills, planned-vs-completed and regret analytics will reveal that bias.</div>
  </div>`
};


FIELD_HELP.phaseOneInsights = {
  title:"Phase 1 Training Insights",
  body:`<div class="help-rich">
    <p><strong>Expected vs actual:</strong> compares your actual score against an exponential moving average expectation. Persistent positive residuals suggest a drill may be ready for higher target or harder constraint.</p>
    <p><strong>Peak window:</strong> estimates the time range in a session where performance is highest. Use it to place harder drills at the right moment.</p>
    <p><strong>Context effects:</strong> compares performance by table, intervention, and time of day against your overall average.</p>
    <div class="example"><strong>Use:</strong> these insights help decide when to increase difficulty, when to place demanding drills, and which conditions help or hurt performance.</div>
  </div>`
};


Object.assign(FIELD_HELP, {
  logsCount: {
    title:"Logs / session count",
    body: analyticsHelp("Logs / session count","How much data exists in the selected scope.","Counts the number of saved log rows or sessions after the current filters are applied.","Higher sample size makes trends more reliable; very low counts should be treated cautiously.","Use it to judge whether a metric is robust enough to act on.")
  },
  exercisesCompleted: {
    title:"Exercises completed",
    body: analyticsHelp("Exercises completed","How many exercises were logged in the selected day or session.","Counts completed drill logs, not planned drills.","A high count indicates breadth; combine with training time and performance to avoid low-quality volume.","Use it to compare daily workload.")
  },
  totalTrainingTime: {
    title:"Total training time",
    body: analyticsHelp("Total training time","Total duration of logged training in the selected scope.","Sums timeMinutes across logs and displays it in minutes or hours/minutes.","Volume alone is not quality. Rising time with flat or falling scores can indicate fatigue or inefficient practice.","Use it to manage workload and session length.")
  },
  normalizedScore: {
    title:"Normalized score",
    body: analyticsHelp("Normalized score","A common 0–100 style score used to compare different drill types.","For success-rate drills it is usually success percentage; for other drills it is normalized based on the drill scoring mode and target setup.","Useful for comparing direction across drills, but always check the scoring type and target version.","Use it as the main comparable performance metric.")
  },
  hitRate: {
    title:"Hit rate / success rate",
    body: analyticsHelp("Hit rate / success rate","The percentage of successful attempts or the percentage of logs that reached the target, depending on context.","For attempt drills it uses successes divided by attempts; for target analytics it uses logs classified as On Target or Above Target divided by evaluated logs.","Above 80% usually suggests stability; 60–80% is a development zone; below 60% may indicate too much difficulty or inconsistency.","Use it to decide whether to maintain, reduce, or increase difficulty.")
  },
  bestScore: {
    title:"Best score",
    body: analyticsHelp("Best score","The highest normalized or raw score achieved in the selected scope.","Takes the maximum score from the relevant logs.","Useful for ceiling potential, but it does not prove consistency.","Use it as a peak-performance indicator, not as your main progress KPI.")
  },
  averagePerformance: {
    title:"Average performance",
    body: analyticsHelp("Average performance","The mean performance level in the selected scope.","Averages normalized scores from the filtered logs.","Good for broad trend reading, but it can hide volatility and table/context effects.","Use it with Consistency, hit rate, and residuals.")
  },
  targetHitRate: {
    title:"Target hit rate",
    body: analyticsHelp("Target hit rate","How often you achieved the active target at the time of logging.","Counts On Target and Above Target logs divided by logs with a usable target classification.","High hit rate plus high Consistency suggests readiness for harder targets; low hit rate suggests target difficulty may be too high.","Use it before changing target versions.")
  },
  trainingLoad: {
    title:"Training load",
    body: analyticsHelp("Training load","Accumulated training volume over time.","Sums daily or weekly training minutes and compares recent load with prior load.","Rising load with declining performance can be a fatigue warning; stable load supports better comparisons.","Use it to decide when to deload or increase volume.")
  },
  residual: {
    title:"Expected vs actual residual",
    body: analyticsHelp("Expected vs actual residual","Whether your actual score is above or below recent expectation.","Uses an exponential moving average as the expected score, then calculates actual minus expected.","Persistent positive residuals suggest improvement or under-challenging targets; negative residuals suggest fatigue, difficulty, or adverse context.","Use it to refine target increases more carefully than hit rate alone.")
  },
  peakWindow: {
    title:"Session peak window",
    body: analyticsHelp("Session peak window","The part of the session where performance tends to be highest.","Looks across session logs and finds the rolling time window with the highest average normalized score.","This suggests when your most demanding drills should be placed.","Use it to order drills inside a session.")
  },
  contextEffects: {
    title:"Context effects",
    body: analyticsHelp("Context effects","How performance changes across conditions.","Groups logs by table, intervention, and time of day, then compares each group average to the global average.","Positive effects may indicate favorable conditions; negative effects may reveal table difficulty, fatigue timing, or disruptive changes.","Use it to separate real skill changes from environment effects.")
  },
  tableVenuePerformance: {
    title:"Table / venue performance",
    body: analyticsHelp("Table / venue performance","Performance split by the table or venue used.","Groups logs by stable table ID and calculates logs, time, average score, and hit rate per table.","A table with lower performance is not necessarily bad; it may simply be tighter or more demanding.","Use it to understand context and avoid misreading table effects as skill regression.")
  },
  plannedVsCompleted: {
    title:"Planned vs completed",
    body: analyticsHelp("Planned vs completed","Whether you completed the drills planned by the app or by your session plan.","Compares planned routine IDs with routines actually logged in the session.","Repeatedly skipped drills reveal avoidance, friction, or unrealistic planning.","Use it to detect revealed preferences and improve plan design.")
  },
  interventionImpact: {
    title:"Before / after intervention",
    body: analyticsHelp("Before / after intervention","Whether performance changed around a logged training intervention.","Compares logs before and after the most recent intervention tag.","This is not causal proof, but it is useful for spotting changes worth investigating.","Use it after equipment, technique, table, or coaching changes.")
  },
  anchorBaseline: {
    title:"Anchor drill baseline",
    body: analyticsHelp("Anchor drill baseline","Performance on drills marked as anchors.","Compares today's or current-period anchor performance against the rolling baseline for those same anchor drills.","Anchor drills are your most stable benchmark because they recur often.","Use them as the closest thing to a personal performance index.")
  },
  weeklyReview: {
    title:"Weekly review",
    body: analyticsHelp("Weekly review","A compact summary of current week activity and performance.","Compares this week's logs and average performance with the prior week where available.","Useful for seeing whether recent training is directionally improving or slipping.","Use it for weekly planning and adjustment.")
  },
  performanceDrift: {
    title:"Performance drift",
    body: analyticsHelp("Performance drift","Recent performance change versus a previous baseline window.","Compares a recent average with an earlier average over a similar number of logs.","Positive drift suggests improvement; negative drift suggests regression, fatigue, or context changes.","Use it to detect short-term movement before it appears in long-run averages.")
  },
  progressVelocity: {
    title:"Progress velocity",
    body: analyticsHelp("Progress velocity","The speed and direction of recent improvement.","Estimates a simple slope of score over time or over recent logs.","Positive velocity means improvement; near-zero means plateau; negative means decline.","Use it to decide whether to keep, vary, or rest a drill.")
  },
  plateau: {
    title:"Plateau detector",
    body: analyticsHelp("Plateau detector","Whether performance has stopped improving despite continued practice.","Compares recent performance change and volatility against a small threshold.","A plateau usually means repetition alone may no longer be enough.","Use it to add variation, change constraints, or adjust target versions.")
  },
  overtraining: {
    title:"Overtraining signal",
    body: analyticsHelp("Overtraining signal","Whether training volume is rising while performance is not improving.","Compares recent training load with recent performance movement.","Volume up with performance flat or down can indicate fatigue or low-quality volume.","Use it to schedule lighter sessions or deload weeks.")
  },
  qualityImpact: {
    title:"Session quality impact",
    body: analyticsHelp("Session quality impact","Whether subjective session quality ratings align with performance.","Compares performance in high-rated sessions with lower-rated sessions.","If ratings and scores diverge, your quality rating may be capturing effort or mood rather than execution.","Use it to calibrate your post-session judgment.")
  },
  optimalLength: {
    title:"Optimal session length",
    body: analyticsHelp("Optimal session length","Which duration band tends to produce the best performance.","Groups sessions by logged duration and compares average normalized score.","The best length is the highest-yield range, not necessarily the longest session.","Use it to set efficient training duration.")
  },
  difficultyLadder: {
    title:"Difficulty ladder",
    body: analyticsHelp("Difficulty ladder","Whether current drill difficulty should increase, decrease, stabilize, or remain unchanged.","Combines target hit rate, Consistency, drift, skill gap, and sample size.","Increase if high hit rate and stable; stabilize if volatile; reduce if consistently failing.","Use it to manage target versions.")
  },
  abComparison: {
    title:"A/B period comparison",
    body: analyticsHelp("A/B period comparison","Whether one period performed better than another.","Compares logs, time, average performance, hit rate, Consistency, and best score between two selected periods.","Useful for recent vs prior blocks, before/after periods, and training phase reviews.","Use it to judge whether a training approach worked.")
  },
  fatigueSlope: {
    title:"Stamina drop-off",
    body: analyticsHelp("Stamina drop-off","Whether performance changes as session time accumulates.","Estimates the slope of normalized score against accumulated session minutes.","Negative slope suggests fatigue or focus decline; positive slope suggests slow warm-up; flat suggests endurance stability.","Use it to adjust warm-up, break timing, and drill order.")
  },
  psi: {
    title:"Consistency Rating",
    body: analyticsHelp("Consistency","How consistent your performance is over recent logs.","Combines score variability and hit-rate volatility into a 0–100 stability score.","High Consistency means reliable execution; low Consistency means unstable performance even if average score is acceptable.","Use it before raising targets or assessing competition readiness.")
  },
  regretEngine: {
    title:"Drill comparison engine",
    body: analyticsHelp("Drill comparison engine","Whether another routine currently looks like a better selection than the one chosen.","Compares expected scores using recent average, Consistency adjustment, and drift adjustment.","Positive regret means the alternative looks better; negative regret means the chosen routine looks better.","Use it as a drill-selection quality signal, not causal proof.")
  }
});

Object.assign(FIELD_HELP, {
  kpiCurrentLevel: {title:"Current level", body:analyticsHelp("Current level","Your most recent saved score for this selected exercise.","Reads the latest normalized score after the active filter is applied.","It tells you where the drill stands right now, not your long-term average.","Use it as the immediate benchmark to beat in the next attempt.")},
  kpiRollingScore: {title:"Rolling score", body:analyticsHelp("Rolling score","Your short-term average for the selected exercise.","Averages the most recent logged results using the selected rolling window.","It smooths one lucky or bad score and shows current form more reliably.","Use it to judge whether performance is genuinely moving.")},
  kpiTrueSkill: {title:"Estimated true skill", body:analyticsHelp("Estimated true skill","A conservative estimate of your real success rate.","Uses success-rate evidence where attempts and makes are available.","It avoids overreacting to small samples.","Use it before raising a target or judging tournament readiness.")},
  kpiEvidence: {title:"Evidence", body:analyticsHelp("Evidence","How much data supports the selected exercise reading.","Counts logs and, for success-rate drills, effective attempts including per-side attempt mode.","More evidence means the result is more trustworthy.","Use it to separate a real trend from noise.")},
  kpiLastTrained: {title:"Last trained", body:analyticsHelp("Last trained","How recently this drill was practiced.","Measures days since the latest log in the selected exercise scope.","Old results may not represent current form.","Use it to identify stale drills before competition.")},
  kpiPressure: {title:"Pressure", body:analyticsHelp("Pressure", "How much of this scope was performed under pressure mode.", "Counts pressure-enabled logs and summarizes pressure success where available.", "Pressure results are harder to compare with relaxed drills, but they are more match-relevant.", "Use it to check whether practice is realistic enough.")},
  kpiSideBalance: {title:"Side balance", body:analyticsHelp("Side balance","Whether left/right drill performance is symmetrical.","Compares left-side and right-side scores when a drill uses side split.","Large imbalance indicates a technical or positional weakness hidden by total score.","Use it to decide whether one side needs isolated work.")},
  kpiStreak: {title:"Current streak", body:analyticsHelp("Current streak","How many consecutive days currently contain logged practice.","Counts daily logging continuity and compares it with your best streak.","It measures training consistency, not skill level.","Use it to monitor habit strength.")},
  kpiSkillGap: {title:"Skill gap", body:analyticsHelp("Skill gap","Distance between your best result and average result.","Compares peak performance with mean performance in the current scope.","A large gap means capability exists but reliability is weak.","Use it to decide between consistency work and target progression.")},
  kpiWeakestArea: {title:"Weakest area", body:analyticsHelp("Weakest area","The category with the weakest target-hit performance.","Groups logs by exercise category and compares target hit rate.","It is a prioritization signal, not a complete diagnosis.","Use it to decide what to train next.")}
});

FIELD_HELP.tournamentPrep = {
  title: "Tournament preparation planner",
  body: analyticsHelp(
    "Tournament preparation planner",
    "A readiness and session-planning layer for preparing a match or tournament block.",
    "It uses the active stats scope: logged scores, target hit rate, normalized score, practice time, pressure-mode exposure, consistency/Consistency, recency, and left/right imbalance where available. It does not require tournament logs; regular practice logs are enough, but pressure logs and stable time entries make it more accurate.",
    "It estimates whether current form is ready, unstable, or under-evidenced, then adjusts the recommended intensity, taper warning, and session blocks based on days remaining, format, focus, risk profile, and daily minutes.",
    "Use it before competition to decide whether to maintain form, increase match realism, reduce volume, or rebuild confidence instead of blindly adding more practice."
  )
};


FIELD_HELP.forecast = {
 title:"Predictive confidence interval",
 body: analyticsHelp("Forecast","Expected future performance range.",
 "Uses linear trend plus standard deviation of residuals.",
 "Central value = expected trend; band shows uncertainty.",
 "Use it to estimate near-term progression and volatility.")
};


FIELD_HELP.swipeHistoryCards = {
  title:"Swipeable drill history cards",
  body: analyticsHelp("Swipeable history","A mobile-friendly view of recent drill logs.","Each card shows one log, key stats, table context, and a mini-sparkline for that routine's recent scores.","Use it to review patterns quickly without horizontal table scrolling.","Swipe sideways to scan recent logs; use the table below when you need dense audit detail.")
};

function showFieldHelp(key) {
  const item = FIELD_HELP[key];
  if (!item) return;
  $("fieldHelpTitle").textContent = item.title;
  $("fieldHelpBody").innerHTML = item.body;
  $("fieldHelpModal").classList.remove("hidden");
}
function hideFieldHelp() {
  $("fieldHelpModal").classList.add("hidden");
}
function closeFieldHelp(event) {
  if (event.target && event.target.id === "fieldHelpModal") hideFieldHelp();
}

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $("installBtn").classList.remove("hidden");
});
safeOn("installBtn", "click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("installBtn").classList.add("hidden");
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register(`service-worker.js?v=${encodeURIComponent(APP_VERSION)}`);
      if (reg && reg.update) reg.update();
      const swVersionKey = "snookerPracticePWA.swVersion";
      const lastVersion = localStorage.getItem(swVersionKey);
      if (lastVersion && lastVersion !== APP_VERSION) {
        localStorage.setItem(swVersionKey, APP_VERSION);
        await reg.unregister();
        window.location.reload();
        return;
      }
      localStorage.setItem(swVersionKey, APP_VERSION);
    } catch(e) {
      console.warn("Service worker registration failed", e);
    }
  });
}
bootstrapIndexedDBStorage();

let generatedPlanDraft = [];
let lastGeneratedPlannedRoutineIds = [];


function getLastVenueTable() {
  return localStorage.getItem(LAST_VENUE_KEY) || "";
}
function getLastTableNote() {
  return localStorage.getItem(LAST_TABLE_NOTE_KEY) || "";
}
function rememberVenueTable(venue, note) {
  if (venue !== undefined) localStorage.setItem(LAST_VENUE_KEY, venue || "");
  if (note !== undefined) localStorage.setItem(LAST_TABLE_NOTE_KEY, note || "");
}
function renderTodayResumeCard() {
  const card = $("todayResumeSessionCard");
  const box = $("todayResumeSessionBox");
  const actions = $("todayResumeActions");
  if (!card || !box || !actions) return;
  const s = normalizePersistedSessionDraft(getPersistedActiveSession());
  if (!s) {
    box.innerHTML = `<div class="session-status-empty">No unfinished session detected. Completed training logs for today are shown below.</div>`;
    actions.classList.add("hidden");
    return;
  }
  actions.classList.remove("hidden");
  const r = routineById(s.routineIds[s.index]);
  box.innerHTML = `<div class="resume-detail"><strong>${escapeHtml(s.planName || "Unfinished session")}</strong></div>
    <div class="resume-detail">Continue at exercise ${Number(s.index||0)+1} of ${s.routineIds.length}: ${escapeHtml(r?.name || "Missing exercise")}</div>
    <div class="resume-detail">Venue/table: ${escapeHtml(s.venueTable || getLastVenueTable() || "Not specified")}</div>
    <div class="resume-detail">Started: ${new Date(s.startedAt || s.savedAt).toLocaleString()}</div>`;
}


function statHelpButton(key){return `<button type="button" class="stat-help" data-action="field-help" data-help-key="${attrText(key)}">?</button>`;}

function pressureRoutineSignal(routineId) {
  const logs = (data.logs || []).filter(l => String(l.routineId) === String(routineId));
  const pressureLogs = logs.filter(l => l.sessionType === "pressure" || l.pressureEnabled || l.pressureMode || l.pressureScore !== undefined || l.clutchRate !== undefined);
  if (pressureLogs.length < 2) return {bonus:0, reasons:[], n:pressureLogs.length, avg:null, clutch:null};
  const vals = pressureLogs.map(l => Number(l.pressureAdjustedScore ?? l.pressureScore ?? l.normalizedScore ?? 0)).filter(Number.isFinite);
  const clutchVals = pressureLogs.map(l => Number(l.clutchRate)).filter(Number.isFinite);
  const avgPressure = vals.length ? avg(vals) : null;
  const avgClutch = clutchVals.length ? avg(clutchVals) : null;
  let bonus = 0;
  const reasons = [];
  if (avgPressure !== null && avgPressure < 60) { bonus += 14; reasons.push(`pressure weakness (${avgPressure.toFixed(0)} avg)`); }
  else if (avgPressure !== null && avgPressure >= 80) { bonus -= 4; reasons.push("pressure strength"); }
  if (avgClutch !== null && avgClutch < 55) { bonus += 8; reasons.push(`clutch rate ${avgClutch.toFixed(0)}%`); }
  if (pressureLogs.length && daysSince(pressureLogs.slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).at(-1).createdAt) >= 10) {
    bonus += 6;
    reasons.push("pressure reps overdue");
  }
  return {bonus, reasons, n:pressureLogs.length, avg:avgPressure, clutch:avgClutch};
}

function currentRecommendationTableName() {
  const activeTable = activeSession?.tableId ? getTableName(activeSession.tableId) : "";
  return activeTable && activeTable !== "Not specified" ? activeTable : (getLastTableId() ? getTableName(getLastTableId()) : (getLastVenueTable() || ""));
}

function tableVenueRoutineSignal(routineId) {
  const tableName = currentRecommendationTableName();
  if (!tableName || tableName === "Not specified") return {bonus:0, reasons:[], tableName:"", delta:null, n:0};
  const logs = (data.logs || []).filter(l => String(l.routineId) === String(routineId));
  const vals = logs.map(l => Number(l.normalizedScore || 0)).filter(Number.isFinite);
  const tableLogs = logs.filter(l => getTableName(l) === tableName || l.venueTable === tableName || l.venueTableSnapshot === tableName);
  const tableVals = tableLogs.map(l => Number(l.normalizedScore || 0)).filter(Number.isFinite);
  if (vals.length < 5 || tableVals.length < 2) return {bonus:0, reasons:[], tableName, delta:null, n:tableVals.length};
  const delta = avg(tableVals) - avg(vals);
  const reasons = [];
  let bonus = 0;
  if (delta < -6) { bonus += 8; reasons.push(`table-context drag: ${tableName} (${delta.toFixed(1)})`); }
  else if (delta > 6) { bonus -= 3; reasons.push(`table-context lift: ${tableName} (+${delta.toFixed(1)})`); }
  return {bonus, reasons, tableName, delta, n:tableVals.length};
}

function reflectionRoutineSignal(routineId) {
  const sessions = data.sessions || [];
  const logs = (data.logs || []).filter(l => String(l.routineId) === String(routineId));
  if (!logs.length || !sessions.length) return {bonus:0, reasons:[], patterns:[]};
  const sessionById = Object.fromEntries(sessions.map(s => [s.id, s]));
  const patterns = {};
  logs.forEach(l => {
    const ref = sessionById[l.sessionId]?.reflection;
    if (!ref) return;
    [ref.focus, ref.limiter, ...(ref.fatigueRating >= 4 ? ["high fatigue"] : []), ...(ref.confidenceRating <= 2 ? ["low confidence"] : [])].filter(Boolean).forEach(x => {
      const key = String(x).trim();
      if (!key) return;
      patterns[key] = (patterns[key] || 0) + 1;
    });
  });
  const sorted = Object.entries(patterns).sort((a,b)=>b[1]-a[1]);
  const top = sorted[0];
  if (!top || top[1] < 2) return {bonus:0, reasons:[], patterns:sorted};
  return {bonus:Math.min(10, top[1]*3), reasons:[`recurring reflection: ${top[0]}`], patterns:sorted};
}

function recommendationContextSignal(routineId) {
  const pressure = pressureRoutineSignal(routineId);
  const table = tableVenueRoutineSignal(routineId);
  const reflection = reflectionRoutineSignal(routineId);
  return {
    bonus: Number(pressure.bonus || 0) + Number(table.bonus || 0) + Number(reflection.bonus || 0),
    pressure, table, reflection,
    reasons: [...(pressure.reasons || []), ...(table.reasons || []), ...(reflection.reasons || [])]
  };
}

function reflectionPatternInsight(logs) {
  const scopedSessionIds = new Set(logs.map(l => l.sessionId).filter(Boolean));
  const sessions = (data.sessions || []).filter(s => scopedSessionIds.has(s.id) && s.reflection);
  if (!sessions.length) return `<div class="insight-card watch"><strong>${htmlText(uiLabel("reflectionPatterns"))}</strong><div class="muted">No post-session reflection data in the current scope yet.</div></div>`;
  const counts = {};
  sessions.forEach(s => {
    const ref = s.reflection || {};
    if (ref.focus) counts[`Focus: ${ref.focus}`] = (counts[`Focus: ${ref.focus}`] || 0) + 1;
    if (ref.limiter) counts[`Limiter: ${ref.limiter}`] = (counts[`Limiter: ${ref.limiter}`] || 0) + 1;
  });
  const rows = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6);
  if (!rows.length) return `<div class="insight-card watch"><strong>${htmlText(uiLabel("reflectionPatterns"))}</strong><div class="muted">Reflections exist, but no structured focus/limiter fields are populated yet.</div></div>`;
  return `<div class="insight-card watch"><strong>${htmlText(uiLabel("reflectionPatterns"))} ${statHelpButton("reflectionPatterns")}</strong>${rows.map(([k,n])=>`<div class="context-row"><span>${escapeHtml(k)}</span><strong>${n}</strong><span>session${n===1?"":"s"}</span></div>`).join("")}<div class="adaptive-rationale">Recurring focus/limiter themes now influence drill recommendations when linked to session logs.</div></div>`;
}

function getRoutinePriorityReasons(item){
  const r=item.routine,s=item.stats,reasons=[];
  if(s.hit!==null&&s.hit<55) reasons.push("low target hit rate");
  if(s.prior&&s.recent!==null&&s.recent<s.prior) reasons.push("recent underperformance");
  if(undertrainedCategoryBonus(r.id)*recommendationUndertrainingMultiplier(r)>=7) reasons.push("undertrained category");
  if(recommendationMode(r)==="active"&&(!s.logs.length||daysSince(s.logs[s.logs.length-1].createdAt)>=7)) reasons.push("not practiced recently");
  if(s.bayesian?.policy?.title) reasons.push(`True Skill action: ${s.bayesian.policy.title}`); else if(s.bayesian?.signal?.reason) reasons.push(s.bayesian.signal.reason);
  const ctx = s.contextSignal || recommendationContextSignal(r.id);
  (ctx.reasons || []).forEach(reason => reasons.push(reason));
  reasons.push(skillReasonText(r));
  if(recommendationMode(r)==="occasional") reasons.push("occasional recommendation cap");
  if(r.isAnchor) reasons.push("anchor drill");
  if(!reasons.length) reasons.push("balanced rotation");
  return reasons;
}
function routineMixedStrategyScore(routine,stats,strategy){
  const days = stats.logs.length ? daysSince(stats.logs[stats.logs.length-1].createdAt) : recommendationRecencyCap(routine);
  const undertrainedBonus = undertrainedCategoryBonus(routine.id);
  return scoreMixedStrategyRoutine({routine, stats, strategy, days, undertrainedBonus});
}
function weightedPick(items,usedIds){
  const pool=items.filter(x=>!usedIds.has(x.routine.id)); if(!pool.length) return null;
  const weights=pool.map(x=>Math.max(1,x.score)), total=weights.reduce((a,b)=>a+b,0); let rnd=Math.random()*total;
  for(let i=0;i<pool.length;i++){rnd-=weights[i]; if(rnd<=0){usedIds.add(pool[i].routine.id); return pool[i];}}
  usedIds.add(pool[pool.length-1].routine.id); return pool[pool.length-1];
}
function targetUpgradeSuggestionForRoutine(routineId){
  const r=routineById(routineId); if(!r) return null;
  const logs=(data.logs||[]).filter(l=>l.routineId===routineId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  if(logs.length<5) return null;
  const hit=targetHitRate(logs.slice(-8)), psi=performanceStabilityIndex(logs.slice(-10),10), drift=performanceDrift(logs,Math.min(8,Math.max(5,Math.floor(logs.length/2))));
  if(hit!==null&&hit>=80&&psi&&psi.psi>=70&&(!drift||drift.deltaPct>=-2)){
    const ct=Number(r.target||0), cs=Number(r.stretchTarget||0);
    let bump=5, maxTarget=null;
    if(r.scoring==="success_rate"){
      const attempts=Number(r.attempts || r.attemptsPerSession || 0);
      bump=Math.max(1, Math.round(attempts*0.10));
      maxTarget=attempts || null;
    } else if(r.scoring==="progressive_completion"){
      const units=Number(r.totalUnits || 0);
      bump=Math.max(1, Math.round((units || 20)*0.10));
      maxTarget=units || null;
    }
    const suggestedTarget=maxTarget ? Math.min(maxTarget, ct?ct+bump:bump) : (ct?ct+bump:bump);
    const suggestedStretch=maxTarget ? Math.min(maxTarget, cs?cs+bump:Math.max(suggestedTarget, suggestedTarget+bump)) : (cs?cs+bump:(ct?ct+bump*2:bump*2));
    return {routine:r,suggestedTarget,suggestedStretch,reason:`Hit rate ${hit.toFixed(1)}%, Consistency ${psi.psi.toFixed(0)}, performance stable/improving.`};
  }
  return null;
}
function renderTargetUpgradeButton(routineId){
  const sug=targetUpgradeSuggestionForRoutine(routineId); if(!sug) return "";
  return `<div class="target-upgrade"><strong>Target upgrade suggested</strong><br><span class="muted">${escapeHtml(sug.reason)}</span><div class="upgrade-row"><div><label>New target</label><input id="upgrade-target-${attrText(sug.routine.id)}" type="number" step="0.01" value="${numAttr(sug.suggestedTarget)}"></div><div><label>New stretch</label><input id="upgrade-stretch-${attrText(sug.routine.id)}" type="number" step="0.01" value="${numAttr(sug.suggestedStretch)}"></div><button class="secondary" data-action="apply-target-upgrade" data-id="${attrText(sug.routine.id)}">Apply as new target version</button></div></div>`;
}
function applyTargetUpgrade(routineId){
  const r=routineById(routineId); if(!r) return;
  const nt=Number($("upgrade-target-"+routineId)?.value||0), ns=Number($("upgrade-stretch-"+routineId)?.value||0);
  if(!nt) return alert("Enter a valid new target.");
  r.target=nt; r.stretchTarget=ns||""; r.difficultyLabel=`Target upgrade ${new Date().toLocaleDateString()}`;
  ensureTargetHistory(r); const profile=makeTargetProfile(r,r.difficultyLabel); r.targetHistory.push(profile); r.activeTargetProfileId=profile.id; saveData(); alert("New target version applied.");
}



function renderResumeCard(){
  const card=$("resumeSessionCard"),box=$("resumeSessionBox");
  if(!card||!box)return;
  const s=normalizePersistedSessionDraft(getPersistedActiveSession());
  if(!s||activeSession){card.classList.add("hidden");box.innerHTML="";return;}
  const r=routineById(s.routineIds[s.index]);
  card.classList.remove("hidden");
  box.innerHTML=`<div class="resume-detail"><strong>${escapeHtml(s.planName||"Unfinished session")}</strong></div>
    <div class="resume-detail">Continue at exercise ${Number(s.index||0)+1} of ${s.routineIds.length}: ${escapeHtml(r?.name||"Missing exercise")}</div>
    <div class="resume-detail">Started: ${new Date(s.startedAt||s.savedAt).toLocaleString()}</div>`;
}
function normalizePersistedSessionDraft(s) {
  if (!s || !Array.isArray(s.routineIds) || !s.routineIds.length) return null;
  const copy = structuredCloneSafe(s);
  copy.id = copy.id || uuid();
  copy.type = copy.type || "free";
  copy.planName = copy.planName || "Unfinished session";
  copy.startedAt = copy.startedAt || copy.savedAt || new Date().toISOString();
  copy.completedLogs = Array.isArray(copy.completedLogs) ? copy.completedLogs : [];
  copy.index = Math.max(0, Number(copy.index || 0));

  if (copy.index >= copy.routineIds.length) return copy.completedLogs.length > 0 ? copy : null;

  // If the stored current routine was deleted, move to the next still-existing routine.
  if (!routineById(copy.routineIds[copy.index])) {
    const nextIdx = copy.routineIds.findIndex((rid, idx) => idx >= copy.index && !!routineById(rid));
    if (nextIdx < 0) {
      if (copy.completedLogs.length > 0) {
        copy.index = copy.routineIds.length;
        return copy;
      }
      return null;
    }
    copy.index = nextIdx;
  }
  return copy;
}

function showPracticePanelForResume() {
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  $("practice")?.classList.add("active");
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.querySelector('.tab[data-tab="practice"]')?.classList.add("active");
}

function refreshResumeCards() {
  renderResumeCard?.();
  renderTodayResumeCard?.();
}

function resumePersistedSession() {
  const s = normalizePersistedSessionDraft(getPersistedActiveSession());
  if (!s) {
    clearPersistedActiveSession();
    refreshResumeCards();
    return alert("No valid unfinished session to resume.");
  }

  const savedTimerState = s.timerState ? {...s.timerState} : null;
  activeSession = s;
  if (savedTimerState) activeSession.timerState = savedTimerState;

  showPracticePanelForResume();
  $("sessionSummary")?.classList.add("hidden");
  $("freeNextCard")?.classList.add("hidden");
  $("activeSession")?.classList.remove("hidden");

  suppressTimerPersistence = true;
  isResumingActiveSession = true;
  try {
    renderCurrentRoutine();
  } finally {
    isResumingActiveSession = false;
    suppressTimerPersistence = false;
  }

  if (savedTimerState) activeSession.timerState = savedTimerState;
  restoreTimerStateFromActiveSession();
  syncTimerStateToActiveSession();
  updateSessionFocusState?.();
  refreshResumeCards();
}

function discardPersistedSession(){
  if(!confirm("Discard unfinished session? Existing saved logs will remain."))return;
  clearPersistedActiveSession();
  refreshResumeCards();
}
function plannedVsCompletedSummary(){
  const recent=(data.sessions||[]).slice().sort((a,b)=>new Date(b.endedAt||b.startedAt)-new Date(a.endedAt||a.startedAt)).slice(0,10);
  const rows=recent.filter(s=>(s.plannedRoutineIds||[]).length).map(s=>{const planned=new Set(s.plannedRoutineIds||[]); const completed=new Set((s.logIds||[]).map(id=>(data.logs||[]).find(l=>l.id===id)?.routineId).filter(Boolean)); const done=[...planned].filter(id=>completed.has(id)).length; const skipped=[...planned].filter(id=>!completed.has(id)); return {planned:planned.size,done,skipped,rate:planned.size?done/planned.size*100:null};});
  if(!rows.length)return ""; const avgRate=avg(rows.map(r=>r.rate).filter(x=>x!==null)); const skippedCounts={}; rows.forEach(r=>r.skipped.forEach(id=>skippedCounts[id]=(skippedCounts[id]||0)+1)); const mostSkipped=Object.entries(skippedCounts).sort((a,b)=>b[1]-a[1])[0];
  return `<div class="planned-box"><strong>Planned vs completed ${statHelpButton("plannedVsCompleted")}</strong><br>Completion rate last ${rows.length} planned sessions: ${avgRate.toFixed(1)}%. ${mostSkipped?`<div class="reflection-row">Most skipped: ${escapeHtml(routineById(mostSkipped[0])?.name||"Deleted exercise")} (${mostSkipped[1]}x).</div>`:""}</div>`;
}
function interventionImpactSummary(logs=data.logs||[]){
  const interventions=logs.filter(l=>l.sessionIntervention); if(!interventions.length)return "";
  const last=interventions.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0], d=new Date(last.createdAt);
  const beforeStart=new Date(d); beforeStart.setDate(beforeStart.getDate()-30); const afterEnd=new Date(d); afterEnd.setDate(afterEnd.getDate()+30);
  const before=logsInRange(logs,beforeStart,d), after=logsInRange(logs,d,afterEnd);
  if(before.length<2||after.length<2)return `<div class="intervention-card"><strong>Intervention logged:</strong> ${escapeHtml(last.sessionIntervention)}. More before/after data needed.</div>`;
  const b=metricsForLogs(before), a=metricsForLogs(after);
  return `<div class="intervention-card"><strong>Before / after intervention ${statHelpButton("interventionImpact")}: ${escapeHtml(last.sessionIntervention)}</strong><div class="reflection-row">Avg performance: ${b.avg===null?"N/A":b.avg.toFixed(1)} before → ${a.avg===null?"N/A":a.avg.toFixed(1)} after (${deltaFmt(a.avg,b.avg)}).</div><div class="reflection-row">Hit rate: ${b.hit===null?"N/A":b.hit.toFixed(1)+"%"} before → ${a.hit===null?"N/A":a.hit.toFixed(1)+"%"} after.</div></div>`;
}
function tableStats(logs){
  const groups=Object.create(null);
  (logs||[]).forEach(l=>{
    const key = l.tableId || l.venueTable || l.venueTableSnapshot || "";
    if(!key || key === "Not specified") return;
    if(!groups[key]) groups[key] = {table:getTableName(l), logs:[]};
    groups[key].logs.push(l);
  });
  return Object.values(groups).map(g=>{
    const arr=g.logs;
    const vals=arr.map(l=>Number(l.normalizedScore||0)).filter(v=>Number.isFinite(v));
    const hit=targetHitRate(arr);
    return {table:g.table,logs:arr.length,time:arr.reduce((a,b)=>a+Number(b.timeMinutes||0),0),avg:vals.length?avg(vals):null,hit};
  }).sort((a,b)=>b.logs-a.logs);
}
function renderTableStats(logs=data.logs||[]){const box=$("tableStatsBox"); if(!box)return; const rows=tableStats(logs); if(!rows.length){box.innerHTML="";return;} box.innerHTML=`<div class="table-stats"><h3>Table / venue performance ${statHelpButton("tableVenuePerformance")}</h3><table><thead><tr><th>Table</th><th>Logs</th><th>Time</th><th>Avg</th><th>Hit rate</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.table)}</td><td>${r.logs}</td><td>${formatDurationHuman(r.time)}</td><td>${r.avg===null?"N/A":r.avg.toFixed(1)}</td><td>${r.hit===null?"N/A":r.hit.toFixed(1)+"%"}</td></tr>`).join("")}</tbody></table></div>`;}

function routineStats(routineOrId, groupedLogs = null) {
  const routine = typeof routineOrId === "object" && routineOrId ? routineOrId : routineById(routineOrId);
  const routineId = routine?.id || routineOrId;
  const logMap = groupedLogs || getLogsByRoutineMap(data.logs || []);
  const logs = (logMap[String(routineId)] || []).slice();
  const cacheKey = `${routineId}|${recommendationMode(routine)}|${recommendationRecencyCap(routine)}|${recommendationUndertrainingMultiplier(routine)}|${logsSignature(logs)}`;
  if (routineStatsMemoCache.has(cacheKey)) return routineStatsMemoCache.get(cacheKey);
  const vals = logs.map(l => Number(l.normalizedScore || 0));
  const hit = targetHitRate(logs);
  const recent = vals.length ? avg(vals.slice(-3)) : null;
  const prior = vals.length > 3 ? avg(vals.slice(0,-3)) : null;
  const momentumPenalty = prior && recent !== null && recent < prior ? 18 : 0;
  const lowHitPenalty = hit === null ? 8 : Math.max(0, 80-hit) * 0.7;
  const undertrainedBonus = undertrainedCategoryBonus(routineId) * recommendationUndertrainingMultiplier(routine);
  const days = logs.length ? daysSince(logs[logs.length-1].createdAt) : recommendationRecencyCap(routine);
  const recencyBonus = Math.min(10, Math.min(days, recommendationRecencyCap(routine)) * 1.2);
  const consistencyPenalty = vals.length > 2 ? Math.min(15, stdDev(vals) / Math.max(1, Math.abs(avg(vals))) * 30) : 5;
  const modePenalty = recommendationMode(routine) === "occasional" ? 8 : 0;
  const excludedPenalty = recommendationMode(routine) === "excluded" ? 999 : 0;
  const bayesian = bayesianStatsForRoutine(routine);
  const contextSignal = recommendationContextSignal(routineId);
  const result = {
    logs, vals, hit, recent, prior, bayesian, contextSignal,
    score: lowHitPenalty + momentumPenalty + undertrainedBonus + recencyBonus + consistencyPenalty - modePenalty - excludedPenalty + (bayesian?.signal?.scoreDelta || 0) + Number(contextSignal.bonus || 0)
  };
  if (routineStatsMemoCache.size > 200) routineStatsMemoCache.clear();
  routineStatsMemoCache.set(cacheKey, result);
  return result;
}

function warmRoutineStatsCache(reason="warmRoutineStatsCache") {
  try {
    const logs = data.logs || [];
    const routines = activeRoutines();
    const signature = `${logsSignature(logs)}|${(data.routines || []).length}|${data?.updatedAt || ""}`;
    if (performanceCacheWarmInProgress || routineStatsWarmSignature === signature) return false;
    performanceCacheWarmInProgress = true;
    const grouped = getLogsByRoutineMap(logs);
    routines.forEach(r => {
      try { routineStats(r, grouped); }
      catch(e) { logAppError?.(e, `${reason} routineStats ${r?.id || "unknown"}`); }
    });
    routineStatsWarmSignature = signature;
    return true;
  } catch(e) {
    logAppError?.(e, reason);
    return false;
  } finally {
    performanceCacheWarmInProgress = false;
  }
}

function daysSince(dateIso) {
  const d = new Date(dateIso);
  const now = new Date();
  return Math.max(0, Math.floor((now-d)/86400000));
}

function recentAllocationForRecommendation() {
  const logs = data.logs || [];
  const cacheKey = logsSignature(logs);
  if (undertrainedAllocationCache && undertrainedAllocationCacheKey === cacheKey) return undertrainedAllocationCache;
  const recent = logs.slice().sort((a,b)=>Date.parse(b.createdAt || 0)-Date.parse(a.createdAt || 0)).slice(0,30);
  undertrainedAllocationCache = computeAllocation(recent);
  undertrainedAllocationCacheKey = cacheKey;
  return undertrainedAllocationCache;
}
function undertrainedCategoryBonus(routineId) {
  const routine = routineById(routineId);
  if (!routine || recommendationMode(routine) === "excluded") return 0;
  const alloc = recentAllocationForRecommendation();
  const cat = alloc.find(a => a.cat === routine.category);
  if (!cat) return 12;
  if (cat.pct < 15) return 14;
  if (cat.pct < 25) return 7;
  return 0;
}

function rankRoutines(focusOverride="all", strategy="balanced") {
  const mode = getSmartRecommendationMode();
  return rankRoutinesByMode(focusOverride, strategy, mode).map(x => ({
    routine:x.routine,
    stats:x.stats,
    score: mode === "thompson" ? x.sampledValue : mode === "hybrid" ? x.hybridScore : x.score,
    sampledValue:x.sampledValue,
    trainingValueMean:x.trainingValueMean,
    uncertainty:x.uncertainty,
    selectionType:x.selectionType,
    evidenceLabel:x.evidenceLabel,
    reasons:x.reasons
  }));
}

function pickByCategory(ranked, category, usedIds, fallback=true) {
  const filtered = category ? ranked.filter(x => x.routine.category === category) : ranked;
  let item = weightedPick(filtered, usedIds);
  if (!item && fallback) item = weightedPick(ranked, usedIds);
  return item;
}

function difficultyGuidance(item) {
  if (!item) return "";
  const r = item.routine;
  const hit = item.stats.hit;
  const vals = item.stats.vals;
  const latest = vals.length ? vals[vals.length-1] : null;
  if (hit !== null && hit >= 80) return "Increase difficulty: tighter position, fewer attempts, or higher target.";
  if (hit !== null && hit <= 35) return "Reduce difficulty: simplify layout, isolate mechanic, or lower target.";
  if (latest !== null && r.target && latest >= r.target) return "Keep target, add mild pressure constraint.";
  return "Keep current difficulty and build clean repetitions.";
}

function composeBlocks(length, intensity, ranked, focusOverride) {
  const used = new Set();
  const total = Number(length || 60);

  let blocks;
  if (intensity === "technical") {
    blocks = [
      {name:"Block 1 — Precision / technique", pct:.45, category: focusOverride !== "all" ? focusOverride : "potting", intent:"clean execution while fresh"},
      {name:"Block 2 — Volume / consistency", pct:.35, category:"break-building", intent:"repeatable baseline"},
      {name:"Block 3 — Controlled pressure", pct:.20, category:"safety", intent:"finish with decision quality"}
    ];
  } else if (intensity === "pressure") {
    blocks = [
      {name:"Block 1 — Calibration", pct:.25, category: focusOverride !== "all" ? focusOverride : "potting", intent:"warm-up with measured scoring"},
      {name:"Block 2 — Pressure reps", pct:.45, category:"break-building", intent:"1-attempt or stop-rule constraints"},
      {name:"Block 3 — Match-control", pct:.30, category:"safety", intent:"decision quality under fatigue"}
    ];
  } else {
    blocks = [
      {name:"Block 1 — Fresh-skill priority", pct:.35, category: focusOverride !== "all" ? focusOverride : "potting", intent:"highest-skill work before fatigue"},
      {name:"Block 2 — Weakness volume", pct:.40, category:null, intent:"main bottleneck by data"},
      {name:"Block 3 — Pressure / transfer", pct:.25, category:"safety", intent:"convert skill into control"}
    ];
  }

  return blocks.map((b, idx) => {
    const mins = Math.max(5, Math.round(total*b.pct));
    const picks = [];
    const targetCategory = b.category || (ranked[0]?.routine.category);
    const first = pickByCategory(ranked, targetCategory, used, true);
    if (first) picks.push(first);
    if (mins >= 20) {
      const second = pickByCategory(ranked, targetCategory, used, false) || pickByCategory(ranked, null, used, true);
      if (second) picks.push(second);
    }
    return {...b, minutes: mins, picks};
  });
}

function generateNextSession(){
  if(!activeRoutines().length){$("orchestratorBox").innerHTML="Create exercises first.";return;}
  const length = $("orchestratorLength")?.value || "60";
  const intensity = $("orchestratorIntensity")?.value || "balanced";
  const focus = $("orchestratorFocus")?.value || "all";
  const strategy = $("orchestratorStrategy")?.value || "balanced";
  const ranked = rankRoutines(focus, strategy);
  const blocks = composeBlocks(length, intensity, ranked, focus);

  generatedPlanDraft = validRoutineIds(blocks.flatMap(b => b.picks.map(p => p.routine.id)));
  lastGeneratedPlannedRoutineIds = [...generatedPlanDraft];

  const weak = weaknessConcentration(data.logs)[0];
  const fatigue = fatigueCurve(data.logs);
  const context = [];
  if (weak) context.push(`Weakest area: ${weak.category}`);
  if (fatigue && fatigue.deltaPct < -12) context.push(`Fatigue risk: final third ${Math.abs(fatigue.deltaPct).toFixed(1)}% below early session`);
  if (focus !== "all") context.push(`Focus override: ${focus}`);
  context.push(`Strategy: ${strategy}`);

  $("orchestratorBox").innerHTML =
    `<div class="analytics-note"><strong>Session logic:</strong> ${context.length ? context.map(escapeHtml).join(" · ") : "balanced from available data"}</div>` +
    blocks.map(b => `<div class="training-block">
      <h3>${escapeHtml(b.name)}</h3>
      <div class="block-meta">${b.minutes} min · ${escapeHtml(b.intent)}</div>
      ${b.picks.map(p => `<div class="drill-line">
        <span><strong>${escapeHtml(p.routine.name)}</strong><br><span class="reason">${escapeHtml(p.routine.category || "uncategorized")} · priority score ${p.score.toFixed(1)}</span></span>
        <span>${p.routine.duration || Math.round(b.minutes / Math.max(1,b.picks.length))} min</span>
        <span>${escapeHtml(difficultyGuidance(p))}<ul class="reason-list">${(p.reasons || getRoutinePriorityReasons(p)).map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul></span>
      </div>`).join("")}
    </div>`).join("") +
    `<div class="difficulty-note"><strong>Difficulty calibration rule:</strong> 80%+ target hit rate = increase difficulty; below 35% = simplify; middle zone = repeat and stabilize.</div>`;
}

function loadGeneratedPlan(){
  if(!generatedPlanDraft.length) generateNextSession();
  if(!generatedPlanDraft.length) return;
  // Do not silently inject anchor drills into orchestrated drafts.
  // Anchor routines should only appear when explicitly selected or when a future adaptive block asks for an anchor baseline.
  planDraft = validRoutineIds(generatedPlanDraft);
  if ($("planName") && !$("planName").value.trim()) $("planName").value = `Orchestrated session — ${new Date().toLocaleDateString()}`;
  renderPlanBuilder();
  document.querySelector('[data-tab="plans"]').click();
}

document.addEventListener("DOMContentLoaded",()=>{
  const btn = document.getElementById("generateSessionBtn");
  if(btn) btn.addEventListener("click", generateNextSession);
  const loadBtn = document.getElementById("loadGeneratedPlanBtn");
  if(loadBtn) loadBtn.addEventListener("click", loadGeneratedPlan);
  const modeSelect = document.getElementById("smartRecommendationMode");
  if (modeSelect) {
    modeSelect.value = getSmartRecommendationMode();
    modeSelect.addEventListener("change", e => setSmartRecommendationMode(e.target.value));
  }
});


function updateTargetHints(){
  const scoring = $("routineScoring")?.value || "";
  let txt = "";
  if(scoring === "success_rate" || scoring === "progressive_completion"){
    txt = "(use %)";
  } else {
    txt = "(use number)";
  }
  if($("targetScoreHint")) $("targetScoreHint").textContent = txt;
  if($("stretchScoreHint")) $("stretchScoreHint").textContent = txt;
}
document.addEventListener("change", e=>{
  if(e.target && e.target.id==="routineScoring") updateTargetHints();
});
document.addEventListener("DOMContentLoaded", updateTargetHints);

function applyStoredStatsModeVisual() {
  statsMode = normalizeStatsMode(statsMode);
  document.querySelectorAll(".stats-nav-btn[data-stats-mode]").forEach(btn => {
    btn.classList.toggle("active-subtab", normalizeStatsMode(btn.dataset.statsMode) === statsMode);
    btn.setAttribute("aria-selected", normalizeStatsMode(btn.dataset.statsMode) === statsMode ? "true" : "false");
  });
  toggleStatsStandalonePanels();
}
document.addEventListener("DOMContentLoaded", applyStoredStatsModeVisual);
/* v3.25.9 interface settings core — single deterministic API. */
function normalizeInterfaceSettingValue(dataKey, value, fallback) {
  if (dataKey === "themeMode") return normalizeInterfaceThemeMode(value);
  if (dataKey === "displayDensity") return normalizeDisplayDensity(value);
  if (dataKey === "insightLanguage") return normalizeInsightLanguage(value);
  if (dataKey === "timerAutostart") return normalizeTimerAutostart(value);
  if (dataKey === "timerAutostartDelaySeconds") return normalizeTimerAutostartDelay(value);
  if (dataKey === "wakeLock") return normalizeWakeLock(value);
  return normalizeOnOff(value, fallback);
}
function interfaceReadSetting(storageKey, dataKey, fallback) {
  try {
    const local = localStorage.getItem(storageKey);
    if (local !== null && local !== undefined && local !== "") return normalizeInterfaceSettingValue(dataKey, local, fallback);
  } catch(e) {}
  try {
    const stored = data && data.interfaceSettings ? data.interfaceSettings[dataKey] : null;
    if (stored !== null && stored !== undefined && stored !== "") return normalizeInterfaceSettingValue(dataKey, stored, fallback);
  } catch(e) {}
  return fallback;
}
function interfaceWriteSetting(storageKey, dataKey, value) {
  const clean = normalizeInterfaceSettingValue(dataKey, value, dataKey === "timerAutostart" ? "manual" : "on");
  try { localStorage.setItem(storageKey, clean); } catch(e) { if (typeof logAppError === "function") logAppError(e, "interfaceWriteSetting localStorage"); }
  try {
    data.interfaceSettings = data.interfaceSettings || {};
    data.interfaceSettings[dataKey] = clean;
    data.updatedAt = new Date().toISOString();
    if (typeof saveCoreData === "function") saveCoreData("interface setting core save");
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeCoreData(data)));
  } catch(e) { if (typeof logAppError === "function") logAppError(e, "interfaceWriteSetting main data"); }
  return clean;
}
function getThemeModeSetting(){ return interfaceReadSetting(THEME_MODE_KEY, "themeMode", "system"); }
function getSessionFocusSetting(){ return interfaceReadSetting(SESSION_FOCUS_MODE_KEY, "sessionFocusMode", "on"); }
function getQuickLogAutoAdvanceSetting(){ return interfaceReadSetting(QUICK_LOG_AUTO_ADVANCE_KEY, "quickLogAutoAdvance", "on"); }
function getDisplayDensitySetting(){ return interfaceReadSetting(DISPLAY_DENSITY_KEY, "displayDensity", "comfortable"); }
function getInterfaceInsightLanguageSetting(){ return getInsightLanguageSetting(); }
function getTimerAutostartSetting(){ return interfaceReadSetting(TIMER_AUTOSTART_KEY, "timerAutostart", "manual"); }
function getTimerAutostartDelaySetting(){ return Number(interfaceReadSetting(TIMER_AUTOSTART_DELAY_KEY, "timerAutostartDelaySeconds", 0)) || 0; }
function applyDisplayDensity(mode){
  const clean = normalizeDisplayDensity(mode || getDisplayDensitySetting());
  [document.documentElement, document.body].filter(Boolean).forEach(el => {
    el.classList.remove("density-comfortable", "density-compact", "density-very-compact");
    el.classList.add("density-" + clean);
    el.setAttribute("data-density", clean);
  });
  return clean;
}
function applyThemeMode(mode){
  const storedMode = normalizeInterfaceThemeMode(mode || getThemeModeSetting());
  applyThemeToDocument(storedMode);
}
function renderInterfaceSettings(){
  applyThemeMode();
  applyDisplayDensity();
  const theme = $("themeModeSelect");
  const focus = $("sessionFocusModeSelect");
  const quick = $("quickLogAutoAdvanceSelect");
  const density = $("displayDensitySelect");
  const insightLanguage = $("insightLanguageSelect");
  const timerAuto = $("timerAutostartSelect");
  const timerDelay = $("timerAutostartDelaySelect");
  const wake = $("wakeLockSelect");
  if (theme) theme.value = getThemeModeSetting();
  if (focus) focus.value = getSessionFocusSetting();
  if (quick) quick.value = getQuickLogAutoAdvanceSetting();
  if (density) density.value = getDisplayDensitySetting();
  if (insightLanguage) insightLanguage.value = getInsightLanguageSetting();
  if (timerAuto) timerAuto.value = getTimerAutostartSetting();
  if (timerDelay) {
    const delayValue = String(getTimerAutostartDelaySetting());
    if (delayValue && !Array.from(timerDelay.options || []).some(opt => opt.value === delayValue)) {
      const opt = document.createElement("option");
      opt.value = delayValue;
      opt.textContent = `${delayValue} seconds (custom)`;
      timerDelay.appendChild(opt);
    }
    timerDelay.value = delayValue;
  }
  if (wake) wake.value = getWakeLockSetting();
}
var currentSessionFocusActive = null;
function isActiveSessionVisible(){
  const el = $("activeSession");
  return !!(activeSession && el && !el.classList.contains("hidden"));
}
function resetSessionFocusScrollTop(){
  if (!document.body?.classList.contains("session-focus-active")) return;
  const activeCard = $("activeSession");
  try { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); } catch(e) { window.scrollTo(0, 0); }
  try { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; } catch(e) {}
  if (activeCard && typeof activeCard.scrollTo === "function") {
    try { activeCard.scrollTo({ top: 0, left: 0, behavior: "auto" }); } catch(e) { activeCard.scrollTop = 0; }
  }
}
function updateSessionFocusState(){
  const active = isActiveSessionVisible();
  if (!active) currentSessionFocusActive = null;
  if (active && currentSessionFocusActive == null) currentSessionFocusActive = getSessionFocusSetting() !== "off";
  const focusActive = !!(active && currentSessionFocusActive);
  document.body?.classList.toggle("session-focus-active", focusActive);
  const activeCard = $("activeSession");
  if (activeCard) {
    activeCard.classList.toggle("focus-first-exercise", !!(focusActive && activeSession && Number(activeSession.index || 0) === 0));
  }
  if (active && currentSessionFocusActive) requestAnimationFrame(() => resetSessionFocusScrollTop());
  const btn = $("toggleFocusModeBtn");
  if (btn) {
    btn.textContent = active && currentSessionFocusActive ? "Exit focus mode" : "Focus Mode";
    btn.setAttribute("aria-pressed", active && currentSessionFocusActive ? "true" : "false");
    btn.setAttribute("title", active && currentSessionFocusActive ? "Exit focus mode" : "Enter focus mode");
  }
  const timerLabels = [["timerStartBtn","Start"],["timerPauseBtn","Pause"],["timerResetBtn","Reset"]];
  timerLabels.forEach(([id,label]) => { const el = $(id); if (el) el.setAttribute("data-focus-label", label); });
  syncFocusWakeLock();
}
function toggleSessionFocusMode(){
  if (!isActiveSessionVisible()) return;
  currentSessionFocusActive = !document.body.classList.contains("session-focus-active");
  updateSessionFocusState();
}
let interfaceSettingsBound = false;
function bindInterfaceSettings(){
  if (interfaceSettingsBound) return;
  interfaceSettingsBound = true;
  applyThemeMode();
  applyDisplayDensity();
  renderInterfaceSettings();
  document.addEventListener("change", e => {
    const el = e.target;
    if (!el || !el.id) return;
    if (el.id === "themeModeSelect") {
      const clean = interfaceWriteSetting(THEME_MODE_KEY, "themeMode", el.value);
      el.value = clean;
      applyThemeMode(clean);
    } else if (el.id === "sessionFocusModeSelect") {
      const clean = interfaceWriteSetting(SESSION_FOCUS_MODE_KEY, "sessionFocusMode", el.value);
      el.value = clean;
      if (!isActiveSessionVisible()) currentSessionFocusActive = null;
      updateSessionFocusState();
    } else if (el.id === "quickLogAutoAdvanceSelect") {
      const clean = interfaceWriteSetting(QUICK_LOG_AUTO_ADVANCE_KEY, "quickLogAutoAdvance", el.value);
      el.value = clean;
      if (activeSession) renderCurrentRoutine();
    } else if (el.id === "displayDensitySelect") {
      const clean = interfaceWriteSetting(DISPLAY_DENSITY_KEY, "displayDensity", el.value);
      el.value = clean;
      applyDisplayDensity(clean);
      renderStats();
    } else if (el.id === "insightLanguageSelect") {
      const clean = setInsightLanguageSetting(el.value);
      el.value = clean;
      renderStats();
      renderPhaseOneInsights?.();
      renderAdaptiveSession?.();
      if (typeof renderRecommendations === "function") renderRecommendations();
      showTransientNotice(clean === "friendly" ? "Friendly insight language enabled." : "Analytical insight language enabled.", "ok");
    } else if (el.id === "timerAutostartSelect") {
      const clean = interfaceWriteSetting(TIMER_AUTOSTART_KEY, "timerAutostart", el.value);
      el.value = clean;
      if (activeSession) { cancelTimerAutostartDelay(); scheduleTimerAutostartForCurrentRoutine(); }
    } else if (el.id === "timerAutostartDelaySelect") {
      const clean = interfaceWriteSetting(TIMER_AUTOSTART_DELAY_KEY, "timerAutostartDelaySeconds", el.value);
      el.value = String(clean);
      if (activeSession && getTimerAutostartSetting() === "auto" && !timerStartMs && getElapsedMs() === 0) scheduleTimerAutostartForCurrentRoutine();
    } else if (el.id === "wakeLockSelect") {
      const clean = interfaceWriteSetting(WAKE_LOCK_KEY, "wakeLock", el.value);
      el.value = clean;
      syncFocusWakeLock();
      showTransientNotice(clean === "on" ? "Wake lock enabled for Focus Mode." : "Wake lock disabled.", "ok");
    }
  });
  const focusBtn = $("toggleFocusModeBtn");
  if (focusBtn) focusBtn.addEventListener("click", e => { e.preventDefault(); toggleSessionFocusMode(); });
  try {
    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const fn = () => { if (getThemeModeSetting() === "system") applyThemeMode("system"); };
      if (mq.addEventListener) mq.addEventListener("change", fn); else if (mq.addListener) mq.addListener(fn);
    }
  } catch(e) {}
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindInterfaceSettings); else bindInterfaceSettings();


function refreshCurrentRoutineLivePerformance() {
  const r = activeSession ? routineById(activeSession.routineIds?.[activeSession.index]) : null;
  if (r) renderLivePerformanceCard(r);
}



function setPracticeMainTab(tab){
  const allowed = new Set(["regular", "smart", "pressure"]);
  const clean = allowed.has(tab) ? tab : "regular";
  document.querySelectorAll("[data-practice-panel]").forEach(panel => {
    const active = panel.dataset.practicePanel === clean;
    panel.classList.toggle("hidden", !active);
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-action='practice-main-tab']").forEach(btn => {
    const active = btn.dataset.practiceTab === clean;
    btn.classList.toggle("active-subtab", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  try { localStorage.setItem("snookerPracticeMainTab", clean); } catch(e) {}
  if (clean === "smart") {
    try { renderSmartRecommendation(); renderPeriodization(); } catch(e) { logAppError(e, "setPracticeMainTab smart"); }
  }
  if (clean === "pressure") {
    try { if (typeof renderPressureRoutineOptions === "function") renderPressureRoutineOptions(); } catch(e) { logAppError(e, "setPracticeMainTab pressure"); }
  }
}
function restorePracticeMainTab(){
  let saved = "regular";
  try { saved = localStorage.getItem("snookerPracticeMainTab") || "regular"; } catch(e) {}
  setPracticeMainTab(saved);
}

function setPlansMainTab(tab){
  const allowed = new Set(["daily", "randomizer", "constraint"]);
  const clean = allowed.has(tab) ? tab : "daily";
  document.querySelectorAll("[data-plans-panel]").forEach(panel => {
    const active = panel.dataset.plansPanel === clean;
    panel.classList.toggle("hidden", !active);
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-action='plans-main-tab']").forEach(btn => {
    const active = btn.dataset.plansTab === clean;
    btn.classList.toggle("active-subtab", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  try { localStorage.setItem("snookerPlansMainTab", clean); } catch(e) {}
  if (clean === "daily") {
    try { renderPlanBuilder(); renderPlanList(); } catch(e) { logAppError(e, "setPlansMainTab daily"); }
  }
  if (clean === "constraint") {
    try { renderRoutineSelects(); } catch(e) { logAppError(e, "setPlansMainTab constraint"); }
  }
}
function restorePlansMainTab(){
  let saved = "daily";
  try { saved = localStorage.getItem("snookerPlansMainTab") || "daily"; } catch(e) {}
  setPlansMainTab(saved);
}


function setTemplatesMainTab(tab){
  const allowed = new Set(["exercises", "tables", "skills"]);
  const clean = allowed.has(tab) ? tab : "exercises";
  document.querySelectorAll("[data-templates-panel]").forEach(panel => {
    const active = panel.dataset.templatesPanel === clean;
    panel.classList.toggle("hidden", !active);
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-action='templates-main-tab']").forEach(btn => {
    const active = btn.dataset.templatesTab === clean;
    btn.classList.toggle("active-subtab", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  try { localStorage.setItem("snookerTemplatesMainTab", clean); } catch(e) {}
  if (clean === "exercises") {
    try { renderRoutineList(); } catch(e) { logAppError(e, "setTemplatesMainTab exercises"); }
  }
  if (clean === "tables") {
    try { renderTableDatabase(); } catch(e) { logAppError(e, "setTemplatesMainTab tables"); }
  }
  if (clean === "skills") {
    try { renderSkillManager(); } catch(e) { logAppError(e, "setTemplatesMainTab skills"); }
  }
}
function restoreTemplatesMainTab(){
  let saved = "exercises";
  try { saved = localStorage.getItem("snookerTemplatesMainTab") || "exercises"; } catch(e) {}
  setTemplatesMainTab(saved);
}

function setDataMainTab(tab){
  const allowed = new Set(["settings", "import-export", "developer"]);
  const clean = allowed.has(tab) ? tab : "settings";
  document.querySelectorAll("[data-data-panel]").forEach(panel => {
    const active = panel.dataset.dataPanel === clean;
    panel.classList.toggle("hidden", !active);
    panel.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-action='data-main-tab']").forEach(btn => {
    const active = btn.dataset.dataTab === clean;
    btn.classList.toggle("active-subtab", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
  try { localStorage.setItem("snookerDataMainTab", clean); } catch(e) {}
  if (clean === "developer") {
    try { renderStorageDashboard(); } catch(e) { logAppError(e, "setDataMainTab renderStorageDashboard"); }
  }
}
function restoreDataMainTab(){
  let saved = "settings";
  try { saved = localStorage.getItem("snookerDataMainTab") || "settings"; } catch(e) {}
  setDataMainTab(saved);
}

function handleDelegatedUIAction(event) {
  const targetElement = event.target instanceof Element ? event.target : event.target?.parentElement;
  const actionEl = targetElement?.closest?.("[data-action]");
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (!action) return;
  if (action === "modal-backdrop-close" && event.target !== actionEl) return;
  event.preventDefault();
  const id = actionEl.dataset.id || "";
  switch (action) {
    case "field-help": return showFieldHelp(actionEl.dataset.helpKey || "");
    case "switch-tab": return activateTab(actionEl.dataset.tab || "practice");
    case "open-today-panel": return activateTab("today");
    case "open-library-exercises": activateTab("templates"); return setTemplatesMainTab("exercises");
    case "open-library-plans": activateTab("plans"); return restorePlansMainTab();
    case "open-library-skills": activateTab("templates"); return setTemplatesMainTab("skills");
    case "hide-field-help": return hideFieldHelp();
    case "skip-reflection": return skipReflection();
    case "save-reflection": return saveReflection();
    case "close-log-edit": return closeLogEditModal();
    case "save-log-edit": return saveEditedLogFromModal();
    case "modal-backdrop-close": {
      const modalId = actionEl.dataset.modal;
      if (modalId === "fieldHelpModal") return hideFieldHelp();
      if (modalId === "reflectionModal") return skipReflection();
      if (modalId === "logEditModal") return closeLogEditModal();
      return;
    }
    case "toggle-focus": return window.SnookerInterface?.toggleFocus?.();
    case "edit-routine": return editRoutine(id);
    case "duplicate-routine": return duplicateRoutine(id);
    case "delete-routine": return deleteRoutine(id);
    case "toggle-favorite-routine": return toggleFavoriteRoutine(id);
    case "move-plan-routine": return movePlanRoutine(Number(actionEl.dataset.index || 0), Number(actionEl.dataset.direction || 0));
    case "remove-plan-routine": return removePlanRoutine(Number(actionEl.dataset.index || 0));
    case "load-plan": return loadPlanToBuilder(id);
    case "delete-plan": return deletePlan(id);
    case "edit-table": return editTableDefinition(id);
    case "delete-table": return deleteTableDefinition(id);
    case "open-log-edit": return openLogEditModal(id);
    case "delete-log": return deleteLog(id);
    case "score-set": hapticFeedback("tap"); setScoreValue(Number(actionEl.dataset.score || 0)); focusModeScoreFeedback("scoreValue"); return refreshCurrentRoutineLivePerformance();
    case "score-adjust": hapticFeedback("tap"); adjustScore(Number(actionEl.dataset.delta || 0)); focusModeScoreFeedback("scoreValue"); return refreshCurrentRoutineLivePerformance();
    case "focus-step":
      if (focusStepFiredByHold) {
        focusStepFiredByHold = false;
        return;
      }
      hapticFeedback("tap");
      adjustNumericInputValue(actionEl.dataset.target || "scoreValue", Number(actionEl.dataset.delta || 0));
      return refreshCurrentRoutineLivePerformance();
    case "focus-numpad": hapticFeedback("tap"); return handleFocusNumpad(actionEl.dataset.numpadAction || "digit", actionEl.dataset.value || "");
    case "set-session-rating": { const v = actionEl.dataset.rating || ""; const el = $("sessionRating"); if (el) { el.value = v; if (activeSession) { activeSession.sessionRatingDraft = v; persistActiveSession(); } syncSessionQualityTiles(); } hapticFeedback("tap"); return; }
    case "set-reflection-rating": return setReflectionRating(actionEl.dataset.target || "", actionEl.dataset.rating || "");
    case "toggle-skill-chip": return toggleSkillChip(actionEl.dataset.target || "", actionEl.dataset.container || "", actionEl.dataset.skillId || "");
    case "recommendation-feedback": return trackRecommendationFeedback(id, actionEl.dataset.feedback || "accepted", {source:actionEl.dataset.source || "smart_session_builder"});
    case "same-as-last": fillSameAsLastTime(); return refreshCurrentRoutineLivePerformance();
    case "repeat-last-score-setup": return applyLastScoreSetup();
    case "quick-log": return quickLogScore(Number(actionEl.dataset.score || 0));
    case "open-data-tab": document.querySelector('[data-tab="data"]')?.click(); return setDataMainTab("developer");
    case "data-main-tab": return setDataMainTab(actionEl.dataset.dataTab || "settings");
    case "practice-main-tab": return setPracticeMainTab(actionEl.dataset.practiceTab || "regular");
    case "plans-main-tab": return setPlansMainTab(actionEl.dataset.plansTab || "daily");
    case "templates-main-tab": return setTemplatesMainTab(actionEl.dataset.templatesTab || "exercises");
    case "edit-skill-tag": return editSkillTag(id);
    case "archive-skill-tag": return archiveSkillTag(id);
    case "merge-skill-tag": return mergeSkillTag(id);
    case "apply-target-upgrade": return applyTargetUpgrade(id);
    case "quick-start-default-plan": return createDefaultQuickStartPlan();
    case "show-more-history":
      historyRenderRowLimit = Math.min(2000, Math.max(HISTORY_RENDER_ROW_LIMIT, historyRenderRowLimit || HISTORY_RENDER_ROW_LIMIT) + HISTORY_RENDER_ROW_INCREMENT);
      return renderStats();
  }
}


document.addEventListener("pointerdown", function(event) {
  const btn = event.target instanceof Element ? event.target.closest?.('[data-action="focus-step"]') : null;
  if (!btn || !document.body?.classList.contains("session-focus-active")) return;
  cancelFocusStepHold();
  const target = btn.dataset.target || "scoreValue";
  const delta = Number(btn.dataset.delta || 0);
  btn.classList.add("focus-hold-active");
  focusStepHoldStartTimer = setTimeout(() => {
    focusStepFiredByHold = true;
    adjustNumericInputValue(target, delta);
    refreshCurrentRoutineLivePerformance();
    focusStepHoldRepeatTimer = setInterval(() => {
      adjustNumericInputValue(target, delta);
      refreshCurrentRoutineLivePerformance();
    }, 95);
    focusStepHoldAccelerationTimer = setTimeout(() => {
      if (focusStepHoldRepeatTimer) clearInterval(focusStepHoldRepeatTimer);
      focusStepHoldRepeatTimer = setInterval(() => {
        adjustNumericInputValue(target, Math.sign(delta || 1) * Math.max(1, Math.abs(delta) * 3));
        refreshCurrentRoutineLivePerformance();
      }, 75);
    }, 850);
  }, 300);
}, {passive:true});
["pointerup","pointercancel","pointerleave","blur"].forEach(evt => document.addEventListener(evt, event => {
  const btn = event.target instanceof Element ? event.target.closest?.('[data-action="focus-step"]') : null;
  btn?.classList?.remove("focus-hold-active");
  cancelFocusStepHold();
}, {passive:true}));
document.addEventListener("touchstart", handleFocusSwipeStart, {passive:true});
document.addEventListener("touchend", handleFocusSwipeEnd, {passive:true});

safeOn("saveSkillTagBtn", "click", saveSkillTagFromForm);
safeOn("clearSkillTagFormBtn", "click", () => { clearSkillTagForm(); renderSkillManager(); });
safeOn("skillManagerFilterGroup", "change", renderSkillManager);
safeOn("skillManagerSearch", "input", debounce(() => renderSkillManager(), 150));


document.addEventListener("focusin", event => {
  if (!document.body?.classList.contains("session-focus-active")) return;
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const tag = target.tagName;
  const type = String(target.getAttribute("type") || target.type || "").toLowerCase();
  if (tag === "TEXTAREA" || type === "text" || type === "search" || type === "email" || type === "url") {
    document.body.classList.add("focus-keyboard-open");
  }
});
document.addEventListener("focusout", () => {
  document.body?.classList?.remove("focus-keyboard-open");
});

document.addEventListener("click", handleDelegatedUIAction);
document.addEventListener("change", event => {
  if (event.target && event.target.id === "sessionRating") {
    if (activeSession) { activeSession.sessionRatingDraft = event.target.value || ""; persistActiveSession(); }
    syncSessionQualityTiles();
  }
});

window.SnookerInterface = {
  readTheme:getThemeModeSetting, setTheme:function(v){ const c=interfaceWriteSetting(THEME_MODE_KEY,"themeMode",v); applyThemeMode(c); renderInterfaceSettings(); return c; }, applyTheme:applyThemeMode,
  readFocusDefault:getSessionFocusSetting, setFocusDefault:function(v){ const c=interfaceWriteSetting(SESSION_FOCUS_MODE_KEY,"sessionFocusMode",v); renderInterfaceSettings(); updateSessionFocusState(); return c; },
  readQuick:getQuickLogAutoAdvanceSetting, setQuick:function(v){ const c=interfaceWriteSetting(QUICK_LOG_AUTO_ADVANCE_KEY,"quickLogAutoAdvance",v); renderInterfaceSettings(); if(activeSession) renderCurrentRoutine(); return c; },
  readDensity:getDisplayDensitySetting, setDensity:function(v){ const c=interfaceWriteSetting(DISPLAY_DENSITY_KEY,"displayDensity",v); applyDisplayDensity(c); renderInterfaceSettings(); renderStats(); return c; },
  readInsightLanguage:getInsightLanguageSetting, setInsightLanguage:function(v){ const c=setInsightLanguageSetting(v); renderInterfaceSettings(); renderStats(); renderPhaseOneInsights?.(); return c; },
  readTimerAutostart:getTimerAutostartSetting, setTimerAutostart:function(v){ const c=interfaceWriteSetting(TIMER_AUTOSTART_KEY,"timerAutostart",v); renderInterfaceSettings(); if(activeSession) scheduleTimerAutostartForCurrentRoutine(); return c; },
  readTimerAutostartDelay:getTimerAutostartDelaySetting, setTimerAutostartDelay:function(v){ const c=interfaceWriteSetting(TIMER_AUTOSTART_DELAY_KEY,"timerAutostartDelaySeconds",v); renderInterfaceSettings(); if(activeSession) scheduleTimerAutostartForCurrentRoutine(); return c; },
  readWakeLock:getWakeLockSetting, setWakeLock:function(v){ const c=interfaceWriteSetting(WAKE_LOCK_KEY,"wakeLock",v); renderInterfaceSettings(); syncFocusWakeLock(); return c; },
  toggleFocus:toggleSessionFocusMode, updateFocusUI:updateSessionFocusState, syncControls:renderInterfaceSettings, bind:bindInterfaceSettings
};
function renderLivePerformanceCard(r){
  const box = $("livePerformanceCard");
  if (!box || !r) return;
  const sideSplitEnabled = routineUsesSideSplit(r);
  const score = sideSplitEnabled ? computeSideCombinedScore($("leftSideScoreValue")?.value || 0, $("rightSideScoreValue")?.value || 0) : Number($("scoreValue")?.value || 0);
  const attempts = Number($("attemptsValue")?.value || r.attempts || r.attemptsPerSession || 0);
  const draftLog = {scoring:r.scoring, score, attempts, sideMode: sideSplitEnabled ? "left_right" : "none", sideSplitEnabled, attemptMode: sideSplitEnabled ? getRoutineAttemptMode(r) : "shared", totalUnitsAtLog:r.totalUnits || 0, totalUnits:r.totalUnits || 0, timeMinutes:Number($("manualTimeValue")?.value || r.duration || 0)};
  const normalized = normalizeScore(draftLog);
  const profile = getActiveTargetProfile(r);
  const target = Number(profile?.target || r.target || 0);
  const stretch = Number(profile?.stretchTarget || r.stretchTarget || 0);
  const allRoutineLogs = data.logs.filter(l => l.routineId === r.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  const recent = allRoutineLogs.slice(0,3);
  const pb = allRoutineLogs.map(l => Number(l.normalizedScore || 0)).filter(v => Number.isFinite(v));
  const personalBest = pb.length ? safeMax(pb, null) : null;
  const status = target && normalized >= stretch && stretch ? "green" : target && normalized >= target ? "green" : target && normalized >= target * 0.75 ? "yellow" : target ? "red" : "neutral";
  const statusText = status === "green" ? "On target" : status === "yellow" ? "Near target" : status === "red" ? "Below target" : "No target";
  box.innerHTML = `<div class="live-perf ${safeClassToken(status, ["green","yellow","red","neutral"], "neutral")}">
    <div><strong>Live target check</strong><span>${htmlText(statusText)}</span></div>
    <div><span>Current</span><strong>${Number(normalized || 0).toFixed(r.scoring === "score_per_minute" ? 2 : 1)}${r.scoring === "success_rate" || r.scoring === "progressive_completion" ? "%" : ""}</strong></div>
    <div class="live-perf-pb"><span>Personal best</span><strong>${personalBest === null ? "N/A" : personalBest.toFixed(r.scoring === "score_per_minute" ? 2 : 1)}</strong></div>
    <div><span>Target</span><strong>${target || "N/A"}</strong></div>
    <div><span>Stretch</span><strong>${stretch || "N/A"}</strong></div>
    <div><span>Last 3</span><strong>${recent.length ? recent.map(l => Number(l.normalizedScore || 0).toFixed(0)).join(" / ") : "N/A"}</strong></div>
  </div>`;
}

function ensureBayesianValidationPanel() {
  const statsPanel = $("stats");
  if (!statsPanel || $("bayesianValidationOutput")) return;
  const card = document.createElement("div");
  card.className = "card";
  card.id = "statsBayesianPanel";
  card.innerHTML = `<div id="bayesianValidationOutput"></div>`;
  statsPanel.appendChild(card);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureBayesianValidationPanel);
else ensureBayesianValidationPanel();

function renderBayesianValidationForRoutine(routineId) {
  const r = routineById(routineId);
  if (!r || r.scoring !== "success_rate") return "";
  const logs = successRateLogsForRoutine(routineId);
  const agg = aggregateSuccessRateLogs(logs);
  const prior = hierarchicalPriorForRoutine(r);
  const posterior = betaPosterior(agg.successes, agg.attempts, prior.alpha, prior.beta, {...prior, rawAttempts:agg.rawAttempts, rawSuccesses:agg.rawSuccesses});
  const reliability = bayesianReliabilityLabel(posterior);
  const target = Number(r.target || 0);
  const signal = bayesianRecommendationSignal({posterior, targetPct:target});
  const policy = bayesianActionPolicy(signal, posterior, target);
  return `<div class="bayes-card bayes-${safeClassToken(reliability.level, ["low","medium","high"], "low")} bayes-action-${safeClassToken(policy.action, ["repeat","progress","hold","rebuild"], "hold")}">
    <div class="bayes-card-title"><strong>True Skill estimate — ${htmlText(r.name)}</strong><span class="bayes-action-badge">${htmlText(policy.badge)}</span></div>
    <div class="bayes-grid">
      <div><span>Estimated skill</span><strong>${formatPercent(posterior.mean)}</strong></div>
      <div><span>Estimated range</span><strong>${formatPercent(posterior.lower)}–${formatPercent(posterior.upper)}</strong></div>
      <div><span>${kpiTitle("Evidence", "kpiEvidence")}</span><strong>${numText(agg.attempts, "0")} effective attempts / ${numText(agg.sessions, "0")} logs</strong></div>
      <div><span>Reliability</span><strong>${htmlText(reliability.label)}</strong></div>
      <div><span>Prior source</span><strong>${htmlText(prior.label)}</strong></div>
    </div>
    <div class="bayes-action-box">
      <strong>${htmlText(policy.title)}</strong>
      <p>${htmlText(policy.instruction)}</p>
      <p class="muted">${htmlText(policy.coaching)} ${htmlText(policy.detail)}</p>
    </div>
    <p class="muted">${htmlText(prior.detail)} ${htmlText(reliability.detail)} ${htmlText(bayesianAdvice(posterior, target))}</p>
  </div>`;
}



function computeTournamentPrepPlan(logs = []) {
  const scopedLogs = Array.isArray(logs) ? logs.slice() : [];
  const daysInput = Number($("tournamentPrepDays")?.value || 14);
  const format = $("tournamentPrepFormat")?.value || "best_of_7";
  const formatProfile = ({best_of_5:{stamina:0.95, pressure:0.95, label:"short match"}, best_of_7:{stamina:1.00, pressure:1.00, label:"standard match"}, best_of_11:{stamina:1.15, pressure:1.10, label:"long-format match"}})[format] || {stamina:1, pressure:1, label:"standard match"};
  const focus = $("tournamentPrepFocus")?.value || "balanced";
  const risk = $("tournamentPrepRisk")?.value || "balanced";
  const minutes = Number($("tournamentPrepMinutes")?.value || 90);

  const daysRemaining = Math.max(1, daysInput);
  const ordered = scopedLogs
    .filter(l => l && l.createdAt)
    .sort((a,b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
  const recent = ordered.slice(-20);
  const values = recent.map(l => Number(l.normalizedScore || 0)).filter(Number.isFinite);
  const avgScore = values.length ? avg(values) : null;
  const hit = recent.length ? targetHitRate(recent) : null;
  const psi = recent.length >= 3 ? performanceStabilityIndex(recent, Math.min(10, recent.length)) : null;
  const pressureLogs = recent.filter(l => l.pressureEnabled || l.sessionType === "pressure");
  const pressureShare = recent.length ? pressureLogs.length / recent.length * 100 : 0;
  const timeTotal = recent.reduce((sum, l) => sum + Number(l.timeMinutes || 0), 0);
  const lastLog = ordered.length ? ordered[ordered.length - 1] : null;
  const daysSinceLastLog = lastLog ? daysSince(lastLog.createdAt) : null;

  const sideLogs = recent.filter(logUsesSideSplit);
  let sideImbalance = null;
  if (sideLogs.length) {
    let left = 0, right = 0, count = 0;
    sideLogs.forEach(l => {
      const ls = getLogLeftSideScore(l);
      const rs = getLogRightSideScore(l);
      if (Number.isFinite(ls) && Number.isFinite(rs)) { left += ls; right += rs; count += 1; }
    });
    if (count) sideImbalance = Math.abs(left - right) / Math.max(1, left + right) * 100;
  }

  const evidenceScore = Math.min(100, ordered.length * 3);
  const recencyScore = daysSinceLastLog === null ? 0 : Math.max(0, 100 - daysSinceLastLog * 12);
  const performanceScore = avgScore === null ? 0 : Math.max(0, Math.min(100, avgScore));
  const hitScore = hit === null ? performanceScore : hit;
  const stabilityScore = psi === null ? Math.min(60, evidenceScore) : psi;
  const pressureScore = Math.min(100, pressureShare * 3);
  const balancePenalty = sideImbalance === null ? 0 : Math.min(20, sideImbalance / 2);
  const staminaDemandPenalty = Math.max(0, (formatProfile.stamina - 1) * Math.max(0, 75 - stabilityScore));
  const pressureDemandPenalty = Math.max(0, (formatProfile.pressure - 1) * Math.max(0, 40 - pressureShare));
  const readiness = Math.max(0, Math.min(100,
    performanceScore * 0.30 +
    hitScore * 0.20 +
    stabilityScore * 0.20 +
    evidenceScore * 0.15 +
    recencyScore * 0.10 +
    pressureScore * 0.05 -
    balancePenalty -
    staminaDemandPenalty -
    pressureDemandPenalty
  ));

  let readinessLabel = "Needs data";
  let readinessDetail = "Log regular practice sessions first; the planner will become more useful after 8–12 logs.";
  if (ordered.length >= 3) {
    if (readiness >= 75) {
      readinessLabel = "Ready / maintain";
      readinessDetail = "Current form looks usable. Prioritize match realism, confidence, and avoiding unnecessary technical changes.";
    } else if (readiness >= 55) {
      readinessLabel = "Build / stabilize";
      readinessDetail = "Current form is workable but not fully robust. Keep volume controlled and address the weakest signal.";
    } else {
      readinessLabel = "Rebuild / simplify";
      readinessDetail = "Readiness is weak or unstable. Reduce complexity, rebuild confidence, and avoid adding new technical changes close to the event.";
    }
  }

  let intensity = "moderate";
  let taper = "No taper required yet.";

  if (daysRemaining <= 3) {
    intensity = "low";
    taper = "Avoid major technical changes; prioritize confidence, rhythm, and short pressure blocks.";
  } else if (daysRemaining <= 7) {
    intensity = "controlled";
    taper = "Reduce total volume slightly while maintaining match realism.";
  }
  if (readiness < 50 && ordered.length >= 3) intensity = "controlled";
  if (minutes >= 150 && daysRemaining <= 7) taper = "Daily duration is high for the final week; reduce volume if focus or scoring quality deteriorates.";

  const blocks = [];

  if (focus === "potting") {
    blocks.push("Long potting under pressure");
    blocks.push("Straight cue-ball control");
  } else if (focus === "safety") {
    blocks.push("Distance safety exchanges");
    blocks.push("Thin contact control");
  } else if (focus === "break_building") {
    blocks.push("Break conversion drills");
    blocks.push("Transition position routes");
  } else {
    blocks.push("Mixed match simulation");
    blocks.push("Pressure scoring routines");
  }

  if (format === "best_of_11") blocks.push("Long-format stamina and concentration block");
  if (pressureShare < 20 && ordered.length >= 6) blocks.push("Short match-pressure blocks");
  if (sideImbalance !== null && sideImbalance >= 15) blocks.push("Left/right balancing block");
  if (risk === "aggressive") {
    blocks.push("High-pressure scoring finishes");
  } else if (risk === "conservative") {
    blocks.push("Stability and percentage shot selection");
  }

  return {
    daysRemaining,
    format,
    formatProfile,
    focus,
    risk,
    minutes,
    intensity,
    taper,
    blocks,
    evidenceLogs: ordered.length,
    recentLogs: recent.length,
    recentAvg: avgScore,
    hitRate: hit,
    stability: psi,
    pressureShare,
    sideImbalance,
    timeTotal,
    daysSinceLastLog,
    readiness,
    readinessLabel,
    readinessDetail
  };
}


function allocationDeltaForRoutine(routine) {
  if (!routine) return null;
  const recentLogs = (data.logs || []).slice(-120);
  const balance = computeRoutineAllocationBalance(recentLogs, activeRoutines());
  const key = String(routine.category || "uncategorized").toLowerCase();
  const row = balance.find(x => x.category === key);
  return row ? row.delta : null;
}

function recentSessionFatigueForRoutine(routineId) {
  const logs = (data.logs || [])
    .filter(l => l.routineId === routineId && l.sessionRating)
    .sort((a,b)=>new Date(b.createdAt||0)-new Date(a.createdAt||0))
    .slice(0,5);
  if (!logs.length) return null;
  const avgRating = logs.reduce((a,b)=>a + Number(b.sessionRating || 0),0) / logs.length;
  return Math.max(-1, Math.min(1, (3 - avgRating) / 2));
}

function predictorModelForRoutine(routine) {
  if (!routine) return null;
  const stats = routineStats(routine.id);
  const logs = stats.logs || [];
  const bayes = stats.bayesian || null;
  const uncertainty = bayes?.posterior ? (bayes.posterior.upper - bayes.posterior.lower) : 0;
  const plateau = detectPlateauState(logs, {uncertainty});
  const last = logs.length ? logs[logs.length-1] : null;
  const days = last ? daysSince(last.createdAt) : recommendationRecencyCap(routine);
  return computePredictorContributions({
    hitRate:stats.hit,
    bayesianSignal:bayes?.signal || null,
    plateauState:plateau.state,
    allocationDelta:allocationDeltaForRoutine(routine),
    daysSinceLast:days,
    sessionFatigue:recentSessionFatigueForRoutine(routine.id)
  });
}

function renderPredictorContributionModel() {
  const box = $("bayesianValidationOutput");
  if (!box) return;

  const selected = $("statsRoutineSelect")?.value || "all";
  const routines = activeRoutines()
    .filter(r => isSystemAll(selected) || String(r.id) === String(selected))
    .map(r => ({routine:r, model:predictorModelForRoutine(r)}))
    .filter(x => x.model)
    .sort((a,b)=>b.model.total-a.model.total)
    .slice(0,5);

  if (!routines.length) return;

  const cards = routines.map(({routine, model}) => {
    const label = predictorRecommendationLabel(model.total);
    const rows = model.contributions.slice(0,6).map(c => `
      <div class="predictor-row predictor-${safeClassToken(c.direction, ["priority-up","priority-down","neutral","needs-data"], "neutral")}">
        <div>
          <strong>${htmlText(c.label)}</strong>
          <small>${htmlText(c.detail)}</small>
        </div>
        <span>${Number(c.value || 0).toFixed(1)}</span>
      </div>
    `).join("");

    return `<div class="predictor-card">
      <div class="predictor-head">
        <strong>${htmlText(routine.name)}</strong>
        <span>${htmlText(label.label)}</span>
      </div>
      <p class="muted">${htmlText(label.detail)} Total contribution score: ${Number(model.total || 0).toFixed(1)}.</p>
      <div class="predictor-list">${rows}</div>
    </div>`;
  }).join("");

  box.innerHTML += `<div class="predictor-section">
    <h3>Predictor contribution model</h3>
    <p class="muted">Transparent transparent routine-priority scoring proxy. It explains which signals are pushing a routine up or down without using a black-box model.</p>
    ${cards}
  </div>`;
}


function tournamentPrepPlannerHtml(logs = []) {
  const plan = computeTournamentPrepPlan(logs);
  const metric = (label, value, detail = "") => `<div><span>${htmlText(label)}</span><strong>${htmlText(value)}</strong>${detail ? `<small>${htmlText(detail)}</small>` : ""}</div>`;
  const pct = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? "N/A" : `${Number(value).toFixed(1)}%`;
  return `
    <div class="tournament-prep-card">
      <h3>Tournament preparation planner ${statHelpButton("tournamentPrep")}</h3>

      <div class="tournament-controls">
        <label>
          <span>Days remaining</span>
          <input id="tournamentPrepDays" type="number" min="1" max="90" value="${plan.daysRemaining}">
        </label>

        <label>
          <span>Format</span>
          <select id="tournamentPrepFormat">
            <option value="best_of_5" ${plan.format==="best_of_5" ? "selected" : ""}>Best of 5</option>
            <option value="best_of_7" ${plan.format==="best_of_7" ? "selected" : ""}>Best of 7</option>
            <option value="best_of_11" ${plan.format==="best_of_11" ? "selected" : ""}>Best of 11+</option>
          </select>
        </label>

        <label>
          <span>Primary focus</span>
          <select id="tournamentPrepFocus">
            <option value="balanced" ${plan.focus==="balanced" ? "selected" : ""}>Balanced</option>
            <option value="potting" ${plan.focus==="potting" ? "selected" : ""}>Potting</option>
            <option value="safety" ${plan.focus==="safety" ? "selected" : ""}>Safety</option>
            <option value="break_building" ${plan.focus==="break_building" ? "selected" : ""}>Break building</option>
          </select>
        </label>

        <label>
          <span>Risk profile</span>
          <select id="tournamentPrepRisk">
            <option value="conservative" ${plan.risk==="conservative" ? "selected" : ""}>Conservative</option>
            <option value="balanced" ${plan.risk==="balanced" ? "selected" : ""}>Balanced</option>
            <option value="aggressive" ${plan.risk==="aggressive" ? "selected" : ""}>Aggressive</option>
          </select>
        </label>

        <label>
          <span>Practice minutes</span>
          <input id="tournamentPrepMinutes" type="number" min="15" max="480" step="15" value="${plan.minutes}">
        </label>
      </div>

      <div class="tournament-readiness-card">
        <div>
          <span>Readiness</span>
          <strong>${Math.round(plan.readiness)} / 100</strong>
          <small>${htmlText(plan.readinessLabel)}</small>
        </div>
        <p>${htmlText(plan.readinessDetail)}</p>
      </div>

      <div class="tournament-plan-summary">
        ${metric("Format", plan.formatProfile?.label || plan.format)}
        ${metric("Intensity", plan.intensity)}
        ${metric("Daily duration", `${plan.minutes} min`)}
        ${metric("Logs in scope", String(plan.evidenceLogs), `${plan.recentLogs} recent`)}
        ${metric("Recent average", pct(plan.recentAvg))}
        ${metric("Target hit rate", pct(plan.hitRate))}
        ${metric("Stability", pct(plan.stability))}
        ${metric("Pressure exposure", pct(plan.pressureShare))}
        ${metric("Last trained", plan.daysSinceLastLog === null ? "N/A" : `${plan.daysSinceLastLog}d ago`)}
      </div>

      <div class="tournament-plan-blocks">
        <strong>Recommended session blocks</strong>
        <ul>
          ${plan.blocks.map(x => `<li>${htmlText(x)}</li>`).join("")}
        </ul>
      </div>

      <div class="tournament-plan-taper">
        <strong>Taper guidance</strong>
        <p>${htmlText(plan.taper)}</p>
      </div>
    </div>
  `;
}

function renderTournamentPrepPlanner() {
  const host = $("bayesianValidationOutput");
  if (!host) return;
  host.innerHTML += tournamentPrepPlannerHtml(getTournamentPlannerLogs ? getTournamentPlannerLogs() : (data.logs || []));
}

function renderAllocationOptimization() {
  const box = $("bayesianValidationOutput");
  if (!box) return;

  const recentLogs = (data.logs || []).slice(-120);
  const balance = computeRoutineAllocationBalance(recentLogs, activeRoutines());

  if (!balance.length) return;

  const focus = recommendedAllocationFocus(balance);

  const rows = balance.map(item => `
    <div class="allocation-row ${item.undertrained ? "undertrained" : ""}">
      <div>
        <strong>${htmlText(item.category)}</strong>
      </div>
      <div>${Math.round(item.actual * 100)}%</div>
      <div>${Math.round(item.target * 100)}%</div>
    </div>
  `).join("");

  box.innerHTML += `
    <div class="allocation-card">
      <h3>Routine allocation optimization</h3>
      <p class="muted">Balances training volume across categories to prevent recommendation drift toward a narrow drill set.</p>

      <div class="allocation-grid">
        <div class="allocation-head">
          <span>Category</span>
          <span>Actual</span>
          <span>Target</span>
        </div>
        ${rows}
      </div>

      <div class="allocation-focus">
        <strong>${htmlText(focus.label)}</strong>
        <p>${htmlText(focus.detail)}</p>
      </div>
    </div>
  `;
}


function renderPlateauDiagnostics() {
  const box = $("bayesianValidationOutput");
  if (!box) return;

  const selected = $("statsRoutineSelect")?.value || "all";
  const routines = activeRoutines().filter(r => isSystemAll(selected) || String(r.id) === String(selected));

  const html = routines.slice(0, 6).map(r => {
    const logs = (data.logs || []).filter(l => l.routineId === r.id);
    if (logs.length < 4) return "";

    const bayes = typeof bayesianStatsForRoutine === "function"
      ? bayesianStatsForRoutine(r.id)
      : null;

    const uncertainty = bayes?.posterior
      ? (bayes.posterior.upper - bayes.posterior.lower)
      : 0;

    const plateau = detectPlateauState(logs, { uncertainty });
    const action = plateauActionRecommendation(plateau.state);

    return `<div class="plateau-card plateau-${safeClassToken(plateau.state, ["plateau","fatigue","uncertain","progressing","mixed","insufficient"], "mixed")}">
      <div class="plateau-head">
        <strong>${htmlText(r.name)}</strong>
        <span class="plateau-badge">${htmlText(plateau.label)}</span>
      </div>
      <p>${htmlText(plateau.detail)}</p>
      <div class="plateau-action">
        <strong>${htmlText(action.title)}</strong>
        <p>${htmlText(action.instruction)}</p>
      </div>
    </div>`;
  }).filter(Boolean).join("");

  if (!html) return;

  box.innerHTML += `<div class="plateau-section">
    <h3>Plateau diagnostics</h3>
    <p class="muted">Combines trend slope, volatility, and True Skill uncertainty to distinguish plateaus from fatigue or noisy samples.</p>
    ${html}
  </div>`;
}


function renderBayesianAnalyticsValidation() {
  const box = $("bayesianValidationOutput");
  const panel = $("statsBayesianPanel") || box?.closest?.(".card");
  if (!box) return;
  if (statsMode !== "bayesian") {
    box.innerHTML = "";
    if (panel) panel.classList.add("hidden");
    return;
  }
  if (panel) panel.classList.remove("hidden");
  const selected = $("statsRoutineSelect")?.value || "";
  const successRoutines = activeRoutines().filter(r => r.scoring === "success_rate");
  const chosen = selected && selected !== "all" ? successRoutines.filter(r => String(r.id) === String(selected)) : successRoutines.slice(0, 8);
  if (!chosen.length) {
    box.innerHTML = `<h3>True Skill analytics</h3><div class="analytics-note">True Skill currently works best with success-rate drills. Create or select a success-rate drill to see estimated skill range. Raw-score and progressive drills still count in the rest of the stats dashboard.</div>`;
  } else {
    box.innerHTML = `<h3>True Skill validation</h3>
      <p class="muted">Beta-binomial confidence estimates for success-rate drills with 30-day exponential time decay. Use this to avoid overreacting to small samples or obsolete history.</p>
      ${chosen.map(r => renderBayesianValidationForRoutine(r.id)).join("")}`;
  }
  renderPlateauDiagnostics();
  renderAllocationOptimization();
  renderPredictorContributionModel();
}


let pressureSession = null;
const PRESSURE_SESSION_DRAFT_KEY = "snookerPracticePWA.pressureDraft";
function persistPressureSession() {
  try {
    if (pressureSession) localStorage.setItem(PRESSURE_SESSION_DRAFT_KEY, JSON.stringify(pressureSession));
    else localStorage.removeItem(PRESSURE_SESSION_DRAFT_KEY);
  } catch(e) { logAppError(e, "persistPressureSession"); }
}
function hydratePressureSessionDraft() {
  if (pressureSession) return;
  try {
    const raw = localStorage.getItem(PRESSURE_SESSION_DRAFT_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.routineId) return;
    pressureSession = parsed;
    $("pressureSessionPanel")?.classList.remove("hidden");
    updatePressurePanel();
  } catch(e) {
    logAppError(e, "hydratePressureSessionDraft");
    try { localStorage.setItem(PRESSURE_SESSION_DRAFT_KEY + ".corrupted_backup", localStorage.getItem(PRESSURE_SESSION_DRAFT_KEY) || ""); } catch(_) {}
    try { localStorage.removeItem(PRESSURE_SESSION_DRAFT_KEY); } catch(_) {}
  }
}

function currentPressureRoutine() {
  const rid = $("pressureRoutineSelect")?.value || "";
  return routineById(rid);
}

function renderPressureRoutineOptions() {
  const select = $("pressureRoutineSelect");
  if (!select) return;
  const current = select.value;
  select.innerHTML = activeRoutines().map(r => `<option value="${attrText(r.id)}">${htmlText(r.name)}</option>`).join("") || `<option value="">No exercises yet</option>`;
  if (current && [...select.options].some(o => o.value === current)) select.value = current;
}

function startPressureSession() {
  const routine = currentPressureRoutine();
  if (!routine) return alert("Select an exercise for pressure mode.");

  const mode = $("pressureModeSelect")?.value || "streak";
  const n = Math.max(1, Number($("pressureTargetInput")?.value || (mode === "lives" ? 3 : 5)));

  pressureSession = createPressureSession({
    routineId:routine.id,
    mode,
    lives:mode === "lives" ? n : 3,
    targetStreak:mode === "streak" ? n : 5,
    suddenDeath:($("pressureSuddenDeathSelect")?.value || "off") === "on",
    finalReps:Number($("pressureFinalRepsInput")?.value || 3),
    escalationStep:Number($("pressureEscalationStepInput")?.value || 2)
  });

  $("pressureSessionPanel")?.classList.remove("hidden");
  $("pressureCompletionNote")?.classList.add("hidden");
  persistPressureSession();
  updatePressurePanel();
}

function updatePressurePanel() {
  if (!pressureSession) return;
  const routine = routineById(pressureSession.routineId);
  const summary = pressureSummary(pressureSession);

  if ($("pressureRoutineName")) $("pressureRoutineName").textContent = routine?.name || "Pressure drill";
  if ($("pressureModeLabel")) $("pressureModeLabel").textContent =
    pressureSession.mode === "streak" ? `Streak ladder · target ${pressureSession.targetStreak}${pressureSession.suddenDeath ? " · sudden death" : ""}` :
    pressureSession.mode === "lives" ? `Limited lives · start ${pressureSession.livesStart}${pressureSession.suddenDeath ? " · sudden death" : ""}` :
    `Recovery after miss${pressureSession.suddenDeath ? " · sudden death" : ""}`;

  const set = (id, value) => { const el = $(id); if (el) el.textContent = value; };
  set("pressureScoreValue", summary.pressureScore);
  set("pressureAttempts", pressureSession.attempts);
  set("pressureMakes", pressureSession.makes);
  set("pressureMisses", pressureSession.misses);
  set("pressureStreak", pressureSession.streak);
  set("pressureBestStreak", pressureSession.bestStreak);
  set("pressureLives", pressureSession.mode === "lives" ? pressureSession.livesRemaining : "—");
  set("pressureRecovery", pressureSession.mode === "recovery" ? `${pressureSession.recoverySuccesses}/${pressureSession.recoveryAttempts}` : "—");
  set("pressureLevel", summary.pressureLevel);
  set("pressureClutch", pressureSession.clutchAttempts ? `${Math.round(summary.clutchRate * 100)}%` : "—");
  set("pressureFatigue", `${summary.fatigueRisk}%`);

  const showRecovery = pressureSession.mode === "recovery" && pressureSession.recoveryMode;
  $("pressureRecoveryOkBtn")?.classList.toggle("hidden", !showRecovery);
  $("pressureRecoveryFailBtn")?.classList.toggle("hidden", !showRecovery);

  if (pressureSession.completed) {
    const note = $("pressureCompletionNote");
    if (note) {
      note.classList.remove("hidden");
      note.textContent = pressureSession.mode === "streak"
        ? "Target streak reached. Finish now or continue to push the best streak."
        : "Lives exhausted. Finish and save the pressure drill.";
    }
  }
}

function recordPressure(type) {
  if (!pressureSession) return;
  hapticFeedback(type === "miss" || type === "recovery_fail" ? "miss" : "tap");
  pressureSession = recordPressureEvent(pressureSession, type);
  persistPressureSession();
  updatePressurePanel();
}

function undoPressure() {
  if (!pressureSession) return;
  pressureSession = undoPressureEvent(pressureSession);
  persistPressureSession();
  updatePressurePanel();
  showTransientNotice("Last pressure input undone.", "ok");
}

async function finishPressureSession() {
  if (!pressureSession) return;
  const sessionToSave = pressureSession;
  pressureSession = null;
  persistPressureSession();
  const routine = routineById(sessionToSave.routineId);
  if (!routine) { pressureSession = sessionToSave; persistPressureSession(); return alert("Pressure routine no longer exists."); }

  const summary = pressureSummary(sessionToSave);
  const attempts = Math.max(0, Number(sessionToSave.attempts || 0));
  if (!attempts) { pressureSession = sessionToSave; persistPressureSession(); return alert("No pressure attempts recorded."); }

  const now = new Date().toISOString();
  const pressureSessionId = `pressure-${Date.now()}`;
  const log = {
    id:uuid(),
    sessionId:pressureSessionId,
    sessionName:"Pressure simulation",
    sessionType:"pressure",
    planId:"",
    sessionPlanId:"",
    planNameSnapshot:"",
    routineId:routine.id,
    routineName:routine.name,
    routineNameSnapshot:routine.name,
    folder:routine.folder || "Unfiled",
    subfolder:routine.subfolder || "General",
    category:routine.category || "uncategorized",
    ...skillSnapshotForRoutine(routine),
    scoring:"success_rate",
    score:sessionToSave.makes,
    attempts,
    timeMinutes:Number(routine.duration || 0) || 0,
    normalizedScore:attempts ? sessionToSave.makes / attempts * 100 : 0,
    pressureAdjustedScore:attempts ? Math.min(100, (sessionToSave.makes / attempts * 100) * 1.2) : 0,
    bestAttempt:"",
    completionCount:"",
    highestBreak:"",
    totalUnits:"",
    unitType:"",
    targetMode:routine.targetMode || "",
    targetProfileId:"",
    targetAtLog:routine.target || "",
    stretchTargetAtLog:routine.stretchTarget || "",
    totalUnitsAtLog:"",
    attemptsPerSessionAtLog:attempts,
    difficultyLabelAtLog:routine.difficultyLabel || "",
    targetColour:routine.targetColour || "",
    performance:"N/A",
    tableId:"",
    venueTable:"",
    venueTableSnapshot:"",
    tableNote:"",
    sessionIntervention:"pressure",
    sessionInterventionNote:"",
    sessionRating:"",
    sessionTags:"pressure",
    notes:`Pressure ${sessionToSave.mode}: best streak ${sessionToSave.bestStreak}, score ${summary.pressureScore}`,
    pressureEnabled:true,
    pressureMode:sessionToSave.mode,
    pressureLevel:summary.pressureLevel,
    pressureScore:summary.pressureScore,
    pressureSuccessRate:summary.successRate,
    pressureWeightedSuccessRate:summary.weightedSuccessRate,
    pressureRecoveryRate:summary.recoveryRate,
    pressureClutchRate:summary.clutchRate,
    pressureCollapseRate:summary.collapseRate,
    pressureFatigueRisk:summary.fatigueRisk,
    pressureSuddenDeath:sessionToSave.suddenDeath,
    pressureFinalReps:sessionToSave.finalReps,
    pressureEscalationStep:sessionToSave.escalationStep,
    streakDepth:sessionToSave.bestStreak,
    bestStreak:sessionToSave.bestStreak,
    finalStreak:sessionToSave.streak,
    resets:sessionToSave.resets,
    livesStart:sessionToSave.livesStart,
    livesRemaining:sessionToSave.livesRemaining,
    recoveryAttempts:sessionToSave.recoveryAttempts,
    recoverySuccesses:sessionToSave.recoverySuccesses,
    clutchAttempts:sessionToSave.clutchAttempts,
    clutchMakes:sessionToSave.clutchMakes,
    escalationLevel:sessionToSave.escalationLevel,
    collapseEvents:sessionToSave.collapseEvents,
    pressureEvents:sessionToSave.eventHistory.length,
    createdAt:now
  };

  log.performance = classifyPerformance(log, routine);
  const syntheticSession = {
    id: pressureSessionId,
    name: "Pressure simulation",
    type: "pressure",
    planId: "",
    planName: "Pressure simulation",
    sessionName: "Pressure simulation",
    routineIds: [routine.id],
    plannedRoutineIds: [],
    logIds: [log.id],
    startedAt: sessionToSave.startedAt || now,
    endedAt: now,
    tableId: log.tableId || "",
    venueTable: log.venueTable || "",
    venueTableSnapshot: log.venueTableSnapshot || log.venueTable || "",
    tableNote: log.tableNote || "",
    pressureMode: sessionToSave.mode,
    createdAt: now,
    updatedAt: now
  };
  updateRecommendationCompletionFromLog(log);
  data.logs.push(log);
  data.sessions.push(syntheticSession);
  await persistLogSessionBundle([log], [syntheticSession], "finishPressureSession atomic pressure bundle");
  saveData({render:"sessionLog", idbSync:"skip"});

  persistPressureSession();
  $("pressureSessionPanel")?.classList.add("hidden");
  renderPressureRoutineOptions();
  renderSmartRecommendation();
  if (isPanelActive("stats")) {
    renderStats();
    renderBayesianAnalyticsValidation?.();
  }
}

function cancelPressureSession() {
  if (!pressureSession) return;
  if (!confirm("Cancel this pressure drill without saving?")) return;
  pressureSession = null;
  persistPressureSession();
  $("pressureSessionPanel")?.classList.add("hidden");
}

let pressureOverlayBound = false;
function bindPressureOverlay() {
  renderPressureRoutineOptions();
  hydratePressureSessionDraft();
  if (pressureOverlayBound) return;
  pressureOverlayBound = true;
  $("startPressureSessionBtn")?.addEventListener("click", startPressureSession);
  $("pressureMadeBtn")?.addEventListener("click", () => recordPressure("make"));
  $("pressureMissBtn")?.addEventListener("click", () => recordPressure("miss"));
  $("pressureRecoveryOkBtn")?.addEventListener("click", () => recordPressure("recovery_ok"));
  $("pressureRecoveryFailBtn")?.addEventListener("click", () => recordPressure("recovery_fail"));
  $("pressureUndoBtn")?.addEventListener("click", undoPressure);
  $("pressureFinishBtn")?.addEventListener("click", finishPressureSession);
  $("pressureCancelBtn")?.addEventListener("click", cancelPressureSession);
  $("pressureModeSelect")?.addEventListener("change", () => {
    const mode = $("pressureModeSelect")?.value || "streak";
    const input = $("pressureTargetInput");
    if (input) input.value = mode === "lives" ? 3 : 5;
    const finalReps = $("pressureFinalRepsInput");
    if (finalReps) finalReps.value = mode === "recovery" ? 2 : 3;
    const step = $("pressureEscalationStepInput");
    if (step) step.value = mode === "lives" ? 1 : 2;
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindPressureOverlay);
else bindPressureOverlay();


/* v4.11 mobile practice-flow helpers */
function ensureRoutinePickerSheet() {
  if ($("routinePickerSheet")) return;
  const sheet = document.createElement("div");
  sheet.id = "routinePickerSheet";
  sheet.className = "routine-picker-backdrop hidden";
  sheet.innerHTML = `
    <div class="routine-picker-sheet" role="dialog" aria-modal="true" aria-label="Choose exercise">
      <div class="routine-picker-handle"></div>
      <div class="routine-picker-header">
        <div>
          <strong id="routinePickerTitle">Choose exercise</strong>
          <p class="muted">Search and tap to select. Existing dropdown remains as fallback.</p>
        </div>
        <button type="button" id="routinePickerCloseBtn" class="secondary">Close</button>
      </div>
      <input id="routinePickerSearch" class="routine-picker-search" placeholder="Search exercise..." autocomplete="off" />
      <div id="routinePickerList" class="routine-picker-list"></div>
    </div>`;
  document.body.appendChild(sheet);
  $("routinePickerCloseBtn")?.addEventListener("click", closeRoutinePickerSheet);
  sheet.addEventListener("click", e => { if (e.target === sheet) closeRoutinePickerSheet(); });
  $("routinePickerSearch")?.addEventListener("input", renderRoutinePickerList);
}

let routinePickerTargetSelectId = "";
function openRoutinePickerSheet(selectId, title="Choose exercise") {
  const select = $(selectId);
  if (!select) return;
  routinePickerTargetSelectId = selectId;
  ensureRoutinePickerSheet();
  const titleEl = $("routinePickerTitle");
  if (titleEl) titleEl.textContent = title;
  const search = $("routinePickerSearch");
  if (search) search.value = "";
  renderRoutinePickerList();
  $("routinePickerSheet")?.classList.remove("hidden");
  document.body.classList.add("routine-picker-open");
  setTimeout(() => $("routinePickerSearch")?.focus(), 50);
}
function closeRoutinePickerSheet() {
  $("routinePickerSheet")?.classList.add("hidden");
  document.body.classList.remove("routine-picker-open");
}
function routinePickerSourceOptions() {
  const select = $(routinePickerTargetSelectId);
  if (!select) return [];
  return [...select.options].filter(o => o.value).map(o => ({id:o.value, label:o.textContent || o.value}));
}
function routinePickerOrderedOptions() {
  const options = routinePickerSourceOptions();
  const byId = new Map(options.map(o => [o.id, o]));
  const favs = [...favoriteRoutineIds()].map(id => byId.get(id)).filter(Boolean);
  const recents = recentRoutineIds(8).map(id => byId.get(id)).filter(Boolean).filter(o => !favs.some(f => f.id === o.id));
  const rest = options.filter(o => !favs.some(f => f.id === o.id) && !recents.some(r => r.id === o.id));
  return [
    ...favs.map(o => ({...o, group:"Favorites"})),
    ...recents.map(o => ({...o, group:"Recent"})),
    ...rest.map(o => ({...o, group:"All exercises"}))
  ];
}
function renderRoutinePickerList() {
  const list = $("routinePickerList");
  if (!list) return;
  const q = ($("routinePickerSearch")?.value || "").trim().toLowerCase();
  const options = routinePickerOrderedOptions().filter(o => !q || o.label.toLowerCase().includes(q));
  if (!options.length) {
    list.innerHTML = `<div class="routine-picker-empty">No matching exercise.</div>`;
    return;
  }
  let lastGroup = "";
  list.innerHTML = options.map(o => {
    const r = routineById(o.id);
    const isAllStatsOption = routinePickerTargetSelectId === "statsRoutineSelect" && o.id === "all";
    const meta = isAllStatsOption ? "No exercise filter" : (r ? `${htmlText(r.folder || "Unfiled")} · ${htmlText(r.subfolder || "General")} · ${htmlText(r.scoring || "")}` : "");
    const lastSetup = (!isAllStatsOption && r) ? lastRoutineSetupSummary(o.id) : "";
    const group = isAllStatsOption ? "Stats scope" : (o.group || "All exercises");
    const header = group !== lastGroup ? `<div class="routine-picker-group">${htmlText(group)}</div>` : "";
    lastGroup = group;
    const starBtn = isAllStatsOption ? "" : `<button type="button" class="routine-picker-star" data-routine-picker-star-id="${attrText(o.id)}" aria-label="${isFavoriteRoutine(o.id) ? "Remove favorite" : "Add favorite"}">${isFavoriteRoutine(o.id) ? "★" : "☆"}</button>`;
    return `${header}<div class="routine-picker-row-wrap">
      <button type="button" class="routine-picker-row" data-routine-picker-id="${attrText(o.id)}">
        <span><strong>${isFavoriteRoutine(o.id) ? "★ " : ""}${htmlText(o.label)}</strong>${meta ? `<small>${meta}</small>` : ""}${lastSetup ? `<small class="routine-picker-last">${htmlText(lastSetup)}</small>` : ""}</span>
        <span class="routine-picker-chevron">›</span>
      </button>
      ${starBtn}
    </div>`;
  }).join("");
  list.querySelectorAll("[data-routine-picker-id]").forEach(btn => {
    btn.addEventListener("click", () => {
      const select = $(routinePickerTargetSelectId);
      if (!select) return;
      const pickedId = btn.getAttribute("data-routine-picker-id") || "";
      if (routinePickerTargetSelectId === "statsRoutineSelect") {
        setStatsRoutineFilter(pickedId);
      } else {
        select.value = pickedId;
        select.dispatchEvent(new Event("change", {bubbles:true}));
      }
      closeRoutinePickerSheet();
    });
  });
  list.querySelectorAll("[data-routine-picker-star-id]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute("data-routine-picker-star-id") || "";
      if (!id) return;
      toggleFavoriteRoutine(id);
      renderRoutinePickerList();
      showTransientNotice(isFavoriteRoutine(id) ? "Exercise added to favorites." : "Exercise removed from favorites.", "ok");
    });
  });
}
function ensureRoutinePickerButtons() {
  [
    ["freeRoutineSelect", "Open Exercise Picker", "Choose free training routine"],
    ["nextFreeRoutineSelect", "Open Exercise Picker", "Choose next routine"],
    ["routineToAdd", "Open Exercise Picker", "Choose routine for plan"],
    ["statsRoutineSelect", "Open Exercise Picker", "Choose stats routine"]
  ].forEach(([selectId, label, title]) => {
    const select = $(selectId);
    if (!select || select.dataset.pickerButtonReady === "1") return;
    select.dataset.pickerButtonReady = "1";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "secondary routine-picker-trigger";
    btn.textContent = label;
    btn.addEventListener("click", () => openRoutinePickerSheet(selectId, title));
    select.insertAdjacentElement("afterend", btn);
  });
}
function bindMobilePracticeUX() {
  ensureRoutinePickerSheet();
  ensureRoutinePickerButtons();
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("routinePickerSheet")?.classList.contains("hidden")) closeRoutinePickerSheet();
  });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindMobilePracticeUX);
else bindMobilePracticeUX();

window.addEventListener("storage", e => {
  if (e.key === ACTIVE_SESSION_KEY && !e.newValue && activeSession) {
    activeSession = null;
    stopTimer();
    $("activeSession")?.classList.add("hidden");
    updateSessionFocusState();
    renderAll();
    return;
  }
  if (e.key === STORAGE_KEY) {
    if (activeSession) {
      pendingExternalStorageSyncAfterSession = true;
      console.info("External storage sync deferred while an active session is in progress.");
      return;
    }
    try {
      externalStorageSyncInProgress = true;
      data = loadData();
      hydrateIndexedDBData(false, {readOnlySync:true})
        .then(() => { ensureTablesDatabase?.(); warmRoutineStatsCache("storage sync warm routine stats"); renderAll(); })
        .catch(err => logAppError(err, "storage sync hydrate"))
        .finally(() => { externalStorageSyncInProgress = false; });
    } catch(err) {
      externalStorageSyncInProgress = false;
      logAppError(err, "storage sync");
    }
  }
});

function runDeferredExternalStorageSyncIfSafe() {
  if (!pendingExternalStorageSyncAfterSession || activeSession) return;
  pendingExternalStorageSyncAfterSession = false;
  try {
    externalStorageSyncInProgress = true;
    data = loadData();
    hydrateIndexedDBData(false, {readOnlySync:true})
      .then(() => { ensureTablesDatabase?.(); warmRoutineStatsCache("storage sync warm routine stats"); renderAll(); })
      .catch(err => logAppError(err, "deferred storage sync hydrate"))
      .finally(() => { externalStorageSyncInProgress = false; });
  } catch(err) {
    externalStorageSyncInProgress = false;
    logAppError(err, "deferred storage sync");
  }
}

window.addEventListener("beforeunload", () => {
  try {
    if (activeSession) persistActiveSession();
    persistPressureSession();
    if (timerInterval) clearInterval(timerInterval);
    flushPendingIndexedDBSync("beforeunload flush");
  } catch(e) {}
});
window.addEventListener("visibilitychange", () => {
  try {
    if (document.visibilityState === "hidden") {
      if (activeSession) persistActiveSession();
      persistPressureSession();
      flushPendingIndexedDBSync("visibilitychange hidden flush");
    }
  } catch(e) {}
});

try { window.addEventListener("beforeunload", syncTimerStateToActiveSession); } catch(e) {}


/* v4.0 module compatibility bridge
   The application now runs as an ES module. Existing generated markup still uses
   inline event handlers, so explicitly expose the legacy UI API on window. */
function exposeV4LegacyGlobals() {
  // v4.2: narrow compatibility bridge only. State variables stay module-scoped.
  Object.assign(window, {
    showFieldHelp,
    hideFieldHelp,
    closeFieldHelp,
    skipReflection,
    saveReflection,
    closeReflectionModal,
    openLogEditModal,
    closeLogEditModal,
    saveEditedLogFromModal
  });
}
exposeV4LegacyGlobals();



function handleTournamentPrepInputChange(event) {
  const id = event.target?.id || "";
  if (
    id === "tournamentPrepDays" ||
    id === "tournamentPrepFormat" ||
    id === "tournamentPrepFocus" ||
    id === "tournamentPrepRisk" ||
    id === "tournamentPrepMinutes"
  ) {
    if (statsMode === "tournament") debouncedRenderStats();
    else renderBayesianAnalyticsValidation?.();
  }
}
document.addEventListener("input", handleTournamentPrepInputChange);
document.addEventListener("change", handleTournamentPrepInputChange);


document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncFocusWakeLock(); else releaseFocusWakeLock(); });


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






/* ===== v4.30.0 Transfer Model v1 ===== */
function derivePerformanceSignal(log, routine){
  const attempts = Number(log?.effectiveAttempts || log?.attempts || log?.totalAttempts || 0);
  const score = Number(log?.score || 0);
  const normalizedScore = Number.isFinite(Number(log?.normalizedScore))
    ? Number(log.normalizedScore)
    : (attempts > 0 ? Math.max(0, Math.min(100, (score / attempts) * 100)) : Math.max(0, score));

  const left = Number(log?.leftSideScore || 0);
  const right = Number(log?.rightSideScore || 0);
  const hasSide = Boolean(log?.sideSplitEnabled || log?.sideMode === "left_right" || log?.sideSplit === "left_right");

  const flags = [];
  if(score < 0 || attempts < 0 || left < 0 || right < 0) flags.push("negative_values");
  if(log?.scoring === "success_rate" && attempts > 0 && score > attempts) flags.push("score_exceeds_attempts");
  if(hasSide && attempts > 0 && left + right > attempts) flags.push("left_right_exceeds_attempts");
  if(log?.scoring === "progressive_completion" && Number(log?.totalUnits || log?.totalUnitsAtLog || 0) <= 0) flags.push("missing_total_units");
  if(Number(log?.timeMinutes || 0) === 0) flags.push("zero_minutes");

  return {
    normalizedScore,
    targetHit: Number.isFinite(Number(log?.targetAtLog)) ? normalizedScore >= Number(log.targetAtLog) : false,
    effectiveAttempts: attempts,
    confidenceWeight: attempts > 0 ? Math.min(1, attempts / 20) : 0.35,
    scoringFamily: log?.scoring || routine?.scoring || "unknown",
    difficultyAdjustedScore: normalizedScore,
    leftRightBalance: hasSide ? {left, right, gap: Math.abs(left-right)} : null,
    dataQualityFlags: flags
  };
}

function evaluateRoutinePriority(routine, logs, context={}){
  const routineLogs = (logs || []).filter(l => l && l.routineId === routine?.id);
  const recent = routineLogs.slice(-8);
  const avg = recent.length
    ? recent.reduce((a,l)=>a + Number(derivePerformanceSignal(l, routine).normalizedScore || 0), 0) / recent.length
    : 50;

  const weaknessScore = Math.max(0, 100 - avg);
  const lastDate = routineLogs.length ? new Date(routineLogs[routineLogs.length-1].createdAt || 0).getTime() : 0;
  const daysSinceLast = lastDate ? Math.max(0, (Date.now() - lastDate) / 86400000) : 30;
  const undertrainingScore = Math.min(100, daysSinceLast * 4);
  const uncertaintyScore = Math.max(0, 100 - recent.length * 12);
  const fatiguePenalty = Number(context.fatigueRisk || 0) * 10;
  const pressureNeed = Number(context.pressureNeed || 0) * 10;
  const totalScore = weaknessScore * 0.45 + undertrainingScore * 0.25 + uncertaintyScore * 0.20 + pressureNeed * 0.10 - fatiguePenalty * 0.05;

  const reasons = [];
  if(weaknessScore > 45) reasons.push("Weakness detected");
  if(undertrainingScore > 40) reasons.push("Undertrained recently");
  if(uncertaintyScore > 50) reasons.push("Low sample confidence");
  if(pressureNeed > 0) reasons.push("Pressure adaptation needed");
  if(!reasons.length) reasons.push("Balanced maintenance");

  return {totalScore, weaknessScore, undertrainingScore, uncertaintyScore, fatiguePenalty, pressureNeed, reasons};
}

function runDataQualityAudit(){
  const results = [];
  const MAX_STORED_AUDIT_ISSUES = 500;
  const addIssue = issue => { if (results.length < MAX_STORED_AUDIT_ISSUES) results.push(issue); };
  try{
    const logs = Array.isArray(data?.logs) ? data.logs : [];
    const routines = Array.isArray(data?.routines) ? data.routines : [];
    const plans = Array.isArray(data?.plans) ? data.plans : [];
    const routineIds = new Set(routines.map(r=>r.id));
    const activeRoutineIds = new Set(routines.filter(r=>!r.isDeleted).map(r=>r.id));
    let missingTableCount = 0;

    logs.forEach((log, idx)=>{
      const row = idx + 1;
      if(log.routineId && !routineIds.has(log.routineId)){
        addIssue({severity:"high", type:"orphan_log", message:`Log ${row} references a routine ID that no longer exists.`});
      }
      if(log.routineId && routineIds.has(log.routineId) && !activeRoutineIds.has(log.routineId)){
        addIssue({severity:"medium", type:"deleted_routine_log", message:`Log ${row} references a soft-deleted routine. This is usually acceptable historical data.`});
      }
      const signal = derivePerformanceSignal(log, routines.find(r=>r.id===log.routineId));
      signal.dataQualityFlags.forEach(flag=>{
        addIssue({severity: flag.includes("exceeds") || flag === "negative_values" ? "high" : "medium", type:flag, message:`Log ${row}: ${flag.replaceAll("_"," ")}.`});
      });
      if(!log.tableId && !log.venueTable){
        missingTableCount += 1;
      }
    });
    if (missingTableCount) {
      addIssue({severity:"low", type:"missing_table", message:`${missingTableCount} log(s) have no table/venue context. This is optional, but limits table-specific analytics.`});
    }

    plans.forEach((plan)=>{
      (plan.routineIds || []).forEach(rid=>{
        if(!routineIds.has(rid)){
          addIssue({severity:"high", type:"orphan_plan_reference", message:`Plan "${plan.name || "Unnamed"}" references a missing routine.`});
        }
      });
    });

    const nameMap = new Map();
    routines.filter(r=>!r.isDeleted).forEach(r=>{
      const key = String(r.name || "").trim().toLowerCase();
      if(!key) return;
      nameMap.set(key, (nameMap.get(key)||0)+1);
    });
    nameMap.forEach((count,name)=>{
      if(count > 1) addIssue({severity:"low", type:"duplicate_routine_name", message:`Duplicate active routine name: "${name}".`});
    });
    if (results.length >= MAX_STORED_AUDIT_ISSUES) {
      results.push({severity:"medium", type:"audit_truncated", message:`Audit stopped storing individual rows after ${MAX_STORED_AUDIT_ISSUES} issues to protect browser memory.`});
    }

  }catch(err){
    addIssue({severity:"high", type:"audit_error", message:`Audit failed: ${err.message || err}`});
  }
  return results;
}

function renderDataQualityAudit(){
  const host = document.getElementById("dataQualityAuditBox");
  if(!host) return;
  const issues = runDataQualityAudit();
  const counts = issues.reduce((a,i)=>{ a[i.severity]=(a[i.severity]||0)+1; return a; }, Object.create(null));
  if(!issues.length){
    host.innerHTML = '<div class="analytics-note">No integrity issues detected.</div>';
    return;
  }
  const displayLimit = 50;
  const visible = issues.slice(0, displayLimit);
  const hiddenCount = Math.max(0, issues.length - visible.length);
  host.innerHTML =
    `<div class="analytics-note"><strong>${issues.length} issue(s) found</strong> · High: ${counts.high||0} · Medium: ${counts.medium||0} · Low: ${counts.low||0}</div>` +
    visible.map(i=>`
      <div class="dq-item dq-${escapeHtml(i.severity)}">
        <strong>${escapeHtml(String(i.type || "issue").replaceAll("_"," "))}</strong><br/>
        <span class="small">${escapeHtml(i.message || "")}</span>
      </div>
    `).join('') +
    (hiddenCount ? `<div class="analytics-note muted">${hiddenCount} additional issue(s) are not rendered to keep the audit responsive.</div>` : '');
}
/* ===== end v4.30.0 Transfer Model v1 ===== */


document.addEventListener("click", function(e){
  const btn = e.target && e.target.closest ? e.target.closest("#runDataQualityAuditBtn") : null;
  if(btn){
    e.preventDefault();
    renderDataQualityAudit();
  }
});
