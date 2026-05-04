const STORAGE_KEY = "snookerPracticePWA.v3";
const OLD_KEYS = ["snookerPracticePWA.v1", "snookerPracticePWA.v2"];
const APP_VERSION = "3.26.0-final";

function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,10);
}
function structuredCloneSafe(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}


const ACTIVE_SESSION_KEY = "snookerPracticePWA.activeSessionDraft";
const LAST_VENUE_KEY = "snookerPracticePWA.lastVenueTable";
const LAST_TABLE_NOTE_KEY = "snookerPracticePWA.lastTableNote";
const THEME_MODE_KEY = "snookerPracticePWA.themeMode";
const SESSION_FOCUS_MODE_KEY = "snookerPracticePWA.sessionFocusMode";
const QUICK_LOG_AUTO_ADVANCE_KEY = "snookerPracticePWA.quickLogAutoAdvance";


function normalizeInterfaceThemeMode(value) {
  return ["system", "light", "dark", "contrast"].includes(value) ? value : "system";
}
function getRawStoredThemeMode() {
  try {
    const direct = localStorage.getItem(THEME_MODE_KEY);
    if (direct) return normalizeInterfaceThemeMode(direct);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return normalizeInterfaceThemeMode(parsed?.interfaceSettings?.themeMode || "system");
    }
  } catch(e) {}
  return "system";
}
function resolveThemeModeEarly(mode) {
  const clean = normalizeInterfaceThemeMode(mode);
  if (clean !== "system") return clean;
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch(e) {
    return "light";
  }
}
function applyThemeModeEarly() {
  const mode = getRawStoredThemeMode();
  const actual = resolveThemeModeEarly(mode);
  const root = document.documentElement;
  root.classList.remove("theme-system", "theme-light", "theme-dark", "theme-contrast");
  root.classList.add("theme-" + mode);
  root.setAttribute("data-theme-mode", mode);
  root.setAttribute("data-theme", actual);
}
applyThemeModeEarly();

const defaultData = {
  appVersion: APP_VERSION,
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
  tagHistory: []
};

let data = loadData();
ensureTablesDatabase();
refreshReferenceNames();
safeStorageSet(STORAGE_KEY, JSON.stringify(data), "startup save");
let planDraft = [];
let activeSession = null;
let timerInterval = null;
let timerStartMs = null;
let elapsedBeforeStartMs = 0;
let suppressTimerPersistence = false;
let deferredInstallPrompt = null;
let statsMode = localStorage.getItem("snookerPracticePWA.statsMode") || "overview";

function $(id) { return document.getElementById(id); }
function cssEscapeSafe(value) {
  if (window.CSS && typeof window.CSS.escape === "function") return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function migrateData(d) {
  d.appVersion = APP_VERSION;
  d.routines = (d.routines || []).map(r => ({
    ...r,
    folder: r.folder || r.category || "Unfiled",
    subfolder: r.subfolder || "General",
    category: r.category || "uncategorized",
    stretchTarget: r.stretchTarget || "",
    isDeleted: !!r.isDeleted,
    deletedAt: r.deletedAt || ""
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
    migrated.normalizedScore = Number(migrated.normalizedScore || normalizeScore(migrated));
    return migrated;
  });
  // Lightweight session layer: rebuild missing session records from logs
  const existingSessionIds = new Set((d.sessions || []).map(s => s.id));
  const grouped = {};
  d.logs.forEach(l => {
    if (!l.sessionId) return;
    grouped[l.sessionId] ||= [];
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
    safeStorageSet(STORAGE_KEY, JSON.stringify(parsed), "loadData migrated");
    return parsed;
  } catch(e) {
    logAppError(e, "loadData");
    alert("Startup/migration error detected. Your stored data was NOT overwritten. Export Debug Info and Raw Local Data from the Data tab before making changes.");
    const fallback = raw ? safeParseData(raw) : null;
    return fallback || structuredCloneSafe(defaultData);
  }
}

function saveData(options = {}) {
  data.updatedAt = new Date().toISOString();
  data.interfaceSettings = data.interfaceSettings || {};
  data.interfaceSettings.themeMode = getThemeModeSetting();
  data.interfaceSettings.sessionFocusMode = getSessionFocusSetting();
  data.interfaceSettings.quickLogAutoAdvance = getQuickLogAutoAdvanceSetting();
  ensureTablesDatabase?.();
  const ok = safeStorageSet(STORAGE_KEY, JSON.stringify(data), "saveData");
  if (ok) renderStorageWarning();
  const renderMode = typeof options === "string" ? options : (options && options.render) || "all";
  renderAfterSave(renderMode);
  return ok;
}

function isPanelActive(panelId) {
  return !!$(panelId)?.classList.contains("active");
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
function categories() { return [...new Set(activeRoutines().map(r => r.category || "uncategorized"))].sort(); }
function folders() { return [...new Set(activeRoutines().map(r => r.folder || "Unfiled"))].sort(); }
function subfolders() { return [...new Set(activeRoutines().map(r => r.subfolder || "General"))].sort(); }
function routineById(id) { return (data.routines || []).find(r => r.id === id); }

function normalizeScore(log) {
  if (log.scoring === "progressive_completion") return Number(log.totalUnitsAtLog || log.totalUnits || 0) > 0 ? (Number(log.score || 0) / Number(log.totalUnitsAtLog || log.totalUnits || 0)) * 100 : 0;
  if (log.scoring === "success_rate") return Number(log.attempts || 0) > 0 ? (Number(log.score || 0) / Number(log.attempts || 0)) * 100 : 0;
  if (log.scoring === "score_per_minute") return Number(log.timeMinutes || 0) > 0 ? Number(log.score || 0) / Number(log.timeMinutes || 0) : 0;
  return Number(log.score || 0);
}
function classifyPerformance(log, routine) {
  const p = getActiveTargetProfile(routine);
  return classifyPerformanceAgainstTarget(log.normalizedScore, log.targetAtLog || p?.target || routine?.target, log.stretchTargetAtLog || p?.stretchTarget || routine?.stretchTarget);
}

function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  return Math.sqrt(avg(arr.map(x => Math.pow(x-m,2))));
}
function correlation(xs, ys) {
  const pairs = xs.map((x,i)=>[Number(x), Number(ys[i])]).filter(([x,y])=>Number.isFinite(x)&&Number.isFinite(y));
  if (pairs.length < 3) return null;
  const xvals = pairs.map(p=>p[0]), yvals = pairs.map(p=>p[1]);
  const mx = avg(xvals), my = avg(yvals);
  const num = pairs.reduce((a,[x,y]) => a + (x-mx)*(y-my), 0);
  const denX = Math.sqrt(pairs.reduce((a,[x]) => a + Math.pow(x-mx,2), 0));
  const denY = Math.sqrt(pairs.reduce((a,[,y]) => a + Math.pow(y-my,2), 0));
  if (!denX || !denY) return null;
  return num / (denX * denY);
}
function corrText(r) {
  if (r === null) return "Not enough data";
  const abs = Math.abs(r);
  const strength = abs >= .65 ? "strong" : abs >= .35 ? "moderate" : "weak";
  const direction = r >= 0 ? "positive" : "negative";
  return `${strength} ${direction} (${r.toFixed(2)})`;
}
function localDateKey(dateLike = new Date()) {
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function sameDate(log, dateKey) { return localDateKey(log.createdAt) === dateKey; }
function visibleRoutines(typeFilter="all", folderFilter="all", search="") {
  const q = search.trim().toLowerCase();
  return activeRoutines()
    .filter(r => typeFilter === "all" || (r.category || "uncategorized") === typeFilter)
    .filter(r => folderFilter === "all" || (r.folder || "Unfiled") === folderFilter)
    .filter(r => !q || r.name.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q))
    .sort((a,b) => (a.folder||"").localeCompare(b.folder||"") || (a.subfolder||"").localeCompare(b.subfolder||"") || a.name.localeCompare(b.name));
}
function setSelectOptions(select, values, allLabel, selected="all") {
  if (!select) return;
  select.innerHTML = `<option value="all">${allLabel}</option>` + values.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join("");
  select.value = values.includes(selected) || selected === "all" ? selected : "all";
}
function editCategoryOptions(current) {
  const vals = [...new Set([current || "uncategorized", ...categories()])].filter(Boolean).sort();
  return vals.map(c => `<option value="${escapeAttr(c)}" ${c === (current || "uncategorized") ? "selected" : ""}>${escapeHtml(c)}</option>`).join("");
}

document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  $(btn.dataset.tab).classList.add("active");
  if (btn.dataset.tab === "today") renderToday();
  if (btn.dataset.tab === "stats") renderStats();
}));

function renderAll() {
  renderRoutineSelects();
  renderRoutineList();
  renderPlanBuilder();
  renderPlanList();
  renderStats();
  renderToday();
  renderSmartRecommendation();
  renderTagSuggestions();
  renderBackupReminder();
  renderExportFolderStatus();
  renderPeriodization();
  renderRegretRoutineOptions();
  renderTableDatabase();
  renderTableSelects();
  renderTrainingLoad();
  renderWeeklyReview();
  renderABComparison();
  renderResumeCard();
  renderTodayResumeCard();
  renderTableStats();
  renderPhaseOneInsights();
  renderInterfaceSettings();
  updateSessionFocusState();
}

function renderRoutineSelects() {
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
  $("routineToAdd").innerHTML = planPickerRoutines.map(r => `<option value="${r.id}">${escapeHtml(r.folder || "Unfiled")} / ${escapeHtml(r.subfolder || "General")} — ${escapeHtml(r.name)}</option>`).join("") || `<option value="">No matching exercises</option>`;

  const allRoutineOptions = visibleRoutines().map(r => `<option value="${r.id}">${escapeHtml(r.name)} — ${fmtScoring(r.scoring)}</option>`).join("");
  $("freeRoutineSelect").innerHTML = allRoutineOptions || `<option value="">No exercises yet</option>`;
  $("nextFreeRoutineSelect").innerHTML = allRoutineOptions || `<option value="">No exercises yet</option>`;
  $("planSelect").innerHTML = data.plans.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("") || `<option value="">No plans yet</option>`;
  $("statsRoutineSelect").innerHTML = (data.routines || []).map(r => `<option value="${r.id}">${escapeHtml(r.name)}${r.isDeleted ? " (archived)" : ""}</option>`).join("") || `<option value="">No exercises yet</option>`;

  if (!$("statsDateSelect").value) $("statsDateSelect").value = localDateKey();
}
["exerciseTypeFilter","exerciseFolderFilter","exerciseSearch","planTypeFilter","planFolderFilter"].forEach(id => {
  $(id).addEventListener("input", renderAll);
  $(id).addEventListener("change", renderAll);
});

function renderRoutineList() {
  const routines = visibleRoutines($("exerciseTypeFilter").value || "all", $("exerciseFolderFilter").value || "all", $("exerciseSearch").value || "");
  if (!routines.length) { $("routineList").innerHTML = "<p>No exercises match the current filters.</p>"; return; }

  const grouped = {};
  routines.forEach(r => {
    const f = r.folder || "Unfiled", s = r.subfolder || "General";
    grouped[f] ||= {};
    grouped[f][s] ||= [];
    grouped[f][s].push(r);
  });

  $("routineList").innerHTML = Object.entries(grouped).map(([folder, subMap]) =>
    `<div class="folder-group"><div class="folder-header">${escapeHtml(folder)}</div>${
      Object.entries(subMap).map(([sub, rs]) => `<div class="subfolder-header">${escapeHtml(sub)}</div>${rs.map(renderRoutineItem).join("")}`).join("")
    }</div>`
  ).join("");
}
function renderRoutineItem(r) {
  return `<div class="item">
    <div class="item-title"><strong>${escapeHtml(r.name)}</strong><span class="badge">${fmtScoring(r.scoring)}</span></div>
    <p>${escapeHtml(r.description || "")}</p>
    <span class="badge">Type: ${escapeHtml(r.category || "uncategorized")}</span>
    <span class="badge">${r.duration || 0} min</span>
    ${r.attempts ? `<span class="badge">${r.attempts} attempts</span>` : ""}
    ${r.target ? `<span class="badge">Target: ${r.target}</span>` : ""}${r.isAnchor ? `<span class="badge anchor-badge">Anchor</span>` : ""}
    ${r.stretchTarget ? `<span class="badge">Stretch: ${r.stretchTarget}</span>` : ""}${r.scoring === "progressive_completion" ? `<span class="badge">Progressive: ${r.totalUnits || "?"} ${progressiveUnitLabel(r)}</span><span class="badge">Colour: ${fmtTargetColour(r.targetColour || inferTargetColour(r.targetMode))}</span>` : ""}
    ${renderTargetUpgradeButton(r.id)}
    <div class="small-actions">
      <button class="secondary" onclick="editRoutine('${r.id}')">Edit</button>
      <button class="secondary" onclick="duplicateRoutine('${r.id}')">Duplicate</button>
      <button class="danger" onclick="deleteRoutine('${r.id}')">Delete</button>
    </div>
  </div>`;
}
function editRoutine(id) {
  const r = routineById(id);
  if (!r) return;
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
  $("routineIsAnchor").value = r.isAnchor ? "yes" : "no";
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
  $("routineEditId").value = "";
  ["routineName","routineCategoryNew","routineFolderNew","routineSubfolderNew","routineAttempts","routineDuration","routineTarget","routineStretchTarget","routineTotalUnits","routineAttemptsPerSession","routineDifficultyLabel","routineDescription"].forEach(id => $(id).value = "");
  $("routineScoring").value = "raw";
  $("routineIsAnchor").value = "no";
  $("routineCategorySelect").value = "all";
  $("routineFolderSelect").value = "all";
  $("routineSubfolderSelect").value = "all";
}
$("clearRoutineFormBtn").addEventListener("click", clearRoutineForm);
function duplicateRoutine(id) {
  const r = routineById(id);
  if (!r) return;
  data.routines.push({...r, id: uuid(), name: `${r.name} copy`, isDeleted: false, deletedAt: ""});
  saveData();
}
function deleteRoutine(id) {
  return confirmDeleteAction("this exercise template", () => {
    const now = new Date().toISOString();
    data.routines = (data.routines || []).map(r => r.id === id ? {...r, isDeleted: true, deletedAt: now} : r);
    data.plans = data.plans.map(p => ({...p, routineIds: p.routineIds.filter(rid => rid !== id)}));
    saveData();
  });
}
$("saveRoutineBtn").addEventListener("click", () => {
  const name = $("routineName").value.trim();
  if (!name) return alert("Enter an exercise name.");
  const newCategory = $("routineCategoryNew").value.trim();
  const selectedCategory = $("routineCategorySelect").value;
  const category = newCategory || (selectedCategory !== "all" ? selectedCategory : "uncategorized");
  const newFolder = $("routineFolderNew").value.trim();
  const selectedFolder = $("routineFolderSelect").value;
  const folder = newFolder || (selectedFolder !== "all" ? selectedFolder : (category || "Unfiled"));
  const newSubfolder = $("routineSubfolderNew").value.trim();
  const selectedSubfolder = $("routineSubfolderSelect").value;
  const subfolder = newSubfolder || (selectedSubfolder !== "all" ? selectedSubfolder : "General");

  const routine = {
    id: $("routineEditId").value || uuid(),
    name,
    scoring: $("routineScoring").value,
    attempts: Number($("routineAttempts").value || 0) || "",
    duration: Number($("routineDuration").value || 0) || "",
    isAnchor: $("routineIsAnchor").value === "yes",
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
  saveData();
});

$("addRoutineToPlanBtn").addEventListener("click", () => {
  const id = $("routineToAdd").value;
  if (!id) return;
  planDraft.push(id);
  renderPlanBuilder();
});
function renderPlanBuilder() {
  $("planBuilderList").innerHTML = planDraft.map((id, i) => {
    const r = routineById(id);
    return `<div class="item">
      <strong>${i + 1}. ${escapeHtml(r?.name || "Missing exercise")}</strong>
      <p>${escapeHtml(r?.folder || "Unfiled")} / ${escapeHtml(r?.subfolder || "General")} · ${escapeHtml(r?.category || "uncategorized")}</p>
      <div class="small-actions">
        <button class="secondary" onclick="movePlanRoutine(${i}, -1)">Up</button>
        <button class="secondary" onclick="movePlanRoutine(${i}, 1)">Down</button>
        <button class="danger" onclick="removePlanRoutine(${i})">Remove</button>
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
$("randomizePlanBtn").addEventListener("click", () => randomizePlan(false));
$("appendRandomPlanBtn").addEventListener("click", () => randomizePlan(true));
function randomizePlan(append) {
  const n = Number($("randomCount").value || 0);
  if (!n || n < 1) return alert("Enter a valid number of exercises.");
  const pool = visibleRoutines($("randomTypeFilter").value || "all", $("randomFolderFilter").value || "all");
  if (!pool.length) return alert("No exercises match the randomizer filters.");
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, Math.min(n, shuffled.length)).map(r => r.id);
  planDraft = append ? planDraft.concat(picked) : picked;
  if (!$("planName").value.trim()) $("planName").value = `Random training — ${new Date().toLocaleDateString()}`;
  renderPlanBuilder();
}
$("savePlanBtn").addEventListener("click", () => {
  const name = $("planName").value.trim();
  if (!name) return alert("Enter a plan name.");
  if (!planDraft.length) return alert("Add at least one routine.");
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
        <button class="secondary" onclick="loadPlanToBuilder('${p.id}')">Load / duplicate</button>
        <button class="danger" onclick="deletePlan('${p.id}')">Delete</button>
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
    saveData();
  });
}

$("resumeSessionBtn").addEventListener("click", resumePersistedSession);
$("discardSessionBtn").addEventListener("click", discardPersistedSession);
$("todayResumeSessionBtn").addEventListener("click", resumePersistedSession);
$("todayDiscardSessionBtn").addEventListener("click", discardPersistedSession);

$("startSessionBtn").addEventListener("click", () => {
  const plan = data.plans.find(p => p.id === $("planSelect").value);
  if (!plan) return alert("Create or select a plan first.");
  activeSession = { id: uuid(), type: "plan", planId: plan.id, planName: plan.name, routineIds: [...anchorRoutines().map(r=>r.id), ...plan.routineIds.filter(id => activeRoutines().some(r => r.id === id) && !anchorRoutines().some(a=>a.id===id))], index: 0, startedAt: new Date().toISOString(), completedLogs: [], plannedRoutineIds: plan.routineIds ? [...plan.routineIds] : [] };
  startRoutineScreen();
  persistActiveSession();
});
$("startFreeSessionBtn").addEventListener("click", () => {
  const rid = $("freeRoutineSelect").value;
  if (!rid) return alert("Create at least one exercise first.");
  activeSession = { id: uuid(), type: "free", planName: `Free training — ${new Date().toLocaleDateString()}`, routineIds: [rid], index: 0, startedAt: new Date().toISOString(), completedLogs: [] };
  startRoutineScreen();
  persistActiveSession();
});
$("repeatLastExerciseBtn").addEventListener("click", () => {
  const last = data.logs.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
  if (!last) return alert("No previous exercise to repeat yet.");
  const routine = routineById(last.routineId);
  if (!routine) return alert("The last exercise template no longer exists.");
  activeSession = { id: uuid(), type: "free", planName: `Repeat — ${new Date().toLocaleDateString()}`, routineIds: [routine.id], index: 0, startedAt: new Date().toISOString(), completedLogs: [] };
  startRoutineScreen();
});

function startRoutineScreen() {
  persistActiveSession();
  resetTimerState();
  $("sessionSummary").classList.add("hidden");
  $("freeNextCard").classList.add("hidden");
  $("activeSession").classList.remove("hidden");
  updateSessionFocusState();
  renderCurrentRoutine();
}
$("resetSessionBtn").addEventListener("click", () => {
  activeSession = null;
  clearPersistedActiveSession();
  stopTimer();
  resetTimerState();
  $("activeSession").classList.add("hidden");
  $("freeNextCard").classList.add("hidden");
  updateSessionFocusState();
  $("sessionSummary").classList.add("hidden");
  updateSessionFocusState();
});
function renderCurrentRoutine() {
  persistActiveSession();
  if (!activeSession || activeSession.index >= activeSession.routineIds.length) return completeSession();
  const r = routineById(activeSession.routineIds[activeSession.index]);
  if (!r) return;
  $("currentRoutineName").textContent = r.name;
  const sessionTxt = activeSession.type === "free" ? "Free training" : `${activeSession.index + 1}/${activeSession.routineIds.length}`;
  $("currentRoutineMeta").textContent = `${sessionTxt} · ${fmtScoring(r.scoring)} · target ${r.target || "n/a"} · default ${r.duration || 0} min · ${r.folder || "Unfiled"} / ${r.subfolder || "General"}`;
  $("practiceNotes").value = "";
  $("sessionVenueTable").value = activeSession.tableId || getLastTableId() || "";
  
  $("sessionIntervention").value = "";
  $("sessionInterventionNote").value = "";
  $("sessionRating").value = "";
  $("sessionTags").value = "";
  if (r.description) { $("routineDescriptionBox").textContent = r.description; $("routineDescriptionBox").classList.remove("hidden"); }
  else $("routineDescriptionBox").classList.add("hidden");
  resetTimerState();
  renderScoreInputs(r);
  prefillSmartDefaults(r);
  $("saveNextBtn").textContent = activeSession.type === "free" ? "Save Routine" : "Save & Next";
  $("skipBtn").classList.toggle("hidden", activeSession.type === "free");
  $("endFreeSessionBtn").classList.toggle("hidden", activeSession.type !== "free");
  updateSessionFocusState();
  renderLivePerformanceCard(r);
}
function renderScoreInputs(r) {
  let html = "";
  if (r.scoring === "progressive_completion") {
    html += `<div><label>Average ${progressiveUnitLabel(r)} per attempt</label><input id="scoreValue" type="number" min="0" step="0.01" placeholder="e.g. 8" inputmode="decimal"></div>`;
    html += `<div><label>Best attempt (${progressiveUnitLabel(r)})</label><input id="bestAttemptValue" type="number" min="0" step="0.01" placeholder="e.g. 12" inputmode="decimal"></div>`;
    html += `<div><label>Attempts</label><input id="attemptsValue" type="number" min="1" step="1" value="${r.attemptsPerSession || r.attempts || ""}" inputmode="numeric"></div>`;
    html += `<div><label>Completions</label><input id="completionCountValue" type="number" min="0" step="1" placeholder="0 if none" inputmode="numeric"></div>`;
    if (r.trackHighestBreak) html += `<div><label>Highest break (optional)</label><input id="highestBreakValue" type="number" min="0" step="1" placeholder="e.g. 32" inputmode="numeric"></div>`;
    html += `<div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty" inputmode="decimal"></div>`;
  } else if (r.scoring === "success_rate") {
    html += `<div><label>Made</label><input id="scoreValue" type="number" min="0" step="1" placeholder="e.g. 7" inputmode="numeric"></div>`;
    html += `<div><label>Attempts</label><input id="attemptsValue" type="number" min="1" step="1" value="${r.attempts || ""}" placeholder="e.g. 10" inputmode="numeric"></div>`;
    html += `<div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty" inputmode="decimal"></div>`;
  } else {
    html += `<div><label>Score</label><input id="scoreValue" type="number" step="0.01" placeholder="Enter score" inputmode="decimal"></div>`;
    html += `<div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty" inputmode="decimal"></div>`;
  }
  $("scoreInputs").innerHTML = html;
  renderQuickScoreControls(r);
  setTimeout(() => $("scoreValue")?.focus(), 120);
  ["scoreValue","attemptsValue","manualTimeValue","bestAttemptValue","completionCountValue","highestBreakValue"].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener("keydown", e => { if (e.key === "Enter") saveCurrentRoutine(); });
      el.addEventListener("input", () => renderLivePerformanceCard(r));
    }
  });
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
  if ($("sessionRating") && last.sessionRating) $("sessionRating").value = last.sessionRating;
  if ($("sessionTags") && last.sessionTags) $("sessionTags").value = last.sessionTags;
}

function renderQuickScoreControls(r) {
  const box = $("quickScoreControls");
  if (!box) return;
  box.classList.remove("hidden");
  const autoMacros = getQuickLogAutoAdvanceSetting() !== "off";
  if (r.scoring === "success_rate") {
    const attempts = Math.max(1, Number(r.attempts || r.attemptsPerSession || 10));
    const chips = Array.from({length: Math.min(attempts, 30) + 1}, (_, i) => i)
      .map(i => `<button class="secondary score-chip" type="button" onclick="setScoreValue(${i}); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">${i}</button>`)
      .join("");
    box.innerHTML = `
      <div class="quick-score-block">
        <div class="quick-score-title">Made count</div>
        <div class="score-chip-grid">${chips}</div>
        ${attempts > 30 ? `<p class="muted">Large attempt count detected. Use the number field for scores above 30.</p>` : ""}
        <div class="quick-score-row">
          <button class="secondary" type="button" onclick="setScoreValue(0); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">0</button>
          <button class="secondary" type="button" onclick="setScoreValue(${Math.floor(attempts/2)}); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">Half</button>
          <button class="secondary" type="button" onclick="setScoreValue(${attempts}); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">Max</button>
          <button class="secondary" type="button" onclick="decrementScore(); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">-1</button>
          <button class="secondary" type="button" onclick="incrementScore(); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">+1</button>
          <button class="secondary" type="button" onclick="fillSameAsLastTime(); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">Same as last</button>
        </div>
        ${autoMacros ? `<div class="quick-score-row quick-log-row">
          <button type="button" onclick="quickLogScore(0)">Log 0 & next</button>
          <button type="button" onclick="quickLogScore(${Math.floor(attempts/2)})">Log half & next</button>
          <button type="button" onclick="quickLogScore(${attempts})">Log max & next</button>
        </div>` : ""}
      </div>`;
  } else {
    box.innerHTML = `
      <div class="quick-score-row">
        <button class="secondary" type="button" onclick="decrementScore(); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">-1</button>
        <button class="secondary" type="button" onclick="incrementScore(); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">+1</button>
        <button class="secondary" type="button" onclick="adjustScore(5); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">+5</button>
        <button class="secondary" type="button" onclick="adjustScore(10); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">+10</button>
        <button class="secondary" type="button" onclick="setScoreValue(0); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">Clear</button>
        <button class="secondary" type="button" onclick="fillSameAsLastTime(); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">Same as last</button>
      </div>`;
  }
}
function quickLogScore(score) {
  setScoreValue(score);
  saveCurrentRoutine();
}
function scoreNumber() { return Number($("scoreValue")?.value || 0); }
function setScoreValue(v) { if ($("scoreValue")) { $("scoreValue").value = v; $("scoreValue").focus(); } }
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

$("saveNextBtn").addEventListener("click", saveCurrentRoutine);
$("skipBtn").addEventListener("click", () => { if (!activeSession) return; activeSession.index += 1; persistActiveSession(); stopTimer(); renderCurrentRoutine(); });
$("endFreeSessionBtn").addEventListener("click", completeSession);
$("endFreeFromNextBtn").addEventListener("click", completeSession);
$("continueFreeBtn").addEventListener("click", () => {
  if (!activeSession) return;
  const rid = $("nextFreeRoutineSelect").value;
  if (!rid) return alert("Select a routine.");
  activeSession.routineIds = [rid];
  activeSession.index = 0;
  $("freeNextCard").classList.add("hidden");
  $("activeSession").classList.remove("hidden");
  renderCurrentRoutine();
});
function saveCurrentRoutine() {
  if (!activeSession) return;
  const r = routineById(activeSession.routineIds[activeSession.index]);
  if (!r) return;
  const score = Number($("scoreValue")?.value || 0);
  const attempts = (r.scoring === "success_rate" || r.scoring === "progressive_completion") ? Number($("attemptsValue")?.value || 0) : Number(r.attempts || 0);
  const manualTime = Number($("manualTimeValue")?.value || 0);
  const timerMinutes = getElapsedMinutes();
  const timeMinutes = manualTime || timerMinutes || Number(r.duration || 0);
  if (r.scoring === "success_rate" && attempts <= 0) return alert("Enter attempts.");
  if (Number.isNaN(score)) return alert("Enter a valid score.");
  if (r.scoring === "progressive_completion" && Number(r.totalUnits || 0) <= 0) return alert("Enter Total units / completion size in the exercise setup before logging this progressive completion drill.");
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
    scoring: r.scoring,
    score,
    attempts,
    timeMinutes: Math.round(timeMinutes * 10) / 10,
    normalizedScore: 0,
    bestAttempt: Number($("bestAttemptValue")?.value || 0) || "",
    completionCount: Number($("completionCountValue")?.value || 0) || "",
    highestBreak: Number($("highestBreakValue")?.value || 0) || "",
    totalUnits: r.totalUnits || "",
    unitType: r.unitType || "",
    targetMode: r.targetMode || "",
    targetProfileId: activeProfile?.id || "",
    targetAtLog: activeProfile?.target || r.target || "",
    stretchTargetAtLog: activeProfile?.stretchTarget || r.stretchTarget || "",
    totalUnitsAtLog: activeProfile?.totalUnits || r.totalUnits || "",
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
  data.logs.push(log);
  activeSession.completedLogs.push(log);
  stopTimer();

  if (activeSession.type === "free") {
    saveData({render:"sessionLog"});
    $("activeSession").classList.add("hidden");
    $("freeNextCard").classList.remove("hidden");
    updateSessionFocusState();
  } else {
    activeSession.index += 1;
    persistActiveSession();
    saveData({render:"sessionLog"});
    renderCurrentRoutine();
  }
}
function completeSession() {
  if (!activeSession) return;
  stopTimer();
  $("activeSession").classList.add("hidden");
  $("freeNextCard").classList.add("hidden");
  updateSessionFocusState?.();
  const logs = activeSession.completedLogs || data.logs.filter(l => l.sessionId === activeSession.id);
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
  safeStorageSet(STORAGE_KEY, JSON.stringify(data), "startup save");
  resetTimerState();
  if (activeSession) activeSession.timerState = null;
  activeSession = null;
  clearPersistedActiveSession();
  updateSessionFocusState?.();
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  $("practice")?.classList.add("active");
  document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
  document.querySelector('.tab[data-tab="practice"]')?.classList.add("active");
  renderToday();
  openReflectionModal(completedSessionId);
  renderStats();
}

function getElapsedMs() { return elapsedBeforeStartMs + (timerStartMs ? Date.now() - timerStartMs : 0); }
function getElapsedMinutes() { return Math.round((getElapsedMs() / 60000) * 10) / 10; }
function syncTimerStateToActiveSession() {
  if (!activeSession) return;
  activeSession.timerState = {
    timerStartMs: timerStartMs || null,
    elapsedBeforeStartMs: Number(elapsedBeforeStartMs || 0),
    isRunning: !!timerStartMs,
    savedAt: new Date().toISOString()
  };
  persistActiveSession();
}
function restoreTimerStateFromActiveSession() {
  const ts = activeSession?.timerState;
  if (!ts) return false;
  stopTimer();
  elapsedBeforeStartMs = Number(ts.elapsedBeforeStartMs || 0);
  timerStartMs = ts.isRunning && ts.timerStartMs ? Number(ts.timerStartMs) : null;
  if (timerStartMs) {
    timerInterval = setInterval(updateTimerDisplay, 250);
    if ($("timerState")) $("timerState").textContent = "timer running";
  } else if (elapsedBeforeStartMs > 0 && $("timerState")) {
    $("timerState").textContent = "timer paused";
  }
  updateTimerDisplay();
  return true;
}
function resetTimerState() { stopTimer(); timerStartMs = null; elapsedBeforeStartMs = 0; updateTimerDisplay(); if (!suppressTimerPersistence) syncTimerStateToActiveSession(); }
$("timerStartBtn").addEventListener("click", () => {
  if (timerStartMs) return;
  timerStartMs = Date.now();
  timerInterval = setInterval(updateTimerDisplay, 250);
  $("timerState").textContent = "timer running";
  updateTimerDisplay();
  syncTimerStateToActiveSession();
});
$("timerPauseBtn").addEventListener("click", () => {
  if (!timerStartMs) return;
  elapsedBeforeStartMs += Date.now() - timerStartMs;
  timerStartMs = null;
  stopTimer();
  $("timerState").textContent = "timer paused";
  updateTimerDisplay();
  syncTimerStateToActiveSession();
});
$("timerResetBtn").addEventListener("click", resetTimerState);
function stopTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; }
function updateTimerDisplay() {
  const totalSeconds = Math.floor(getElapsedMs() / 1000);
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  $("timerDisplay").textContent = `${mins}:${secs}`;
  if (!timerStartMs && getElapsedMs() === 0) $("timerState").textContent = "timer stopped";
}
function displayScore(l) {
  if (l.scoring === "progressive_completion") return `${l.score}/${l.totalUnits || "?"} ${l.unitType || "units"} avg (${Number(l.normalizedScore || 0).toFixed(1)}%)${l.targetColour ? " · "+fmtTargetColour(l.targetColour) : ""}${l.bestAttempt ? " · best "+l.bestAttempt : ""}${l.highestBreak ? " · break "+l.highestBreak : ""}`;
  if (l.scoring === "success_rate") return `${l.score}/${l.attempts} (${Number(l.normalizedScore || 0).toFixed(1)}%)`;
  if (l.scoring === "score_per_minute") return `${l.score} (${Number(l.normalizedScore || 0).toFixed(2)}/min)`;
  return `${l.score}`;
}

function getPeriodRange(period, dateKey) {
  const d = dateKey ? new Date(dateKey + "T00:00:00") : new Date();
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
    buckets[key] ||= {label:key, logs:[], time:0, avg:0, count:0};
    buckets[key].logs.push(l);
    buckets[key].time += Number(l.timeMinutes || 0);
  });
  Object.values(buckets).forEach(b => {
    b.count = b.logs.length;
    b.avg = avg(b.logs.map(l => Number(l.normalizedScore || 0)));
  });
  return Object.values(buckets).sort((a,b) => a.label.localeCompare(b.label));
}
function rollingAverage(values, windowSize) {
  return values.map((_, i) => {
    const slice = values.slice(Math.max(0, i-windowSize+1), i+1);
    return avg(slice);
  });
}
function movingTrend(values, windowSize) {
  if (values.length < windowSize * 2) return "Not enough data";
  const recent = avg(values.slice(-windowSize));
  const prior = avg(values.slice(-(windowSize*2), -windowSize));
  if (!prior) return "Not enough baseline";
  const delta = ((recent - prior) / Math.abs(prior)) * 100;
  if (delta > 7.5) return `Improving (+${delta.toFixed(1)}% vs prior ${windowSize})`;
  if (delta < -7.5) return `Declining (${delta.toFixed(1)}% vs prior ${windowSize})`;
  return `Stable (${delta.toFixed(1)}% vs prior ${windowSize})`;
}
function benchmarkText(values, windowSize) {
  if (!values.length) return "No data";
  const latest = values[values.length-1];
  const baseline = values.length > 1 ? avg(values.slice(Math.max(0, values.length-windowSize-1), -1)) : latest;
  if (!baseline) return "No baseline";
  const delta = ((latest - baseline) / Math.abs(baseline)) * 100;
  return `${latest.toFixed(2)} latest vs ${baseline.toFixed(2)} personal baseline (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%)`;
}
function targetHitRate(logs) {
  const targetLogs = logs.filter(l => (l.performance || "N/A") !== "N/A");
  if (!targetLogs.length) return null;
  return targetLogs.filter(l => l.performance === "On Target" || l.performance === "Above Target").length / targetLogs.length * 100;
}
function streaks(logs) {
  const dates = [...new Set(logs.map(l => localDateKey(l.createdAt)))].sort();
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


$("generateConstraintPlanBtn").addEventListener("click", () => {
  const total = Number($("constraintTotalMinutes").value || 60);
  const count = Math.max(1, Number($("constraintExerciseCount").value || 4));
  const focus = $("constraintFocusType").value || "all";
  const allocs = [
    {key:"potting", pct:Number($("allocPotting").value || 0)},
    {key:"break-building", pct:Number($("allocBreak").value || 0)},
    {key:"other", pct:Number($("allocOther").value || 0)}
  ];
  let pool = visibleRoutines();
  if (focus !== "all") {
    const focused = pool.filter(r => (r.category || "").toLowerCase() === focus.toLowerCase());
    if (focused.length) pool = focused.concat(pool.filter(r => !focused.includes(r)));
  }
  const picked = [];
  allocs.forEach(a => {
    const n = Math.max(0, Math.round(count * a.pct / 100));
    let catPool = pool.filter(r => {
      const c = (r.category || "").toLowerCase();
      if (a.key === "other") return c !== "potting" && c !== "break-building";
      return c === a.key;
    });
    catPool.sort(() => Math.random() - 0.5).slice(0,n).forEach(r => picked.push(r.id));
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
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  d.setHours(0,0,0,0);
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
  const max = Math.max(1, ...load.map(d=>d.time));
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
  $("reflectionNote").value = "";
  $("reflectionModal").classList.remove("hidden");
}
function closeReflectionModal(event) {
  if (event.target && event.target.id === "reflectionModal") skipReflection();
}
function saveReflection() {
  if (!pendingReflectionSessionId) return skipReflection();
  const idx = (data.sessions || []).findIndex(s => s.id === pendingReflectionSessionId);
  if (idx >= 0) {
    data.sessions[idx].reflection = {
      focus: $("reflectionFocus").value || "",
      limiter: $("reflectionLimiter").value || "",
      note: $("reflectionNote").value || "",
      createdAt: new Date().toISOString()
    };
    safeStorageSet(STORAGE_KEY, JSON.stringify(data), "startup save");
  }
  skipReflection();
  renderAll();
}
function skipReflection() {
  pendingReflectionSessionId = "";
  if ($("reflectionModal")) $("reflectionModal").classList.add("hidden");
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
function supportsExportFolderPicker(){ return "showDirectoryPicker" in window && "indexedDB" in window; }
function openExportFolderDB(){ return new Promise((resolve,reject)=>{ const req=indexedDB.open(EXPORT_FOLDER_DB,1); req.onupgradeneeded=()=>req.result.createObjectStore(EXPORT_FOLDER_STORE); req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); }); }
async function saveExportFolderHandle(handle){ const db=await openExportFolderDB(); return new Promise((resolve,reject)=>{ const tx=db.transaction(EXPORT_FOLDER_STORE,"readwrite"); tx.objectStore(EXPORT_FOLDER_STORE).put(handle,EXPORT_FOLDER_KEY); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); }); }
async function getExportFolderHandle(){ if(!supportsExportFolderPicker()) return null; try{ const db=await openExportFolderDB(); return await new Promise((resolve,reject)=>{ const tx=db.transaction(EXPORT_FOLDER_STORE,"readonly"); const req=tx.objectStore(EXPORT_FOLDER_STORE).get(EXPORT_FOLDER_KEY); req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error); }); }catch(e){ logAppError(e,"getExportFolderHandle"); return null; } }
async function clearExportFolderHandle(){ if(!("indexedDB" in window)) return; try{ const db=await openExportFolderDB(); await new Promise((resolve,reject)=>{ const tx=db.transaction(EXPORT_FOLDER_STORE,"readwrite"); tx.objectStore(EXPORT_FOLDER_STORE).delete(EXPORT_FOLDER_KEY); tx.oncomplete=resolve; tx.onerror=()=>reject(tx.error); }); }catch(e){ logAppError(e,"clearExportFolderHandle"); } }
async function ensureExportFolderPermission(handle){ if(!handle) return false; try{ const opts={mode:"readwrite"}; if((await handle.queryPermission(opts))==="granted") return true; return (await handle.requestPermission(opts))==="granted"; }catch(e){ logAppError(e,"ensureExportFolderPermission"); return false; } }
async function chooseExportFolder(){ if(!supportsExportFolderPicker()){ alert("Folder selection is not supported in this browser. Exports will continue using normal downloads."); renderExportFolderStatus(); return; } try{ const handle=await window.showDirectoryPicker({mode:"readwrite"}); await saveExportFolderHandle(handle); localStorage.setItem("snookerPracticePWA.exportFolderName", handle.name || "Selected folder"); renderExportFolderStatus(); }catch(e){ if(e&&e.name!=="AbortError") logAppError(e,"chooseExportFolder"); } }
async function clearExportFolder(){ await clearExportFolderHandle(); localStorage.removeItem("snookerPracticePWA.exportFolderName"); renderExportFolderStatus(); }
async function renderExportFolderStatus(){ const el=$("exportFolderStatus"); if(!el) return; if(!supportsExportFolderPicker()){ el.className="analytics-note export-folder-fallback"; el.innerHTML="Folder export is not supported by this browser. Files will use normal Downloads."; return; } const handle=await getExportFolderHandle(); if(!handle){ el.className="analytics-note export-folder-fallback"; el.innerHTML="Export folder not selected. Files will use normal Downloads."; return; } const name=localStorage.getItem("snookerPracticePWA.exportFolderName") || handle.name || "Selected folder"; el.className="analytics-note export-folder-ok"; el.innerHTML=`Selected export folder: <strong>${escapeHtml(name)}</strong>.`; }
async function saveTextFileToExportFolder(filename,text,mimeType="application/octet-stream"){ const handle=await getExportFolderHandle(); if(!handle) return false; const ok=await ensureExportFolderPermission(handle); if(!ok) return false; try{ const fileHandle=await handle.getFileHandle(filename,{create:true}); const writable=await fileHandle.createWritable(); await writable.write(new Blob([text],{type:mimeType})); await writable.close(); return true; }catch(e){ logAppError(e,"saveTextFileToExportFolder"); return false; } }
async function exportFile(filename,text,mimeType="application/octet-stream"){ const saved=await saveTextFileToExportFolder(filename,text,mimeType); if(!saved) downloadFile(filename,text,mimeType); }

function ensureTablesDatabase() {
  data.tables = data.tables || [];
  const defaults = ["Home table", "Club table 1", "Club table 2", "Club table 3", "Club table 4", "Other"];
  defaults.forEach(name => {
    if (!data.tables.some(t => t.name === name)) {
      data.tables.push({id: uuid(), name, type:name.includes("Club")?"Club":(name==="Home table"?"Home":"Other"), info:"", createdAt:new Date().toISOString(), nameHistory:[]});
    }
  });
  (data.logs || []).forEach(l => {
    if (l.venueTable && !l.tableId) {
      const found = data.tables.find(t => t.name === l.venueTable);
      if (found) { l.tableId = found.id; l.venueTableSnapshot = l.venueTable; }
    }
  });
}
function tableById(id){ ensureTablesDatabase(); return (data.tables||[]).find(t=>t.id===id); }
function tableByName(name){ ensureTablesDatabase(); return (data.tables||[]).find(t=>t.name===name); }
function getTableName(logOrId){ const id=typeof logOrId==="string"?logOrId:(logOrId?.tableId||""); const fallback=typeof logOrId==="string"?"":(logOrId?.venueTable||logOrId?.venueTableSnapshot||""); return tableById(id)?.name || fallback || "Not specified"; }
function getLastTableId(){ return localStorage.getItem("snookerPracticePWA.lastTableId") || ""; }
function rememberTableId(tableId,note){ if(tableId!==undefined) localStorage.setItem("snookerPracticePWA.lastTableId",tableId||""); if(note!==undefined) localStorage.setItem(LAST_TABLE_NOTE_KEY,note||""); }
function renderTableSelects(){ ensureTablesDatabase(); const sel=$("sessionVenueTable"); if(!sel) return; const current=sel.value||getLastTableId()||""; sel.innerHTML=`<option value="">Not specified</option>`+data.tables.map(t=>`<option value="${escapeAttr(t.id)}">${escapeHtml(t.name)}</option>`).join(""); sel.value=current&&data.tables.some(t=>t.id===current)?current:""; }
function clearTableForm(){ if(!$("tableNameInput")) return; $("tableEditId").value=""; $("tableNameInput").value=""; $("tableTypeInput").value=""; $("tableInfoInput").value=""; }
function saveTableDefinition(){ ensureTablesDatabase(); const name=$("tableNameInput").value.trim(); if(!name) return alert("Enter a table name."); const id=$("tableEditId").value||uuid(); const existing=data.tables.find(t=>t.id===id); const table={id,name,type:$("tableTypeInput").value.trim(),info:$("tableInfoInput").value.trim(),createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),nameHistory:existing?.nameHistory||[]}; if(existing&&existing.name!==name)table.nameHistory.push({name:existing.name,changedAt:new Date().toISOString()}); data.tables=existing?data.tables.map(t=>t.id===id?table:t):[...data.tables,table]; clearTableForm(); saveData(); }
function editTableDefinition(id){ const t=tableById(id); if(!t)return; $("tableEditId").value=t.id; $("tableNameInput").value=t.name||""; $("tableTypeInput").value=t.type||""; $("tableInfoInput").value=t.info||""; }
function deleteTableDefinition(id){ const used=(data.logs||[]).some(l=>l.tableId===id); if(used)return alert("This table is used by logs. Rename it instead of deleting so historical stats remain linked."); if(!confirm("Delete this table definition?"))return; data.tables=(data.tables||[]).filter(t=>t.id!==id); saveData(); }
function renderEditTableOptions(currentId,currentName=""){ ensureTablesDatabase(); const selectedId=currentId||tableByName(currentName)?.id||""; return `<option value="">Not specified</option>`+data.tables.map(t=>`<option value="${escapeAttr(t.id)}" ${t.id===selectedId?"selected":""}>${escapeHtml(t.name)}</option>`).join(""); }
function renderTableDatabase(){ const box=$("tableList"); if(!box)return; ensureTablesDatabase(); box.innerHTML=(data.tables||[]).map(t=>`<div class="table-db-row"><div><strong>${escapeHtml(t.name)}</strong><div class="meta">${escapeHtml(t.type||"No type")} · ${escapeHtml(t.info||"No info")}</div>${(t.nameHistory||[]).length?`<div class="meta">Previous names: ${(t.nameHistory||[]).map(x=>escapeHtml(x.name)).join(", ")}</div>`:""}</div><div class="small-actions"><button class="secondary" onclick="editTableDefinition('${t.id}')">Edit</button><button class="secondary" onclick="deleteTableDefinition('${t.id}')">Delete</button></div></div>`).join(""); }
function analyticsHelp(title,measures,calc,interpret,use){ return `<div class="help-rich"><p><strong>What it measures:</strong> ${measures}</p><p><strong>How calculated:</strong> ${calc}</p><p><strong>How to interpret:</strong> ${interpret}</p><div class="example"><strong>Typical use:</strong> ${use}</div></div>`; }


let adaptivePlanDraft = [];


function getPeriodizationPhase() {
  const manual = $("periodizationPhase")?.value || "auto";
  if (manual !== "auto") return manual;

  const comp = $("competitionDate")?.value ? new Date($("competitionDate").value) : null;
  if (comp && !Number.isNaN(comp.getTime())) {
    const days = Math.ceil((comp.getTime() - Date.now()) / 86400000);
    if (days <= 7) return "performance";
    if (days <= 21) return "stabilization";
    return "acquisition";
  }

  const recentLoad = typeof trainingLoadByDay === "function" ? trainingLoadByDay(14) : [];
  const last7 = recentLoad.slice(-7).reduce((a,b)=>a+Number(b.time||0),0);
  const prev7 = recentLoad.slice(0,7).reduce((a,b)=>a+Number(b.time||0),0);
  const f = fatigueSlope(data.logs || []);
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
      rationale:"Best when execution is inconsistent and PSI is low."
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
  out.innerHTML = `<div class="phase-card ${cls}">
    <strong>Counterfactual comparison ${statHelpButton("regretEngine")}</strong>
    <div>${escapeHtml(cr?.name || "Chosen")}: expected ${c.expected.toFixed(1)} · n=${c.n}${c.psi!==null?` · PSI ${c.psi.toFixed(0)}`:""}</div>
    <div>${escapeHtml(ar?.name || "Alternative")}: expected ${a.expected.toFixed(1)} · n=${a.n}${a.psi!==null?` · PSI ${a.psi.toFixed(0)}`:""}</div>
    <div class="adaptive-rationale"><strong>Regret estimate:</strong> ${regret>=0?"+":""}${regret.toFixed(1)} points vs chosen.</div>
    <div class="adaptive-rationale">${escapeHtml(msg)}</div>
    <div class="adaptive-rationale">Interpretation: this is a heuristic selection-quality signal, not proof that the alternative would have caused better performance.</div>
  </div>`;
}

function adaptiveRoutineState(routineId) {
  const r = routineById(routineId);
  const logs = (data.logs || []).filter(l => l.routineId === routineId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const recent = logs.slice(-8);
  const hit = recent.length ? targetHitRate(recent) : null;
  const psi = performanceStabilityIndex(logs.slice(-10), 10);
  const drift = logs.length >= 6 ? performanceDrift(logs, Math.min(8, Math.max(5, Math.floor(logs.length/2)))) : null;
  const plateau = plateauDetector(logs, 6);
  const fatigue = fatigueSlope(logs);
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

  return {routine:r, logs, recent, hit, psi, drift, plateau, fatigue, days, upgrade, gap, phase, reasons};
}

function adaptivePriorityScore(state, goal="auto") {
  let score = 0;
  const r = state.routine;
  if (!r) return -999;
  if (r.isAnchor) score += 18;
  if (state.hit !== null) score += Math.max(0, 75 - state.hit) * 0.4;
  if (state.psi && state.psi.psi < 70) score += (70 - state.psi.psi) * 0.35;
  if (state.drift && state.drift.deltaPct < 0) score += Math.min(20, Math.abs(state.drift.deltaPct));
  if (state.plateau && state.plateau.isPlateau) score += 14;
  if (state.days >= 7) score += Math.min(18, state.days);
  if (undertrainedCategoryBonus(r.id)) score += undertrainedCategoryBonus(r.id) * 0.8;

  if (goal === "stability") {
    if (state.phase === "stabilize" || r.isAnchor) score += 25;
  } else if (goal === "progression") {
    if (state.phase === "progress" || state.upgrade) score += 25;
  } else if (goal === "recovery") {
    if (state.phase === "recover" || (state.fatigue && state.fatigue.slope < -0.25)) score += 25;
  } else if (goal === "variety") {
    if (state.phase === "vary" || state.days >= 10) score += 25;
  } else {
    if (["stabilize","progress","vary","recover","refresh"].includes(state.phase)) score += 15;
  }
  return score;
}

function adaptiveActionForState(state) {
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

function adaptiveSessionStructure(goal, duration, strictness) {
  const targetMinutes = Number(duration || 60);
  const states = activeRoutines().map(r => adaptiveRoutineState(r.id));
  const ranked = states.map(s => ({...s, adaptiveScore: adaptivePriorityScore(s, goal)})).sort((a,b)=>b.adaptiveScore-a.adaptiveScore);
  const anchors = ranked.filter(s => s.routine.isAnchor).slice(0, strictness === "high" ? 3 : 2);
  const main = ranked.filter(s => !anchors.some(a=>a.routine.id===s.routine.id));

  const fatigueAll = fatigueSlope(data.logs || []);
  const recentLoad = trainingLoadByDay ? trainingLoadByDay(14) : [];
  const last7 = recentLoad.slice(-7).reduce((a,b)=>a+Number(b.time||0),0);
  const prev7 = recentLoad.slice(0,7).reduce((a,b)=>a+Number(b.time||0),0);
  let effectiveGoal = goal;
  const globalReasons = [];

  if (goal === "auto") {
    if (fatigueAll && fatigueAll.slope < -0.25) {
      effectiveGoal = "recovery";
      globalReasons.push("global fatigue slope is negative");
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

  if (anchorPicks.length) {
    blocks.push({name:"Anchor baseline", minutes:Math.min(15, Math.round(targetMinutes*0.25)), purpose:"Benchmark consistency", picks:anchorPicks});
  }

  if (effectiveGoal === "recovery") {
    blocks.push({name:"Recovery technique block", minutes:Math.round(targetMinutes*0.55), purpose:"Protect quality and reduce fatigue drag", picks:take(s => ["recover","stabilize","maintain"].includes(s.phase), 3)});
  } else if (effectiveGoal === "progression") {
    blocks.push({name:"Progression block", minutes:Math.round(targetMinutes*0.55), purpose:"Increase target or constraint on stable drills", picks:take(s => s.phase === "progress" || s.upgrade, 3)});
    blocks.push({name:"Control block", minutes:Math.round(targetMinutes*0.20), purpose:"Keep fundamentals stable", picks:take(s => s.phase === "maintain" || s.routine.isAnchor, 2)});
  } else if (effectiveGoal === "stability") {
    blocks.push({name:"Stability block", minutes:Math.round(targetMinutes*0.60), purpose:"Repeat unstable drills without changing difficulty", picks:take(s => s.phase === "stabilize" || s.psi?.psi < 70, 4)});
  } else if (effectiveGoal === "variety") {
    blocks.push({name:"Robustness block", minutes:Math.round(targetMinutes*0.60), purpose:"Avoid overfitting by adding variation", picks:take(s => ["vary","refresh","maintain"].includes(s.phase), 4)});
  } else {
    blocks.push({name:"Main adaptive block", minutes:Math.round(targetMinutes*0.60), purpose:"Highest current adaptive priorities", picks:take(s => true, 4)});
  }

  const remaining = take(s => true, 3);
  if (remaining.length) {
    blocks.push({name:"Completion block", minutes:Math.max(10, targetMinutes - blocks.reduce((a,b)=>a+b.minutes,0)), purpose:"Fill remaining time with next best priorities", picks:remaining});
  }

  blocks = blocks.filter(b => b.picks && b.picks.length);
  const routineIds = blocks.flatMap(b => b.picks.map(p => p.routine.id));
  return {effectiveGoal, targetMinutes, globalReasons, blocks, routineIds, ranked};
}

function renderAdaptiveSession() {
  const rawGoal = $("adaptiveGoal")?.value || "auto";
  const phaseInfo = applyPeriodizationToAdaptiveInputs();
  const goal = rawGoal === "auto" ? phaseInfo.settings.goal : rawGoal;
  const baseDuration = Number($("adaptiveDuration")?.value || "60");
  const duration = Math.max(30, Math.round(baseDuration * phaseInfo.settings.durationMultiplier));
  const strictness = $("adaptiveStrictness")?.value || "normal";
  const plan = adaptiveSessionStructure(goal, duration, strictness);
  adaptivePlanDraft = [...plan.routineIds];

  const html = `<div class="adaptive-phase ${plan.effectiveGoal==="recovery"?"adaptive-risk":plan.effectiveGoal==="progression"?"adaptive-ok":"adaptive-watch"}">
    <h4>Recommended mode: ${escapeHtml(plan.effectiveGoal)}</h4>
    <div>${plan.globalReasons.map(r=>`<span class="adaptive-pill">${escapeHtml(r)}</span>`).join("")}</div>
    <div class="adaptive-rationale">Target duration: ${formatDurationHuman(plan.targetMinutes)}</div>
  </div>` + plan.blocks.map(block => `<div class="adaptive-phase">
    <h4>${escapeHtml(block.name)} · ${formatDurationHuman(block.minutes)}</h4>
    <div class="adaptive-rationale">${escapeHtml(block.purpose)}</div>
    ${block.picks.map(p => `<div class="routine-row">
      <div><strong>${escapeHtml(p.routine.name)}</strong>
        <div class="adaptive-rationale">Phase: ${escapeHtml(p.phase)} · Action: ${escapeHtml(adaptiveActionForState(p))}</div>
        <ul class="reason-list">${p.reasons.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</ul>
        ${p.upgrade ? renderTargetUpgradeButton(p.routine.id) : ""}
      </div>
      <span class="badge">Score ${p.adaptiveScore.toFixed(1)}</span>
    </div>`).join("")}
  </div>`).join("");

  $("adaptiveEngineOutput").innerHTML = html || "No routines available.";
}

function loadAdaptiveSessionIntoPlanBuilder() {
  if (!adaptivePlanDraft.length) return alert("Generate an adaptive session first.");
  planDraft = [...anchorRoutines().map(r=>r.id), ...adaptivePlanDraft.filter(id => !anchorRoutines().some(a=>a.id===id))];
  renderPlanBuilder();
  document.querySelector('[data-tab="plans"]').click();
}


function getPersistedActiveSession() {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.routineIds) || Number(s.index || 0) >= s.routineIds.length) return null;
    return s;
  } catch(e) {
    logAppError(e, "getPersistedActiveSession");
    return null;
  }
}
function persistActiveSession() {
  try {
    if (typeof activeSession !== "undefined" && activeSession) {
      safeStorageSet(ACTIVE_SESSION_KEY, JSON.stringify({...activeSession, savedAt:new Date().toISOString()}), "persistActiveSession");
    }
  } catch(e) {
    logAppError(e, "persistActiveSession");
  }
}
function clearPersistedActiveSession() {
  try {
    localStorage.removeItem(ACTIVE_SESSION_KEY);
  } catch(e) {
    logAppError(e, "clearPersistedActiveSession");
  }
}

function renderSmartRecommendation() {
  const box = $("smartRecommendationBox");
  if (!box) return;
  if (!data.logs.length) {
    box.innerHTML = "Start logging exercises. Recommendation will use target hit rate, recent trend, and training allocation.";
    return;
  }
  const byRoutine = {};
  data.logs.forEach(l => {
    byRoutine[l.routineId] ||= [];
    byRoutine[l.routineId].push(l);
  });
  const candidates = Object.entries(byRoutine).map(([rid, logs]) => {
    logs.sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    const vals = logs.map(l=>Number(l.normalizedScore||0));
    const hit = targetHitRate(logs);
    const recent = avg(vals.slice(-3));
    const prior = avg(vals.slice(0,-3));
    const score = (hit === null ? 50 : 100-hit) + (prior && recent < prior ? 20 : 0) + Math.min(20, logs.length);
    return {rid, logs, score, hit, recent, prior};
  }).sort((a,b)=>b.score-a.score);
  const top = candidates[0];
  const routine = top ? routineById(top.rid) : null;
  const recentLogs = data.logs.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,20);
  const alloc = computeAllocation(recentLogs);
  const undertrained = alloc.sort((a,b)=>a.pct-b.pct)[0];
  if (!routine) {
    box.innerHTML = "Not enough routine-level data yet.";
    return;
  }
  box.innerHTML = `<strong>Recommended next focus:</strong> ${escapeHtml(routine.name)}<br>
    <span class="badge">Hit rate: ${top.hit === null ? "N/A" : top.hit.toFixed(1)+"%"}</span>
    <span class="badge">Category: ${escapeHtml(routine.category || "uncategorized")}</span>
    ${undertrained ? `<span class="badge">Undertrained area: ${escapeHtml(undertrained.cat)} (${undertrained.pct.toFixed(1)}%)</span>` : ""}
    <p class="muted">Logic: prioritizes low target hit rate, recent underperformance, and undertrained categories.</p><div class="analytics-note">${escapeHtml(warmupSuggestion())}</div>`;
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

$("statsOverviewBtn").addEventListener("click", () => {
  statsMode = "overview";
  localStorage.setItem("snookerPracticePWA.statsMode", statsMode);
  $("statsOverviewBtn").classList.add("active-subtab");
  $("statsAdvancedBtn").classList.remove("active-subtab");
  renderStats();
});
$("statsAdvancedBtn").addEventListener("click", () => {
  statsMode = "advanced";
  localStorage.setItem("snookerPracticePWA.statsMode", statsMode);
  $("statsAdvancedBtn").classList.add("active-subtab");
  $("statsOverviewBtn").classList.remove("active-subtab");
  renderStats();
});
["compareToggle","compareAStart","compareAEnd","compareBStart","compareBEnd"].forEach(id => {
  const el = $(id);
  if (el) el.addEventListener("change", renderABComparison);
});

$("statsRoutineSelect").addEventListener("change", () => { renderStats(); renderPhaseOneInsights(); });
$("statsDateSelect").addEventListener("change", renderStats);
$("statsPeriodSelect").addEventListener("change", () => { renderStats(); renderPhaseOneInsights(); });
$("rollingWindowInput").addEventListener("input", renderStats);
$("benchmarkWindowInput").addEventListener("input", renderStats);


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
  return {routine:routineById(routineId), logs, series, recent, residualMean, residualStd, signal, action};
}
function renderResidualInsights(logs) {
  const scopedRoutineIds = [...new Set(logs.map(l => l.routineId).filter(Boolean))];
  const insights = scopedRoutineIds.map(rid => routineResidualInsight(rid)).filter(Boolean).sort((a,b)=>Math.abs(b.residualMean)-Math.abs(a.residualMean)).slice(0,5);
  if (!insights.length) return `<div class="insight-card watch"><strong>Expected vs actual</strong><div class="muted">Not enough routine history yet.</div></div>`;
  return `<div class="insight-card ${insights[0].signal==="positive"?"good":insights[0].signal==="negative"?"risk":"watch"}">
    <strong>Expected vs actual residuals ${statHelpButton("residual")}</strong>
    ${insights.map(i => `<div class="context-row"><span>${escapeHtml(i.routine?.name || "Deleted routine")}<br><span class="muted">${escapeHtml(i.action)}</span></span><strong>${i.residualMean>=0?"+":""}${i.residualMean.toFixed(1)}</strong><span>n=${i.logs.length}</span></div>`).join("")}
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
    if (!fallback) return `<div class="insight-card watch"><strong>Peak window</strong><div class="muted">Not enough within-session data yet.</div></div>`;
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
    groups[key] ||= [];
    groups[key].push(l);
  });
  return Object.entries(groups).map(([key, arr]) => {
    const vals = arr.map(l=>Number(l.normalizedScore||0)).filter(v=>Number.isFinite(v));
    if (vals.length < 3) return null;
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
  if (!effects.length) return `<div class="insight-card watch"><strong>Context effects ${statHelpButton("contextEffects")}</strong><div class="muted">Need more logs by table/time/intervention.</div></div>`;
  return `<div class="insight-card ${effects[0].delta<0?"risk":"good"}"><strong>Context effects ${statHelpButton("contextEffects")}</strong>
    ${effects.map(e => `<div class="context-row"><span>${escapeHtml(e.label)}: ${escapeHtml(e.key)}</span><strong>${e.delta>=0?"+":""}${e.delta.toFixed(1)}</strong><span>n=${e.n}</span></div>`).join("")}
    <div class="adaptive-rationale">Shows performance lifters/drags versus your overall average. Minimum threshold is deliberately low for visibility; treat small samples cautiously.</div>
  </div>`;
}

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
      expected:yhat,
      upper:yhat+sd,
      lower:yhat-sd
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
  const rid = $("statsRoutineSelect")?.value || "all";
  const logs = (typeof getScopedStatsLogs !== "undefined" && typeof getScopedStatsLogs === "function") ? getScopedStatsLogs() : ((data.logs || []).filter(l => rid === "all" || l.routineId === rid));
  if (!logs.length) {
    box.innerHTML = `<div class="insight-card watch">No logs available for selected scope.</div>`;
    return;
  }
  box.innerHTML = `<div class="insight-grid">
    ${renderResidualInsights(logs)}
    ${renderPeakWindowInsight(logs)}
    ${renderContextEffects(logs)}\n    ${renderForecastInsight(logs)}
  </div>`;
}


function miniSparkline(values, width=110, height=30) {
  const vals = values.map(v=>Number(v||0)).filter(v=>Number.isFinite(v));
  if (vals.length < 2) return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><text x="2" y="18" font-size="10" fill="#777">not enough data</text></svg>`;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const pts = vals.map((v,i) => {
    const x = vals.length === 1 ? 0 : i * (width/(vals.length-1));
    const y = height - ((v-min)/range)*height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <polyline fill="none" stroke="currentColor" stroke-width="2" points="${pts}"></polyline>
  </svg>`;
}
function renderSwipeableHistoryCards(logs) {
  const sorted = logs.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
  if (!sorted.length) return "";
  return `<div class="swipe-history-wrap">
    <div class="swipe-history-title">Swipeable drill history</div>
    <div class="swipe-history-cards">
      ${sorted.map(l => {
        const rLogs = (data.logs || []).filter(x => x.routineId === l.routineId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).slice(-8);
        const values = rLogs.map(x=>Number(x.normalizedScore||0));
        return `<div class="history-card">
          <div class="history-card-top">
            <div>
              <strong>${escapeHtml(getRoutineName(l))}</strong>
              <div class="muted">${new Date(l.createdAt).toLocaleString()} · ${escapeHtml(l.category || "")}</div>
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
            <button class="secondary" onclick="showEditLog(this)">Edit</button>
            <button class="danger" onclick="deleteLog('${l.id}')">Delete</button>
          </div>
          <div class="hidden log-edit-row history-card-edit-row" data-log-edit-row-id="${escapeAttr(l.id)}">${renderEditLogForm(l)}</div>
        </div>`;
      }).join("")}
    </div>
  </div>`;
}

function renderStats() {
  const period = $("statsPeriodSelect").value || "daily";
  const rid = $("statsRoutineSelect").value;
  const dateKey = $("statsDateSelect").value || localDateKey();
  const range = getPeriodRange(period, dateKey);
  const rollingWindow = Math.max(2, Number($("rollingWindowInput").value || 5));
  const benchmarkWindow = Math.max(3, Number($("benchmarkWindowInput").value || 10));

  let scopedLogs = period === "overall" ? data.logs.slice() : logsInRange(data.logs, range.start, range.end);
  scopedLogs = scopedLogs.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));

  if (statsMode === "overview") {
    $("statsOutput").innerHTML = renderStatsOverview(scopedLogs, rid, period, range, rollingWindow);
    return;
  }

  let html = `<h3>${period === "exercise" ? "Per exercise view" : "Training view"} — ${escapeHtml(range.label)}</h3>`;
  html += renderDateView(scopedLogs);

  if (scopedLogs.length) {
    html += `<h3>Volume chart</h3>${renderVolumeChart(bucketLogs(scopedLogs, period === "overall" ? "monthly" : period), "time", "Training time")}`;
    html += `<h3>Exercise mix</h3>${renderCategoryChart(scopedLogs)}`;
    const alloc = computeAllocation(scopedLogs); html += `<div class="analytics-note"><strong>Allocation:</strong> ${alloc.map(a=>`<span class="badge">${escapeHtml(a.cat)}: ${a.pct.toFixed(1)}%</span>`).join("")}</div>`;
    html += renderAdvancedAnalytics(scopedLogs, rollingWindow, benchmarkWindow);
    html += renderSecondOrderAnalytics(scopedLogs, rid, rollingWindow);
    html += renderPerformanceStability(scopedLogs);
    html += renderFatigueSlope(scopedLogs);
    html += renderDifficultyLadder(scopedLogs);
    html += renderCoachingEngine(scopedLogs);
  }

  if (rid) {
    const exerciseBase = period === "exercise" || period === "overall" ? data.logs : scopedLogs;
    const exerciseLogs = exerciseBase.filter(l => l.routineId === rid).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    html += renderExerciseProgression(exerciseLogs, rollingWindow, benchmarkWindow);
  }

  $("statsOutput").innerHTML = html;
}

function renderStatsOverview(logs, rid, period, range, rollingWindow) {
  if (!logs.length) return `<h3>Overview — ${escapeHtml(range.label)}</h3><p>No logs for this view.</p>`;

  const totalTime = logs.reduce((a,b)=>a+Number(b.timeMinutes||0),0);
  const vals = logs.map(l=>Number(l.normalizedScore||0));
  const hit = targetHitRate(logs);
  const gap = skillGapIndex(logs);
  const weak = weaknessConcentration(logs)[0];
  const fatigue = fatigueCurve(logs);
  const st = streaks(data.logs);

  let html = `<h3>Overview — ${escapeHtml(range.label)}</h3>
    <div class="overview-grid">
      <div class="overview-card"><span>Total practice</span><div class="big">${formatDurationHuman(totalTime)}</div></div>
      <div class="overview-card"><span>Exercises ${statHelpButton("exercisesCompleted")}</span><div class="big">${logs.length}</div></div>
      <div class="overview-card"><span>Target hit rate ${statHelpButton("targetHitRate")}</span><div class="big">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div>
      <div class="overview-card"><span>Momentum</span><div class="big">${escapeHtml(movingTrend(vals, rollingWindow))}</div></div>
      <div class="overview-card"><span>Skill gap</span><div class="big">${gap === null ? "N/A" : gap.toFixed(2)}</div></div>
      <div class="overview-card"><span>Streak</span><div class="big">${st.current}d</div></div>
    </div>`;

  renderTableStats(logs);
  html += renderCoachingEngine(logs);
  html += renderPerformanceStability(logs);
  html += renderFatigueSlope(logs);
  html += renderDifficultyLadder(logs);
  html += renderSecondOrderAnalytics(logs, rid, rollingWindow);

  if (weak) {
    html += `<div class="analytics-note"><strong>Weakest area:</strong> ${escapeHtml(weak.category)} · hit rate ${weak.hitRate === null ? "N/A" : weak.hitRate.toFixed(1)+"%"} · vs overall ${weak.delta === null ? "N/A" : weak.delta.toFixed(1)+" pts"}</div>`;
  }
  if (fatigue) {
    html += `<div class="analytics-note"><strong>Fatigue curve:</strong> first-third avg ${fatigue.first.toFixed(2)} vs final-third avg ${fatigue.last.toFixed(2)} (${fatigue.deltaPct >= 0 ? "+" : ""}${fatigue.deltaPct.toFixed(1)}%).</div>`;
  }

  html += `<h3>Compact charts</h3>${renderCategoryChart(logs)}${renderVolumeChart(bucketLogs(logs, period === "overall" ? "monthly" : period), "time", "Training time")}`;

  if (rid) {
    const exerciseLogs = logs.filter(l => l.routineId === rid).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
    if (exerciseLogs.length) html += renderExerciseProgression(exerciseLogs, rollingWindow, Number($("benchmarkWindowInput").value || 10));
  }

  return html;
}

function skillGapIndex(logs) {
  if (logs.length < 2) return null;
  const vals = logs.map(l=>Number(l.normalizedScore||0));
  return Math.max(...vals) - avg(vals);
}

function weaknessConcentration(logs) {
  const overall = targetHitRate(logs);
  const groups = {};
  logs.forEach(l => {
    const k = l.category || "uncategorized";
    groups[k] ||= [];
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
  const deltaPct = first ? ((last-first)/Math.abs(first))*100 : 0;
  return {first,last,deltaPct};
}

function renderCoachingEngine(logs) {
  if (!logs.length) return "";
  const vals = logs.map(l=>Number(l.normalizedScore||0));
  const hit = targetHitRate(logs);
  const gap = skillGapIndex(logs);
  const weak = weaknessConcentration(logs)[0];
  const fatigue = fatigueCurve(logs);
  const insights = [];

  if (weak && weak.hitRate !== null) {
    insights.push({
      title: `Prioritize ${weak.category}`,
      text: `This category has the weakest hit rate (${weak.hitRate.toFixed(1)}%). Allocate more volume here in the next session.`
    });
  }

  if (gap !== null) {
    if (gap > avg(vals) * 0.35) {
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

  const ladder = difficultyLadderRecommendation(logs);
  if (ladder && ladder.type !== "maintain") insights.push({title:"Difficulty ladder", text: ladder.text});

  if (!insights.length) {
    insights.push({title:"Maintain current structure", text:"No strong bottleneck detected. Continue logging to improve signal quality."});
  }

  return `<div class="coaching-box"><h3>Coaching insights</h3>${insights.slice(0,4).map(i=>`<div class="insight"><strong>${escapeHtml(i.title)}</strong>${escapeHtml(i.text)}</div>`).join("")}</div>`;
}


function performanceDrift(logs, windowSize=10) {
  const vals = logs.map(l=>Number(l.normalizedScore||0));
  if (vals.length < windowSize * 2) return null;
  const recent = avg(vals.slice(-windowSize));
  const prior = avg(vals.slice(-(windowSize*2), -windowSize));
  if (!prior) return null;
  const deltaPct = ((recent-prior)/Math.abs(prior))*100;
  return {recent, prior, deltaPct};
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
    sessionGroups[sid] ||= [];
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
  const candidates = {};
  allLogs.forEach(l => {
    if (l.routineId !== targetRid && l.category && l.category !== targetCategory) {
      const day = localDateKey(l.createdAt);
      candidates[l.category] ||= {};
      candidates[l.category][day] ||= [];
      candidates[l.category][day].push(Number(l.normalizedScore||0));
    }
  });
  const targetByDay = {};
  targetLogs.forEach(l => {
    const day = localDateKey(l.createdAt);
    targetByDay[day] ||= [];
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

function progressVelocity(logs, windowSize=10) {
  const vals = logs.map(l=>Number(l.normalizedScore||0));
  if (vals.length < 3) return null;
  const use = vals.slice(-windowSize);
  const n = use.length;
  const xs = use.map((_,i)=>i+1);
  const mx = avg(xs), my = avg(use);
  const num = xs.reduce((a,x,i)=>a+(x-mx)*(use[i]-my),0);
  const den = xs.reduce((a,x)=>a+Math.pow(x-mx,2),0);
  const slope = den ? num/den : 0;
  return {slope, n, label: slope>0.5?"Improving":slope<-0.5?"Declining":"Flat"};
}

function plateauDetector(logs, windowSize=8, thresholdPct=3) {
  const vals = logs.map(l=>Number(l.normalizedScore||0));
  if (vals.length < windowSize*2) return null;
  const recent = avg(vals.slice(-windowSize));
  const prior = avg(vals.slice(-(windowSize*2), -windowSize));
  if (!prior) return null;
  const deltaPct = ((recent-prior)/Math.abs(prior))*100;
  return {isPlateau: Math.abs(deltaPct) < thresholdPct, deltaPct, recent, prior};
}

function overtrainingSignal(logs, windowSize=8) {
  if (logs.length < windowSize*2) return null;
  const recent = logs.slice(-windowSize);
  const prior = logs.slice(-(windowSize*2), -windowSize);
  const recentTime = recent.reduce((a,b)=>a+Number(b.timeMinutes||0),0);
  const priorTime = prior.reduce((a,b)=>a+Number(b.timeMinutes||0),0);
  const recentPerf = avg(recent.map(l=>Number(l.normalizedScore||0)));
  const priorPerf = avg(prior.map(l=>Number(l.normalizedScore||0)));
  if (!priorTime || !priorPerf) return null;
  const volumeDelta = ((recentTime-priorTime)/Math.abs(priorTime))*100;
  const perfDelta = ((recentPerf-priorPerf)/Math.abs(priorPerf))*100;
  return {volumeDelta, perfDelta, signal: volumeDelta > 20 && perfDelta < 3 ? "Risk" : "Normal"};
}


function performanceStabilityIndex(logs, windowSize=10) {
  const vals = logs.map(l=>Number(l.normalizedScore||0)).filter(v=>Number.isFinite(v));
  if (vals.length < 3) return null;
  const recent = vals.slice(-windowSize);
  const mean = avg(recent);
  const cv = mean ? stdDev(recent) / Math.abs(mean) : 0;
  const hitSeries = logs.slice(-windowSize).map(l => {
    const p = l.performance || "N/A";
    return (p === "On Target" || p === "Above Target") ? 1 : 0;
  });
  const hitVol = hitSeries.length > 1 ? stdDev(hitSeries) : 0;
  const psi = Math.max(0, 100 - (cv*65 + hitVol*35));
  let label = "Stable";
  if (psi < 45) label = "Unstable";
  else if (psi < 70) label = "Watch";
  return {psi, cv, hitVol, label, mean, n: recent.length};
}

function renderPerformanceStability(logs) {
  const psi = performanceStabilityIndex(logs, 10);
  if (!psi) return `<div class="psi-card psi-watch"><strong>Performance Stability Index ${statHelpButton("psi")}</strong><br>Not enough data yet.</div>`;
  const cls = psi.psi >= 70 ? "psi-good" : psi.psi >= 45 ? "psi-watch" : "psi-risk";
  return `<div class="psi-card ${cls}">
    <strong>Performance Stability Index ${statHelpButton("psi")}: ${psi.psi.toFixed(0)}/100 — ${escapeHtml(psi.label)}</strong><br>
    <span class="muted">CV ${(psi.cv*100).toFixed(1)}% · hit-rate volatility ${(psi.hitVol*100).toFixed(1)}% · ${psi.n} recent logs.</span>
  </div>`;
}

function fatigueSlope(logs) {
  if (!logs.length) return null;
  let cumulative = 0;
  const xs = [], ys = [];
  logs.slice().sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)).forEach(l => {
    cumulative += Number(l.timeMinutes || 0);
    xs.push(cumulative);
    ys.push(Number(l.normalizedScore || 0));
  });
  if (xs.length < 3) return null;
  const mx = avg(xs), my = avg(ys);
  const num = xs.reduce((a,x,i)=>a+(x-mx)*(ys[i]-my),0);
  const den = xs.reduce((a,x)=>a+Math.pow(x-mx,2),0);
  const slope = den ? num/den : 0;
  const corr = correlation(xs, ys);
  return {slope, corr, n: xs.length};
}

function renderFatigueSlope(logs) {
  const f = fatigueSlope(logs);
  if (!f) return `<div class="psi-card psi-watch"><strong>Fatigue slope ${statHelpButton("fatigueSlope")}</strong><br>Not enough data yet.</div>`;
  const cls = f.slope < -0.25 ? "psi-risk" : f.slope > 0.25 ? "psi-good" : "psi-watch";
  const direction = f.slope < -0.25 ? "fatigue drag" : f.slope > 0.25 ? "slow-start / improves later" : "flat";
  return `<div class="psi-card ${cls}">
    <strong>Fatigue slope ${statHelpButton("fatigueSlope")}: ${f.slope.toFixed(2)} pts/min — ${direction}</strong><br>
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
    return {type:"stabilize", text:"Stabilize before raising target: performance is volatile. Repeat the same setup until PSI improves."};
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

function dateFromKey(key) {
  return new Date(key + "T00:00:00");
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
    best: vals.length ? Math.max(...vals) : null
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
      <tr><td>PSI ${statHelpButton("psi")}</td><td>${A.psi===null?"N/A":A.psi.toFixed(0)}</td><td>${B.psi===null?"N/A":B.psi.toFixed(0)}</td><td>${deltaFmt(A.psi,B.psi)}</td></tr>
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
  if (drift) cards.push({cls: drift.deltaPct < -7 ? "signal-risk" : drift.deltaPct > 7 ? "signal-good" : "signal-watch", title:"Performance drift", text:`Recent ${drift.recent.toFixed(2)} vs prior ${drift.prior.toFixed(2)} (${drift.deltaPct>=0?"+":""}${drift.deltaPct.toFixed(1)}%).`});
  if (quality) cards.push({cls: quality.deltaPct > 10 ? "signal-good" : "signal-watch", title:"Session quality impact", text:`High-rated sessions average ${quality.highAvg.toFixed(2)} vs low-rated ${quality.lowAvg.toFixed(2)} (${quality.deltaPct>=0?"+":""}${quality.deltaPct.toFixed(1)}%).`});
  if (optimal) cards.push({cls:"signal-watch", title:"Optimal session length", text:`Best band: ${optimal.best.label} (${optimal.best.avgPerf.toFixed(2)} avg). Time/performance correlation: ${corrText(optimal.corr)}.`});
  if (velocity) cards.push({cls: velocity.slope > .5 ? "signal-good" : velocity.slope < -.5 ? "signal-risk" : "signal-watch", title:"Progress velocity", text:`Slope over last ${velocity.n}: ${velocity.slope.toFixed(2)} per log (${velocity.label}).`});
  if (plateau) cards.push({cls: plateau.isPlateau ? "signal-risk" : "signal-watch", title:"Plateau detector", text: plateau.isPlateau ? `Plateau detected: only ${plateau.deltaPct.toFixed(1)}% change.` : `No plateau: ${plateau.deltaPct>=0?"+":""}${plateau.deltaPct.toFixed(1)}% change.`});
  if (overtraining) cards.push({cls: overtraining.signal==="Risk" ? "signal-risk" : "signal-good", title:"Overtraining signal", text:`Volume ${overtraining.volumeDelta>=0?"+":""}${overtraining.volumeDelta.toFixed(1)}%, performance ${overtraining.perfDelta>=0?"+":""}${overtraining.perfDelta.toFixed(1)}% → ${overtraining.signal}.`});
  if (transfer) cards.push({cls: transfer.corr > .35 ? "signal-good" : transfer.corr < -.35 ? "signal-risk" : "signal-watch", title:"Exercise transfer effect", text:`Previous-day ${transfer.category} vs selected exercise: ${corrText(transfer.corr)} over ${transfer.n} paired days.`});

  if (!cards.length) return `<h3>Second-order analytics ${statHelpButton("performanceDrift")}</h3><p class="muted">More logs are needed for drift, quality impact, optimal session length, transfer, plateau, and overtraining diagnostics.</p>`;
  return `<h3>Second-order analytics ${statHelpButton("performanceDrift")}</h3><div class="diagnostic-grid">${cards.map(c=>`<div class="diagnostic-card ${c.cls}"><strong>${escapeHtml(c.title)}</strong>${escapeHtml(c.text)}</div>`).join("")}</div>`;
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
  const groups = {};
  logs.forEach(l => {
    const label = getTargetProfileLabel(l);
    groups[label] ||= [];
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
  const st = streaks(data.logs);
  const corrTime = correlation(durations, vals);
  const corrRating = correlation(ratings, vals);

  return `<h3>Advanced analytics</h3>
    <div class="stats-grid">
      <div class="stat-card"><span>Momentum</span><div class="value">${escapeHtml(movingTrend(vals, rollingWindow))}</div></div>
      <div class="stat-card"><span>Hit rate at-time target ${statHelpButton("targetHitRate")}</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div><div class="stat-card"><span>Hit rate current target</span><div class="value">${targetHitRateCurrentTarget(logs) === null ? "N/A" : targetHitRateCurrentTarget(logs).toFixed(1)+"%"}</div></div>
      <div class="stat-card"><span>Current streak</span><div class="value">${st.current}d</div></div>
      <div class="stat-card"><span>Best streak</span><div class="value">${st.best}d</div></div>
      <div class="stat-card"><span>Duration correlation</span><div class="value">${escapeHtml(corrText(corrTime))}</div></div>
      <div class="stat-card"><span>Rating correlation</span><div class="value">${escapeHtml(corrText(corrRating))}</div></div>
    </div>
    <div class="analytics-note"><strong>Personal benchmark:</strong> ${escapeHtml(benchmarkText(vals, benchmarkWindow))}</div>`;
}
function renderExerciseProgression(logs, rollingWindow=5, benchmarkWindow=10) {
  if (!logs.length) return `<h3>Routine progression</h3><p>No logs for this exercise in the selected view.</p>`;
  const vals = logs.map(l => Number(l.normalizedScore || 0));
  const last5 = vals.slice(-5);
  const best = Math.max(...vals);
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
    <div class="stat-card"><span>Consistency</span><div class="value">${stdDev(vals).toFixed(2)}</div></div>
    <div class="stat-card"><span>Ceiling gap</span><div class="value">${ceilingGap.toFixed(2)}</div></div>
    <div class="stat-card"><span>Target hit rate ${statHelpButton("targetHitRate")}</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div>
  </div>
  <div class="trend">${escapeHtml(movingTrend(vals, rollingWindow))}</div>
  <div class="analytics-note"><strong>Benchmark:</strong> ${escapeHtml(benchmarkText(vals, benchmarkWindow))}<br><strong>Progression suggestion:</strong> ${escapeHtml(suggestion)}</div>
  ${renderTargetUpgradeButton(logs[0]?.routineId)}${renderChart(logs)}
  ${renderRollingChart(logs, rolling)}
  <table class="history-table"><thead><tr><th>Date</th><th>Score</th><th>Normalized</th><th>Performance</th><th>Target version</th><th>Time</th><th>Actions</th></tr></thead><tbody>${logs.slice(-20).reverse().map(l => renderLogRow(l)).join("")}</tbody></table>`;
}
function renderLogRow(l) {
  return `<tr data-log-row-id="${escapeAttr(l.id)}">
    <td>${new Date(l.createdAt).toLocaleDateString()}</td>
    <td>${displayScore(l)}</td>
    <td>${Number(l.normalizedScore || 0).toFixed(2)}</td>
    <td>${escapeHtml(l.performance || "N/A")}</td>
    <td>${escapeHtml(getTargetProfileLabel(l))}</td>
    <td>${formatDurationHuman(l.timeMinutes)}</td>
    <td><button class="secondary" onclick="showEditLog(this)">Edit</button> <button class="danger" onclick="deleteLog('${l.id}')">Delete</button></td>
  </tr><tr class="hidden log-edit-row" data-log-edit-row-id="${escapeAttr(l.id)}"><td colspan="7">${renderEditLogForm(l)}</td></tr>`;
}
function renderDateLogRow(l) {
  return `<tr data-log-row-id="${escapeAttr(l.id)}"><td>${new Date(l.createdAt).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</td><td>${escapeHtml(getPlanName(l))}</td><td>${escapeHtml(getRoutineName(l))}</td><td>${escapeHtml(l.category || "")}</td><td>${displayScore(l)}</td><td>${escapeHtml(l.performance || "N/A")}</td><td>${escapeHtml(getTargetProfileLabel(l))}</td><td>${formatDurationHuman(l.timeMinutes)}</td><td><button class="secondary" onclick="showEditLog(this)">Edit</button> <button class="danger" onclick="deleteLog('${l.id}')">Delete</button></td></tr><tr class="hidden log-edit-row" data-log-edit-row-id="${escapeAttr(l.id)}"><td colspan="9">${renderEditLogForm(l)}</td></tr>`;
}
function renderSessionLogRow(l) {
  return `<tr data-log-row-id="${escapeAttr(l.id)}"><td>${escapeHtml(getRoutineName(l))}</td><td>${escapeHtml(l.category || "")}</td><td>${displayScore(l)}</td><td>${escapeHtml(l.performance || "N/A")}</td><td>${escapeHtml(getTargetProfileLabel(l))}</td><td>${formatDurationHuman(l.timeMinutes)}</td><td><button class="secondary" onclick="showEditLog(this)">Edit</button> <button class="danger" onclick="deleteLog('${l.id}')">Delete</button></td></tr><tr class="hidden log-edit-row" data-log-edit-row-id="${escapeAttr(l.id)}"><td colspan="7">${renderEditLogForm(l)}</td></tr>`;
}
function renderEditLogForm(l) {
  return `<div class="log-edit" data-log-edit-id="${escapeAttr(l.id)}">
    <div class="log-edit-grid">
      <div><label>Date/time</label><input class="edit-createdAt" type="datetime-local" value="${toDateTimeLocal(l.createdAt)}"></div>
      <div><label>Score</label><input class="edit-score" type="number" step="0.01" value="${l.score}"></div>
      <div><label>Attempts</label><input class="edit-attempts" type="number" step="1" value="${l.attempts || ""}"></div>
      <div><label>Time minutes</label><input class="edit-time" type="number" step="0.1" value="${l.timeMinutes || ""}"></div><div><label>Venue / table</label><select class="edit-venue">${renderEditTableOptions(l.tableId, l.venueTable)}</select></div>${l.scoring === "progressive_completion" ? `<div><label>Best attempt</label><input class="edit-best" type="number" step="0.01" value="${l.bestAttempt || ""}"></div><div><label>Completions</label><input class="edit-completions" type="number" step="1" value="${l.completionCount || ""}"></div><div><label>Highest break</label><input class="edit-break" type="number" step="1" value="${l.highestBreak || ""}"></div>` : ""}
      <div><label>Rating</label><input class="edit-rating" type="number" min="1" max="5" step="1" value="${l.sessionRating || ""}"></div>
      <div><label>Category</label><select class="edit-category">${editCategoryOptions(l.category)}</select></div>
      <div><label>Tags</label><input class="edit-tags" value="${escapeAttr(l.sessionTags || "")}"></div>
    </div>
    <label>Notes</label><textarea class="edit-notes" rows="2">${escapeHtml(l.notes || "")}</textarea>
    <div class="small-actions"><button onclick="saveEditedLogFromButton(this,'${l.id}')">Save changes</button><button class="secondary" onclick="showEditLog(this)">Cancel</button></div>
  </div>`;
}
function toDateTimeLocal(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function showEditLog(source) {
  if (typeof source === "string") {
    const rows = Array.from(document.querySelectorAll(`[data-log-edit-row-id="${cssEscapeSafe(source)}"]`));
    const visible = rows.find(r => r.offsetParent !== null) || rows[0];
    if (visible) visible.classList.toggle("hidden");
    return;
  }
  const row = source?.closest?.("tr");
  const card = source?.closest?.(".history-card");
  const editRow = row?.nextElementSibling?.classList?.contains("log-edit-row")
    ? row.nextElementSibling
    : (source?.closest?.(".log-edit-row") || card?.querySelector?.(":scope > .log-edit-row"));
  if (editRow) editRow.classList.toggle("hidden");
}
function saveEditedLogFromButton(button, id) {
  const form = button?.closest?.(".log-edit");
  saveEditedLog(id, form);
}
function saveEditedLog(id, formEl) {
  const idx = data.logs.findIndex(l => l.id === id);
  if (idx < 0) return;
  const l = data.logs[idx];
  const routine = routineById(l.routineId) || makeRoutineSnapshotFromLog(l);
  const form = formEl || document.querySelector(`.log-edit[data-log-edit-id="${cssEscapeSafe(id)}"]`);
  if (!form) return alert("Edit form not found.");
  const field = cls => form.querySelector(`.${cls}`);
  const editedDate = new Date(field("edit-createdAt")?.value || l.createdAt);
  if (Number.isNaN(editedDate.getTime())) return alert("Invalid date/time.");
  l.createdAt = editedDate.toISOString();
  l.score = Number(field("edit-score")?.value || 0);
  l.attempts = Number(field("edit-attempts")?.value || 0) || "";
  l.timeMinutes = Number(field("edit-time")?.value || 0);
  l.sessionRating = Number(field("edit-rating")?.value || 0) || "";
  l.category = field("edit-category")?.value || l.category || "uncategorized";
  l.sessionTags = field("edit-tags")?.value || "";
  if (field("edit-best")) l.bestAttempt = Number(field("edit-best").value || 0) || "";
  if (field("edit-completions")) l.completionCount = Number(field("edit-completions").value || 0) || "";
  if (field("edit-break")) l.highestBreak = Number(field("edit-break").value || 0) || "";
  updateTagHistoryFromInput(l.sessionTags);
  l.notes = field("edit-notes")?.value || "";
  const venue = field("edit-venue");
  if (venue) {
    l.tableId = venue.value || "";
    l.venueTable = getTableName(l.tableId);
    l.venueTableSnapshot = getTableName(l.tableId);
  }
  l.normalizedScore = normalizeScore(l);
  l.performance = classifyPerformance(l, routine);
  data.logs[idx] = l;
  saveData({render:"logEdit"});
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
    category: l.category || "uncategorized",
    folder: l.folder || "Unfiled",
    subfolder: l.subfolder || "General"
  };
}
function deleteLog(id) {
  return confirmDeleteAction("this session log", () => {
    data.logs = data.logs.filter(l => l.id !== id);
    saveData({render:"logEdit"});
  });
}

function renderDateView(logs) {
  if (!logs.length) return "<p>No exercises logged for this view.</p>";
  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  const types = {};
  logs.forEach(l => { types[l.category || "uncategorized"] = (types[l.category || "uncategorized"] || 0) + 1; });
  const hit = targetHitRate(logs);
  return `<div class="stats-grid">
    <div class="stat-card"><span>Exercises ${statHelpButton("exercisesCompleted")}</span><div class="value">${logs.length}</div></div>
    <div class="stat-card"><span>Total time ${statHelpButton("totalTrainingTime")}</span><div class="value">${formatDurationHuman(totalTime)}</div></div>
    <div class="stat-card"><span>Target hit rate ${statHelpButton("targetHitRate")}</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div>
  </div><p>${Object.entries(types).map(([k,v]) => `<span class="badge">${escapeHtml(k)}: ${v}</span>`).join("")}</p>
  ${progressiveStatsForLogs(logs) ? `<div class="analytics-note"><strong>Progressive completion:</strong><span class="pc-kpi">Avg completion ${progressiveStatsForLogs(logs).avgCompletion.toFixed(1)}%</span><span class="pc-kpi">Best attempt ${progressiveStatsForLogs(logs).bestAttempt}</span><span class="pc-kpi">Completions ${progressiveStatsForLogs(logs).completionCount}</span><span class="pc-kpi">Highest break ${progressiveStatsForLogs(logs).highestBreak || "N/A"}</span></div>` : ""}
  ${renderTargetProfileSummary(logs)}
  <table class="history-table"><thead><tr><th>Time</th><th>Session</th><th>Exercise</th><th>Type</th><th>Score</th><th>Performance</th><th>Target version</th><th>Duration</th><th>Actions</th></tr></thead><tbody>${logs.map(l => renderDateLogRow(l)).join("")}</tbody></table>`;
}
function renderToday() {
  const today = localDateKey();
  const logs = data.logs.filter(l => sameDate(l, today)).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!logs.length) { $("todaySummary").innerHTML = "<p>No training logged today yet.</p>"; return; }

  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  const byType = {}, bySession = {};
  logs.forEach(l => {
    byType[l.category || "uncategorized"] = (byType[l.category || "uncategorized"] || 0) + 1;
    bySession[l.sessionId] ||= {name: getPlanName(l), type: l.sessionType || "", logs: []};
    bySession[l.sessionId].logs.push(l);
  });
  const hit = targetHitRate(logs);

  $("todaySummary").innerHTML = `<div class="stats-grid">
    <div class="stat-card"><span>Exercises ${statHelpButton("exercisesCompleted")}</span><div class="value">${logs.length}</div></div>
    <div class="stat-card"><span>Total time ${statHelpButton("totalTrainingTime")}</span><div class="value">${formatDurationHuman(totalTime)}</div></div>
    <div class="stat-card"><span>Target hit rate ${statHelpButton("targetHitRate")}</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div>
  </div><p>${Object.entries(byType).map(([k,v]) => `<span class="badge">${escapeHtml(k)}: ${v}</span>`).join("")}</p>
  <h3>Today’s exercise mix</h3>${renderCategoryChart(logs)}
  ${Object.values(bySession).map(s => {
    const st = s.logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
    return `<div class="item"><div class="item-title"><strong>${escapeHtml(s.name)}</strong><span class="badge">${s.logs.length} exercises · ${st.toFixed(1)}m</span></div><table class="history-table today-table"><thead><tr><th>Exercise</th><th>Type</th><th>Score</th><th>Performance</th><th>Target version</th><th>Time</th><th>Actions</th></tr></thead><tbody>${s.logs.map(l => renderSessionLogRow(l)).join("")}</tbody></table></div>`;
  }).join("")}`;
}

function renderVolumeChart(buckets, metric, title) {
  if (!buckets.length) return `<div class="chart-wrap"><p class="muted">No data for chart.</p></div>`;
  const w=520,h=160,padL=34,padR=12,padT=12,padB=34;
  const values = buckets.map(b => metric === "count" ? b.count : b.time);
  const maxV = Math.max(...values, 1);
  const barW = Math.max(8, (w-padL-padR) / buckets.length * 0.65);
  const step = (w-padL-padR) / buckets.length;
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    <line class="chart-axis" x1="${padL}" x2="${padL}" y1="${padT}" y2="${h-padB}"></line>
    <line class="chart-axis" x1="${padL}" x2="${w-padR}" y1="${h-padB}" y2="${h-padB}"></line>
    ${buckets.map((b,i) => {
      const v = metric === "count" ? b.count : b.time;
      const bh = (v / maxV) * (h-padT-padB);
      const x = padL + i*step + (step-barW)/2;
      const y = h-padB-bh;
      return `<rect class="chart-bar" x="${x}" y="${y}" width="${barW}" height="${bh}"><title>${b.label}: ${Number(v).toFixed(1)}</title></rect>`;
    }).join("")}
    ${buckets.filter((_,i)=> i===0 || i===buckets.length-1 || i===Math.floor((buckets.length-1)/2)).map(b => {
      const idx = buckets.indexOf(b); const x = padL + idx*step + step/2 - 22;
      return `<text class="chart-label" x="${x}" y="${h-18}">${escapeHtml(b.label.slice(-10))}</text>`;
    }).join("")}
    <text class="chart-label" x="5" y="18">${escapeHtml(title)}</text>
  </svg></div>`;
}
function renderCategoryChart(logs) {
  if (!logs.length) return `<div class="chart-wrap"><p class="muted">No data for chart.</p></div>`;
  const grouped = {};
  logs.forEach(l => {
    const k = l.category || "uncategorized";
    grouped[k] ||= {label:k, count:0, time:0};
    grouped[k].count += 1;
    grouped[k].time += Number(l.timeMinutes || 0);
  });
  const buckets = Object.values(grouped).sort((a,b)=>b.time-a.time);
  const w=520,h=160,padL=90,padR=12,padT=12,padB=20;
  const maxV = Math.max(...buckets.map(b=>b.time), 1);
  const rowH = Math.max(22, Math.min(38, (h-padT-padB)/Math.max(1,buckets.length)));
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
    ${buckets.map((b,i) => {
      const y = padT + i*rowH;
      const bw = (b.time / maxV) * (w-padL-padR);
      return `<text class="chart-label" x="5" y="${y+15}">${escapeHtml(b.label.slice(0,16))}</text><rect class="chart-bar-alt" x="${padL}" y="${y}" width="${bw}" height="${rowH*0.65}"><title>${b.label}: ${b.time.toFixed(1)} min, ${b.count} exercises</title></rect><text class="chart-label" x="${padL+bw+5}" y="${y+15}">${b.time.toFixed(1)}m</text>`;
    }).join("")}
  </svg></div>`;
}
function renderChart(logs) {
  if (logs.length < 2) return `<div class="chart-wrap"><p class="muted">Add at least two logs to display a progression curve.</p></div>`;
  const points = logs.map((l,i) => ({i, y: Number(l.normalizedScore || 0), label: localDateKey(l.createdAt)}));
  const w=520,h=160,padL=34,padR=12,padT=12,padB=30;
  const minY=Math.min(...points.map(p=>p.y)), maxY=Math.max(...points.map(p=>p.y)), yRange=maxY===minY?1:maxY-minY;
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


function exportValue(log, field) {
  if (field === "currentRoutineName") return getRoutineName(log);
  if (field === "currentPlanName") return getPlanName(log);
  if (field === "sessionName") return getPlanName(log);
  if (field === "routineName") return getRoutineName(log);
  if (field === "currentTargetPerformance") return currentTargetPerformance(log);
  return log[field] ?? "";
}

$("exportCsvBtn").addEventListener("click", async () => {
  const headers = ["createdAt","sessionName","currentPlanName","planNameSnapshot","sessionType","routineName","currentRoutineName","routineNameSnapshot","routineId","folder","subfolder","category","scoring","score","attempts","timeMinutes","normalizedScore","performance","sessionRating","sessionTags","bestAttempt","completionCount","highestBreak","totalUnits","unitType","targetMode","targetColour","targetProfileId","targetAtLog","stretchTargetAtLog","difficultyLabelAtLog","currentTargetPerformance","notes"];
  const rows = [headers.join(",")].concat(data.logs.map(l => headers.map(h => csvEscape(exportValue(l, h))).join(",")));
  downloadFile("snooker-practice-logs.csv", rows.join("\n"), "text/csv");
});
$("exportJsonBtn").addEventListener("click", async () => { markBackupExported(); await exportFile(`snooker-practice-backup-${APP_VERSION}-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({...data, backupVersion: APP_VERSION, exportedAt: new Date().toISOString()}, null, 2), "application/json"); renderBackupReminder(); });
$("runRegretBtn").addEventListener("click", runRegretComparison);
["periodizationPhase","periodizationHorizon","competitionDate"].forEach(id => { const el=$(id); if(el) el.addEventListener("change", renderPeriodization); });
$("generateAdaptiveSessionBtn").addEventListener("click", renderAdaptiveSession);
$("loadAdaptiveSessionBtn").addEventListener("click", loadAdaptiveSessionIntoPlanBuilder);
$("saveTableBtn").addEventListener("click", saveTableDefinition);
$("clearTableFormBtn").addEventListener("click", clearTableForm);
$("chooseExportFolderBtn").addEventListener("click", chooseExportFolder);
$("clearExportFolderBtn").addEventListener("click", clearExportFolder);
$("exportDebugBtn").addEventListener("click", exportDebugInfo);
$("exportRawStorageBtn").addEventListener("click", exportRawLocalData);
$("importJsonInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const imported = migrateData(JSON.parse(await file.text()));
  if (!imported.routines || !imported.plans || !imported.logs) return alert("Invalid backup file.");
  data = imported;
  saveData();
  alert("Backup imported.");
});
$("clearDataBtn").addEventListener("click", () => {
  if (!confirm("Clear all data? This cannot be undone unless you have exported a backup.")) return;
  localStorage.removeItem(STORAGE_KEY);
  data = loadData();
  renderAll();
});
function downloadFile(filename, content, type) {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function csvEscape(value) {
  const s = String(value ?? "");
  return '"' + s.replace(/"/g, '""') + '"';
}
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[ch]));
}
function escapeAttr(str) { return escapeHtml(str).replaceAll("`","&#096;"); }


function confirmDeleteAction(label, callback) {
  const msg = `Delete ${label}? This cannot be undone unless you have a JSON backup.`;
  if (confirm(msg)) callback();
}
function updateTagHistoryFromInput(raw) {
  data.tagHistory = data.tagHistory || [];
  String(raw || "").split(",").map(t => t.trim()).filter(Boolean).forEach(t => {
    if (!data.tagHistory.includes(t)) data.tagHistory.push(t);
  });
  data.tagHistory.sort();
}
function renderTagSuggestions() {
  const dl = $("tagSuggestions");
  if (!dl) return;
  dl.innerHTML = (data.tagHistory || []).map(t => `<option value="${escapeAttr(t)}"></option>`).join("");
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
  const bestAttempt = Math.max(...pc.map(l => Number(l.bestAttempt || l.score || 0)));
  const completionCount = pc.filter(l => Number(l.completionCount || 0) > 0 || Number(l.normalizedScore || 0) >= 100).length;
  const highestBreak = Math.max(0, ...pc.map(l => Number(l.highestBreak || 0)));
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
  if (stretch && s >= stretch) return "Above Target";
  if (s >= target) return "On Target";
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
  if (!data) return;
  data.logs = (data.logs || []).map(enrichLogReferences);
  data.sessions = (data.sessions || []).map(s => {
    const p = planById(s.planId);
    if (p) {
      s.planNameSnapshot = s.planNameSnapshot || s.name || p.name;
      s.name = p.name;
    }
    return s;
  });
}


function logAppError(error, context="runtime") {
  try {
    const errors = JSON.parse(localStorage.getItem("snookerPracticePWA.errorLog") || "[]");
    errors.unshift({
      at: new Date().toISOString(),
      context,
      message: error?.message || String(error),
      stack: error?.stack || ""
    });
    localStorage.setItem("snookerPracticePWA.errorLog", JSON.stringify(errors.slice(0,10)));
  } catch(e) {}
}
window.addEventListener("error", e => logAppError(e.error || e.message, "window.error"));
window.addEventListener("unhandledrejection", e => logAppError(e.reason || "Unhandled promise rejection", "unhandledrejection"));


function safeStorageSet(key, value, context="safeStorageSet") {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch(e) {
    logAppError(e, context);
    if (e && (e.name === "QuotaExceededError" || String(e.message || "").toLowerCase().includes("quota"))) {
      alert("Storage appears full. Export JSON Backup and Raw Local Data before continuing.");
    } else {
      alert("Could not save local data. Export a backup/debug file before continuing.");
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
    el.innerHTML = `Backup reminder: you have not exported a JSON backup ${Number.isFinite(days) ? "in "+days+" days" : "yet"}. <button class="secondary" onclick="document.querySelector('[data-tab=&quot;data&quot;]').click()">Go to Data</button>`;
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
    userAgent: navigator.userAgent,
    location: location.href,
    counts: {
      routines: (data.routines || []).length,
      plans: (data.plans || []).length,
      sessions: (data.sessions || []).length,
      logs: (data.logs || []).length
    },
    errors: JSON.parse(localStorage.getItem("snookerPracticePWA.errorLog") || "[]"),
    lastBackupAt: localStorage.getItem("snookerPracticePWA.lastBackupAt") || ""
  };
  await exportFile(`snooker-debug-${APP_VERSION}-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload,null,2), "application/json");
}

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


FIELD_HELP.psi = {title:"Performance Stability Index (PSI)",body:`<p><strong>What it means:</strong> a 0-100 stability score combining score variability and hit-rate volatility.</p>`};
FIELD_HELP.fatigueSlope = {title:"Fatigue slope",body:`<p><strong>What it means:</strong> the relationship between accumulated session time and performance.</p>`};
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
  psi: {title:"Performance Stability Index (PSI)", body: analyticsHelp("PSI","Consistency of performance.","Combines score variability and hit-rate volatility into a 0–100 stability index.","High PSI = reliable execution; low PSI = unstable performance.","Use it before increasing difficulty or assessing competition readiness.")},
  fatigueSlope: {title:"Fatigue slope", body: analyticsHelp("Fatigue slope","Whether performance changes as session time accumulates.","Slope of normalized performance versus accumulated session minutes.","Negative suggests fatigue; positive suggests slow warm-up.","Use it to adjust warm-up, breaks, and session length.")},
  drift: {title:"Performance drift", body: analyticsHelp("Performance drift","Short-term trend versus the previous baseline.","Recent average compared with the prior average window.","Positive drift suggests progress; negative drift suggests regression or changed conditions.","Use it to detect recent changes before they appear in long-term averages.")},
  qualityImpact: {title:"Session quality impact", body: analyticsHelp("Session quality impact","Whether high-rated sessions actually perform better.","Compares average performance in high quality ratings versus low quality ratings.","If quality and score diverge, your rating may capture effort rather than execution.","Use it to calibrate reflection.")},
  optimalLength: {title:"Optimal session length", body: analyticsHelp("Optimal session length","Which session-duration band has produced the best performance.","Groups sessions by duration and compares average score.","Best band suggests your highest-yield session length, not maximum volume.","Use it to plan efficient sessions.")},
  plateau: {title:"Plateau detector", body: analyticsHelp("Plateau detector","Whether recent performance has flattened.","Compares recent window versus previous window and flags very small change.","A plateau means repetition alone may no longer be enough.","Use it to vary constraints or change target difficulty.")},
  overtraining: {title:"Overtraining signal", body: analyticsHelp("Overtraining signal","Whether rising volume is failing to produce better performance.","Compares recent volume change with performance change.","Volume up with performance flat/down can indicate fatigue or low-quality practice.","Use it to schedule lighter sessions or deload.")},
  difficultyLadder: {title:"Difficulty ladder", body: analyticsHelp("Difficulty ladder","Whether the current target is too easy, too hard, or appropriate.","Combines hit rate, PSI, drift, and sample size.","Increase if stable and high hit rate; reduce if consistently failing; maintain if in learning zone.","Use it to create target versions.")},
  abComparison: {title:"A/B period comparison", body: analyticsHelp("A/B comparison","Whether one period performed better than another.","Compares logs, time, average score, hit rate, PSI, and best score across two periods.","Useful for before/after blocks, recent months, or training changes.","Use it to judge whether a training phase worked.")}
});


FIELD_HELP.adaptiveEngine = {
  title:"Adaptive Training Engine",
  body:`<div class="help-rich">
    <p><strong>What it does:</strong> builds a full training session structure, not just a drill list.</p>
    <p><strong>How it works:</strong> diagnoses your current state using hit rate, PSI, drift, fatigue slope, plateau detection, training load, anchor drills, and days since last practice.</p>
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
  title:"Regret / Counterfactual Engine",
  body:`<div class="help-rich">
    <p><strong>What it measures:</strong> whether an alternative routine might have been a better choice than the one selected.</p>
    <p><strong>How calculated:</strong> compares expected recent performance using average score, PSI adjustment, and drift adjustment.</p>
    <p><strong>How to interpret:</strong> positive regret means the alternative currently looks better; negative regret means the chosen routine looks better.</p>
    <div class="example"><strong>Important:</strong> this is not causal proof. It is a decision-quality signal for drill selection.</div>
  </div>`
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
    body: analyticsHelp("Average performance","The mean performance level in the selected scope.","Averages normalized scores from the filtered logs.","Good for broad trend reading, but it can hide volatility and table/context effects.","Use it with PSI, hit rate, and residuals.")
  },
  targetHitRate: {
    title:"Target hit rate",
    body: analyticsHelp("Target hit rate","How often you achieved the active target at the time of logging.","Counts On Target and Above Target logs divided by logs with a usable target classification.","High hit rate plus high PSI suggests readiness for harder targets; low hit rate suggests target difficulty may be too high.","Use it before changing target versions.")
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
    body: analyticsHelp("Difficulty ladder","Whether current drill difficulty should increase, decrease, stabilize, or remain unchanged.","Combines target hit rate, PSI, drift, skill gap, and sample size.","Increase if high hit rate and stable; stabilize if volatile; reduce if consistently failing.","Use it to manage target versions.")
  },
  abComparison: {
    title:"A/B period comparison",
    body: analyticsHelp("A/B period comparison","Whether one period performed better than another.","Compares logs, time, average performance, hit rate, PSI, and best score between two selected periods.","Useful for recent vs prior blocks, before/after periods, and training phase reviews.","Use it to judge whether a training approach worked.")
  },
  fatigueSlope: {
    title:"Fatigue slope",
    body: analyticsHelp("Fatigue slope","Whether performance changes as session time accumulates.","Estimates the slope of normalized score against accumulated session minutes.","Negative slope suggests fatigue or focus decline; positive slope suggests slow warm-up; flat suggests endurance stability.","Use it to adjust warm-up, break timing, and drill order.")
  },
  psi: {
    title:"Performance Stability Index (PSI)",
    body: analyticsHelp("PSI","How consistent your performance is over recent logs.","Combines score variability and hit-rate volatility into a 0–100 stability score.","High PSI means reliable execution; low PSI means unstable performance even if average score is acceptable.","Use it before raising targets or assessing competition readiness.")
  },
  regretEngine: {
    title:"Regret / counterfactual engine",
    body: analyticsHelp("Regret / counterfactual engine","Whether another routine currently looks like a better selection than the one chosen.","Compares expected scores using recent average, PSI adjustment, and drift adjustment.","Positive regret means the alternative looks better; negative regret means the chosen routine looks better.","Use it as a drill-selection quality signal, not causal proof.")
  }
});


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
$("installBtn").addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  $("installBtn").classList.add("hidden");
});
if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const reg = await navigator.serviceWorker.register("service-worker.js?v=3.26.0");
      if (reg && reg.update) reg.update();
    } catch(e) {
      console.warn("Service worker registration failed", e);
    }
  });
}
renderAll();

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
  const s = getPersistedActiveSession();
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


function statHelpButton(key){return `<button type="button" class="stat-help" onclick="showFieldHelp('${key}')">?</button>`;}
function getRoutinePriorityReasons(item){
  const r=item.routine,s=item.stats,reasons=[];
  if(s.hit!==null&&s.hit<55) reasons.push("low target hit rate");
  if(s.prior&&s.recent!==null&&s.recent<s.prior) reasons.push("recent underperformance");
  if(undertrainedCategoryBonus(r.id)>=7) reasons.push("undertrained category");
  if(!s.logs.length||daysSince(s.logs[s.logs.length-1].createdAt)>=7) reasons.push("not practiced recently");
  if(r.isAnchor) reasons.push("anchor drill");
  if(!reasons.length) reasons.push("balanced rotation");
  return reasons;
}
function routineMixedStrategyScore(routine,stats,strategy){
  let score=stats.score||0; const days=stats.logs.length?daysSince(stats.logs[stats.logs.length-1].createdAt):30;
  if(strategy==="exploit") score+=(stats.hit===null?5:Math.max(0,80-stats.hit)*0.55);
  else if(strategy==="explore"){score+=Math.min(35,days*2); score+=undertrainedCategoryBonus(routine.id)*1.3;}
  else {score+=Math.min(20,days); score+=routine.isAnchor?8:0;}
  return score;
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
    const ct=Number(r.target||0), cs=Number(r.stretchTarget||0), bump=5;
    return {routine:r,suggestedTarget:ct?ct+bump:bump,suggestedStretch:cs?cs+bump:(ct?ct+bump*2:bump*2),reason:`Hit rate ${hit.toFixed(1)}%, PSI ${psi.psi.toFixed(0)}, performance stable/improving.`};
  }
  return null;
}
function renderTargetUpgradeButton(routineId){
  const sug=targetUpgradeSuggestionForRoutine(routineId); if(!sug) return "";
  return `<div class="target-upgrade"><strong>Target upgrade suggested</strong><br><span class="muted">${escapeHtml(sug.reason)}</span><div class="upgrade-row"><div><label>New target</label><input id="upgrade-target-${sug.routine.id}" type="number" step="0.01" value="${sug.suggestedTarget}"></div><div><label>New stretch</label><input id="upgrade-stretch-${sug.routine.id}" type="number" step="0.01" value="${sug.suggestedStretch}"></div><button class="secondary" onclick="applyTargetUpgrade('${sug.routine.id}')">Apply as new target version</button></div></div>`;
}
function applyTargetUpgrade(routineId){
  const r=routineById(routineId); if(!r) return;
  const nt=Number($("upgrade-target-"+routineId)?.value||0), ns=Number($("upgrade-stretch-"+routineId)?.value||0);
  if(!nt) return alert("Enter a valid new target.");
  r.target=nt; r.stretchTarget=ns||""; r.difficultyLabel=`Target upgrade ${new Date().toLocaleDateString()}`;
  ensureTargetHistory(r); const profile=makeTargetProfile(r,r.difficultyLabel); r.targetHistory.push(profile); r.activeTargetProfileId=profile.id; saveData(); alert("New target version applied.");
}



function renderResumeCard(){const card=$("resumeSessionCard"),box=$("resumeSessionBox"); if(!card||!box)return; const s=getPersistedActiveSession(); if(!s||activeSession){card.classList.add("hidden");box.innerHTML="";return;} const r=routineById(s.routineIds[s.index]); card.classList.remove("hidden"); box.innerHTML=`<div class="resume-detail"><strong>${escapeHtml(s.planName||"Unfinished session")}</strong></div><div class="resume-detail">Continue at exercise ${Number(s.index||0)+1} of ${s.routineIds.length}: ${escapeHtml(r?.name||"Missing exercise")}</div><div class="resume-detail">Started: ${new Date(s.startedAt||s.savedAt).toLocaleString()}</div>`;}
function resumePersistedSession(){const s=getPersistedActiveSession(); if(!s)return alert("No unfinished session to resume."); const savedTimerState=s.timerState?{...s.timerState}:null; activeSession=s; suppressTimerPersistence=true; startRoutineScreen(); suppressTimerPersistence=false; if(savedTimerState) activeSession.timerState=savedTimerState; restoreTimerStateFromActiveSession(); syncTimerStateToActiveSession();}
function discardPersistedSession(){if(!confirm("Discard unfinished session? Existing saved logs will remain."))return; clearPersistedActiveSession(); renderResumeCard();}
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
function tableStats(logs){const groups={}; logs.filter(l=>l.venueTable).forEach(l=>{groups[l.venueTable]||=[];groups[l.venueTable].push(l);}); return Object.entries(groups).map(([table,arr])=>{const vals=arr.map(l=>Number(l.normalizedScore||0)),hit=targetHitRate(arr); return {table,logs:arr.length,time:arr.reduce((a,b)=>a+Number(b.timeMinutes||0),0),avg:vals.length?avg(vals):null,hit};}).sort((a,b)=>b.logs-a.logs);}
function renderTableStats(logs=data.logs||[]){const box=$("tableStatsBox"); if(!box)return; const rows=tableStats(logs); if(!rows.length){box.innerHTML="";return;} box.innerHTML=`<div class="table-stats"><h3>Table / venue performance ${statHelpButton("tableVenuePerformance")}</h3><table><thead><tr><th>Table</th><th>Logs</th><th>Time</th><th>Avg</th><th>Hit rate</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.table)}</td><td>${r.logs}</td><td>${formatDurationHuman(r.time)}</td><td>${r.avg===null?"N/A":r.avg.toFixed(1)}</td><td>${r.hit===null?"N/A":r.hit.toFixed(1)+"%"}</td></tr>`).join("")}</tbody></table></div>`;}

function routineStats(routineId) {
  const logs = data.logs.filter(l => l.routineId === routineId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt));
  const vals = logs.map(l => Number(l.normalizedScore || 0));
  const hit = targetHitRate(logs);
  const recent = vals.length ? avg(vals.slice(-3)) : null;
  const prior = vals.length > 3 ? avg(vals.slice(0,-3)) : null;
  const momentumPenalty = prior && recent !== null && recent < prior ? 18 : 0;
  const lowHitPenalty = hit === null ? 8 : Math.max(0, 80-hit) * 0.7;
  const undertrainedBonus = undertrainedCategoryBonus(routineId);
  const recencyBonus = logs.length ? Math.min(12, daysSince(logs[logs.length-1].createdAt) * 1.5) : 15;
  const consistencyPenalty = vals.length > 2 ? Math.min(15, stdDev(vals) / Math.max(1, avg(vals)) * 30) : 5;
  return {
    logs, vals, hit, recent, prior,
    score: lowHitPenalty + momentumPenalty + undertrainedBonus + recencyBonus + consistencyPenalty
  };
}

function daysSince(dateIso) {
  const d = new Date(dateIso);
  const now = new Date();
  return Math.max(0, Math.floor((now-d)/86400000));
}

function undertrainedCategoryBonus(routineId) {
  const routine = routineById(routineId);
  if (!routine) return 0;
  const recent = data.logs.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,30);
  const alloc = computeAllocation(recent);
  const cat = alloc.find(a => a.cat === routine.category);
  if (!cat) return 12;
  if (cat.pct < 15) return 14;
  if (cat.pct < 25) return 7;
  return 0;
}

function rankRoutines(focusOverride="all", strategy="balanced") {
  return activeRoutines().map(r => {
    const s = routineStats(r.id);
    let score = routineMixedStrategyScore(r, s, strategy);
    if (focusOverride !== "all" && r.category === focusOverride) score += 25;
    return {routine:r, stats:s, score, reasons:getRoutinePriorityReasons({routine:r, stats:s})};
  }).sort((a,b)=>b.score-a.score);
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

  generatedPlanDraft = blocks.flatMap(b => b.picks.map(p => p.routine.id));
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
  planDraft = [...anchorRoutines().map(r=>r.id), ...generatedPlanDraft.filter(id => !anchorRoutines().some(r=>r.id===id))];
  if ($("planName") && !$("planName").value.trim()) $("planName").value = `Orchestrated session — ${new Date().toLocaleDateString()}`;
  renderPlanBuilder();
  document.querySelector('[data-tab="plans"]').click();
}

document.addEventListener("DOMContentLoaded",()=>{
  const btn = document.getElementById("generateSessionBtn");
  if(btn) btn.onclick=generateNextSession;
  const loadBtn = document.getElementById("loadGeneratedPlanBtn");
  if(loadBtn) loadBtn.onclick=loadGeneratedPlan;
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
  if (!$("statsOverviewBtn") || !$("statsAdvancedBtn")) return;
  if (statsMode === "advanced") {
    $("statsAdvancedBtn").classList.add("active-subtab");
    $("statsOverviewBtn").classList.remove("active-subtab");
  } else {
    $("statsOverviewBtn").classList.add("active-subtab");
    $("statsAdvancedBtn").classList.remove("active-subtab");
  }
}
document.addEventListener("DOMContentLoaded", applyStoredStatsModeVisual);
/* v3.25.9 interface settings core — single deterministic API. */
function normalizeOnOff(value, fallback="on") {
  return value === "off" ? "off" : (value === "on" ? "on" : fallback);
}
function resolveThemeMode(mode) {
  const clean = normalizeInterfaceThemeMode(mode || getThemeModeSetting());
  if (clean !== "system") return clean;
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch(e) {
    return "light";
  }
}
function interfaceReadSetting(storageKey, dataKey, fallback) {
  try {
    const local = localStorage.getItem(storageKey);
    if (local !== null && local !== undefined && local !== "") return dataKey === "themeMode" ? normalizeInterfaceThemeMode(local) : normalizeOnOff(local, fallback);
  } catch(e) {}
  try {
    const stored = data && data.interfaceSettings ? data.interfaceSettings[dataKey] : null;
    if (stored !== null && stored !== undefined && stored !== "") return dataKey === "themeMode" ? normalizeInterfaceThemeMode(stored) : normalizeOnOff(stored, fallback);
  } catch(e) {}
  return fallback;
}
function interfaceWriteSetting(storageKey, dataKey, value) {
  const clean = dataKey === "themeMode" ? normalizeInterfaceThemeMode(value) : normalizeOnOff(value, "on");
  try { localStorage.setItem(storageKey, clean); } catch(e) { if (typeof logAppError === "function") logAppError(e, "interfaceWriteSetting localStorage"); }
  try {
    data.interfaceSettings = data.interfaceSettings || {};
    data.interfaceSettings[dataKey] = clean;
    data.updatedAt = new Date().toISOString();
    if (typeof safeStorageSet === "function") safeStorageSet(STORAGE_KEY, JSON.stringify(data), "interface setting save");
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch(e) { if (typeof logAppError === "function") logAppError(e, "interfaceWriteSetting main data"); }
  return clean;
}
function getThemeModeSetting(){ return interfaceReadSetting(THEME_MODE_KEY, "themeMode", "system"); }
function getSessionFocusSetting(){ return interfaceReadSetting(SESSION_FOCUS_MODE_KEY, "sessionFocusMode", "on"); }
function getQuickLogAutoAdvanceSetting(){ return interfaceReadSetting(QUICK_LOG_AUTO_ADVANCE_KEY, "quickLogAutoAdvance", "on"); }
function applyThemeMode(mode){
  const storedMode = normalizeInterfaceThemeMode(mode || getThemeModeSetting());
  const actualTheme = resolveThemeMode(storedMode);
  [document.documentElement, document.body].filter(Boolean).forEach(el => {
    el.classList.remove("theme-system", "theme-light", "theme-dark", "theme-contrast");
    el.classList.add("theme-" + storedMode);
    el.setAttribute("data-theme-mode", storedMode);
    el.setAttribute("data-theme", actualTheme);
  });
  const meta = document.getElementById("themeColorMeta") || document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", actualTheme === "contrast" ? "#000000" : actualTheme === "dark" ? "#07110d" : "#102b22");
}
function renderInterfaceSettings(){
  applyThemeMode();
  const theme = $("themeModeSelect");
  const focus = $("sessionFocusModeSelect");
  const quick = $("quickLogAutoAdvanceSelect");
  if (theme) theme.value = getThemeModeSetting();
  if (focus) focus.value = getSessionFocusSetting();
  if (quick) quick.value = getQuickLogAutoAdvanceSetting();
}
var currentSessionFocusActive = null;
function isActiveSessionVisible(){
  const el = $("activeSession");
  return !!(activeSession && el && !el.classList.contains("hidden"));
}
function updateSessionFocusState(){
  const active = isActiveSessionVisible();
  if (!active) currentSessionFocusActive = null;
  if (active && currentSessionFocusActive == null) currentSessionFocusActive = getSessionFocusSetting() !== "off";
  document.body?.classList.toggle("session-focus-active", !!(active && currentSessionFocusActive));
  const btn = $("toggleFocusModeBtn");
  if (btn) {
    btn.textContent = active && currentSessionFocusActive ? "Exit Focus Mode" : "Focus Mode";
    btn.setAttribute("aria-pressed", active && currentSessionFocusActive ? "true" : "false");
  }
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
window.SnookerInterface = {
  readTheme:getThemeModeSetting, setTheme:function(v){ const c=interfaceWriteSetting(THEME_MODE_KEY,"themeMode",v); applyThemeMode(c); renderInterfaceSettings(); return c; }, applyTheme:applyThemeMode,
  readFocusDefault:getSessionFocusSetting, setFocusDefault:function(v){ const c=interfaceWriteSetting(SESSION_FOCUS_MODE_KEY,"sessionFocusMode",v); renderInterfaceSettings(); updateSessionFocusState(); return c; },
  readQuick:getQuickLogAutoAdvanceSetting, setQuick:function(v){ const c=interfaceWriteSetting(QUICK_LOG_AUTO_ADVANCE_KEY,"quickLogAutoAdvance",v); renderInterfaceSettings(); if(activeSession) renderCurrentRoutine(); return c; },
  toggleFocus:toggleSessionFocusMode, updateFocusUI:updateSessionFocusState, syncControls:renderInterfaceSettings, bind:bindInterfaceSettings
};
function renderLivePerformanceCard(r){
  const box = $("livePerformanceCard");
  if (!box || !r) return;
  const score = Number($("scoreValue")?.value || 0);
  const attempts = Number($("attemptsValue")?.value || r.attempts || r.attemptsPerSession || 0);
  const draftLog = {scoring:r.scoring, score, attempts, totalUnitsAtLog:r.totalUnits || 0, totalUnits:r.totalUnits || 0, timeMinutes:Number($("manualTimeValue")?.value || r.duration || 0)};
  const normalized = normalizeScore(draftLog);
  const profile = getActiveTargetProfile(r);
  const target = Number(profile?.target || r.target || 0);
  const stretch = Number(profile?.stretchTarget || r.stretchTarget || 0);
  const recent = data.logs.filter(l => l.routineId === r.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,3);
  const status = target && normalized >= stretch && stretch ? "green" : target && normalized >= target ? "green" : target && normalized >= target * 0.75 ? "yellow" : target ? "red" : "neutral";
  const statusText = status === "green" ? "On target" : status === "yellow" ? "Near target" : status === "red" ? "Below target" : "No target";
  box.innerHTML = `<div class="live-perf ${status}">
    <div><strong>Live target check</strong><span>${statusText}</span></div>
    <div><span>Current</span><strong>${Number(normalized || 0).toFixed(r.scoring === "score_per_minute" ? 2 : 1)}${r.scoring === "success_rate" || r.scoring === "progressive_completion" ? "%" : ""}</strong></div>
    <div><span>Target</span><strong>${target || "N/A"}</strong></div>
    <div><span>Stretch</span><strong>${stretch || "N/A"}</strong></div>
    <div><span>Last 3</span><strong>${recent.length ? recent.map(l => Number(l.normalizedScore || 0).toFixed(0)).join(" / ") : "N/A"}</strong></div>
  </div>`;
}

window.addEventListener("storage", e => {
  if (e.key === STORAGE_KEY) {
    try {
      data = loadData();
      ensureTablesDatabase?.();
      renderAll();
    } catch(err) {
      logAppError(err, "storage sync");
    }
  }
});

window.addEventListener("beforeunload", () => {
  try {
    if (activeSession) persistActiveSession();
    if (timerInterval) clearInterval(timerInterval);
  } catch(e) {}
});

try { window.addEventListener("beforeunload", syncTimerStateToActiveSession); } catch(e) {}
