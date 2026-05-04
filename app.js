const STORAGE_KEY = "snookerPracticePWA.v3";
const OLD_KEYS = ["snookerPracticePWA.v1", "snookerPracticePWA.v2"];
const APP_VERSION = "3.25.7";
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
function applyThemeModeEarly() {
const mode = getRawStoredThemeMode();
const root = document.documentElement;
if (mode === "system") {
root.removeAttribute("data-theme");
root.dataset.themeMode = "system";
} else {
root.setAttribute("data-theme", mode);
root.dataset.themeMode = mode;
}
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
tagHistory: [],
interfaceSettings: {
themeMode: "system",
sessionFocusMode: "on",
quickLogAutoAdvance: "on"
}
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
let deferredInstallPrompt = null;
let statsMode = localStorage.getItem("snookerPracticePWA.statsMode") || "overview";
function $(id) { return document.getElementById(id); }
function migrateData(d) {
d.appVersion = APP_VERSION;
d.routines = (d.routines || []).map(r => ({
...r,
folder: r.folder || r.category || "Unfiled",
subfolder: r.subfolder || "General",
category: r.category || "uncategorized",
stretchTarget: r.stretchTarget || ""
}));
d.routines = (d.routines || []).map(r => ensureTargetHistory(r));
d.plans = d.plans || [];
d.tagHistory = d.tagHistory || [];
d.interfaceSettings = d.interfaceSettings || {};
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
function saveData() {
data.updatedAt = new Date().toISOString();
data.interfaceSettings = data.interfaceSettings || {};
data.interfaceSettings.themeMode = getThemeModeSetting();
data.interfaceSettings.sessionFocusMode = getSessionFocusSetting();
data.interfaceSettings.quickLogAutoAdvance = getQuickLogAutoAdvanceSetting();
ensureTablesDatabase?.();
const ok = safeStorageSet(STORAGE_KEY, JSON.stringify(data), "saveData");
if (ok) renderStorageWarning();
renderAll();
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
function categories() { return [...new Set(data.routines.map(r => r.category || "uncategorized"))].sort(); }
function folders() { return [...new Set(data.routines.map(r => r.folder || "Unfiled"))].sort(); }
function subfolders() { return [...new Set(data.routines.map(r => r.subfolder || "General"))].sort(); }
function routineById(id) { return data.routines.find(r => r.id === id); }
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
return ${strength} ${direction} (${r.toFixed(2)})
;
}
function localDateKey(dateLike = new Date()) {
const d = new Date(dateLike);
return ${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}
;
}
function sameDate(log, dateKey) { return localDateKey(log.createdAt) === dateKey; }
function visibleRoutines(typeFilter="all", folderFilter="all", search="") {
const q = search.trim().toLowerCase();
return data.routines
.filter(r => typeFilter === "all" || (r.category || "uncategorized") === typeFilter)
.filter(r => folderFilter === "all" || (r.folder || "Unfiled") === folderFilter)
.filter(r => !q || r.name.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q))
.sort((a,b) => (a.folder||"").localeCompare(b.folder||"") || (a.subfolder||"").localeCompare(b.subfolder||"") || a.name.localeCompare(b.name));
}
function setSelectOptions(select, values, allLabel, selected="all") {
if (!select) return;
select.innerHTML = <option value="all">${allLabel}</option>
 + values.map(v => <option value="${escapeAttr(v)}">${escapeHtml(v)}</option>
).join("");
select.value = values.includes(selected) || selected === "all" ? selected : "all";
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
setSelectOptions(("routineCategorySelect"),cats,"Selectexistingtype/category",("routineCategorySelect"), cats, "Select existing type/category", ("routineCategorySelect"),cats,"Selectexistingtype/category",("routineCategorySelect")?.value || "all");
setSelectOptions(("routineFolderSelect"),flds,"Selectexistingfolder",("routineFolderSelect"), flds, "Select existing folder", ("routineFolderSelect"),flds,"Selectexistingfolder",("routineFolderSelect")?.value || "all");
setSelectOptions(("routineSubfolderSelect"),subs,"Selectexistingsubfolder",("routineSubfolderSelect"), subs, "Select existing subfolder", ("routineSubfolderSelect"),subs,"Selectexistingsubfolder",("routineSubfolderSelect")?.value || "all");
setSelectOptions(("exerciseTypeFilter"),cats,"Alltypes",("exerciseTypeFilter"), cats, "All types", ("exerciseTypeFilter"),cats,"Alltypes",("exerciseTypeFilter")?.value || "all");
setSelectOptions(("exerciseFolderFilter"),flds,"Allfolders",("exerciseFolderFilter"), flds, "All folders", ("exerciseFolderFilter"),flds,"Allfolders",("exerciseFolderFilter")?.value || "all");
setSelectOptions(("planTypeFilter"),cats,"Alltypes",("planTypeFilter"), cats, "All types", ("planTypeFilter"),cats,"Alltypes",("planTypeFilter")?.value || "all");
setSelectOptions(("planFolderFilter"),flds,"Allfolders",("planFolderFilter"), flds, "All folders", ("planFolderFilter"),flds,"Allfolders",("planFolderFilter")?.value || "all");
setSelectOptions(("randomTypeFilter"),cats,"Alltypes",("randomTypeFilter"), cats, "All types", ("randomTypeFilter"),cats,"Alltypes",("randomTypeFilter")?.value || "all");
setSelectOptions(("randomFolderFilter"),flds,"Allfolders",("randomFolderFilter"), flds, "All folders", ("randomFolderFilter"),flds,"Allfolders",("randomFolderFilter")?.value || "all");
setSelectOptions(("constraintFocusType"),cats,"Nospecificfocus",("constraintFocusType"), cats, "No specific focus", ("constraintFocusType"),cats,"Nospecificfocus",("constraintFocusType")?.value || "all");
setSelectOptions(("orchestratorFocus"),cats,"Autofocus",("orchestratorFocus"), cats, "Auto focus", ("orchestratorFocus"),cats,"Autofocus",("orchestratorFocus")?.value || "all");
const planPickerRoutines = visibleRoutines(("planTypeFilter")?.value∣∣"all",("planTypeFilter")?.value || "all", ("planTypeFilter")?.value∣∣"all",("planFolderFilter")?.value || "all");
("routineToAdd").innerHTML=planPickerRoutines.map(r=>‘<optionvalue="("routineToAdd").innerHTML = planPickerRoutines.map(r => `<option value="("routineToAdd").innerHTML=planPickerRoutines.map(r=>‘<optionvalue="{r.id}">escapeHtml(r.folder∣∣"Unfiled")/{escapeHtml(r.folder || "Unfiled")} / escapeHtml(r.folder∣∣"Unfiled")/{escapeHtml(r.subfolder || "General")} — ${escapeHtml(r.name)}</option>).join("") || 
<option value="">No matching exercises</option>`;
const allRoutineOptions = visibleRoutines().map(r => <option value="${r.id}">${escapeHtml(r.name)} — ${fmtScoring(r.scoring)}</option>
).join("");
("freeRoutineSelect").innerHTML=allRoutineOptions∣∣‘<optionvalue="">Noexercisesyet</option>‘;("freeRoutineSelect").innerHTML = allRoutineOptions || `<option value="">No exercises yet</option>`;
  ("freeRoutineSelect").innerHTML=allRoutineOptions∣∣‘<optionvalue="">Noexercisesyet</option>‘;("nextFreeRoutineSelect").innerHTML = allRoutineOptions || <option value="">No exercises yet</option>
;
("planSelect").innerHTML=data.plans.map(p=>‘<optionvalue="("planSelect").innerHTML = data.plans.map(p => `<option value="("planSelect").innerHTML=data.plans.map(p=>‘<optionvalue="{p.id}">escapeHtml(p.name)</option>‘).join("")∣∣‘<optionvalue="">Noplansyet</option>‘;{escapeHtml(p.name)}</option>`).join("") || `<option value="">No plans yet</option>`;
  escapeHtml(p.name)</option>‘).join("")∣∣‘<optionvalue="">Noplansyet</option>‘;("statsRoutineSelect").innerHTML = data.routines.map(r => <option value="${r.id}">${escapeHtml(r.name)}</option>
).join("") || <option value="">No exercises yet</option>
;
if (!("statsDateSelect").value)("statsDateSelect").value) ("statsDateSelect").value)("statsDateSelect").value = localDateKey();
}
["exerciseTypeFilter","exerciseFolderFilter","exerciseSearch","planTypeFilter","planFolderFilter"].forEach(id => {
(id).addEventListener("input",renderAll);(id).addEventListener("input", renderAll);
  (id).addEventListener("input",renderAll);(id).addEventListener("change", renderAll);
});
function renderRoutineList() {
const routines = visibleRoutines(("exerciseTypeFilter").value∣∣"all",("exerciseTypeFilter").value || "all", ("exerciseTypeFilter").value∣∣"all",("exerciseFolderFilter").value || "all", ("exerciseSearch").value || "");
  if (!routines.length) { ("routineList").innerHTML = "<p>No exercises match the current filters.</p>"; return; }
const grouped = {};
routines.forEach(r => {
const f = r.folder || "Unfiled", s = r.subfolder || "General";
grouped[f] ||= {};
grouped[f][s] ||= [];
grouped[f][s].push(r);
});
("routineList").innerHTML=Object.entries(grouped).map(([folder,subMap])=>‘<divclass="folder−group"><divclass="folder−header">("routineList").innerHTML = Object.entries(grouped).map(([folder, subMap]) =>
    `<div class="folder-group"><div class="folder-header">("routineList").innerHTML=Object.entries(grouped).map(([folder,subMap])=>‘<divclass="folder−group"><divclass="folder−header">{escapeHtml(folder)}</div>{
      Object.entries(subMap).map(([sub, rs]) => `
{escapeHtml(sub)}</div>${rs.map(renderRoutineItem).join("")}).join("")
    }</div>

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
  data.routines.push({...r, id: uuid(), name: `${r.name} copy`});
  saveData();
}
function deleteRoutine(id) {
  return confirmDeleteAction("this exercise template", () => {
    data.routines = data.routines.filter(r => r.id !== id);
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
  const subfolder = newSubfolder || (selectedSubfolder !== "all" ? selectedSubfolder : "General");const routine = {
id: ("routineEditId").value∣∣uuid(),name,scoring:("routineEditId").value || uuid(),
    name,
    scoring: ("routineEditId").value∣∣uuid(),name,scoring:("routineScoring").value,
attempts: Number(("routineAttempts").value∣∣0)∣∣"",duration:Number(("routineAttempts").value || 0) || "",
    duration: Number(("routineAttempts").value∣∣0)∣∣"",duration:Number(("routineDuration").value || 0) || "",
isAnchor: ("routineIsAnchor").value==="yes",target:Number(("routineIsAnchor").value === "yes",
    target: Number(("routineIsAnchor").value==="yes",target:Number(("routineTarget").value || 0) || "",
stretchTarget: Number(("routineStretchTarget").value∣∣0)∣∣"",totalUnits:Number(("routineStretchTarget").value || 0) || "",
    totalUnits: Number(("routineStretchTarget").value∣∣0)∣∣"",totalUnits:Number(("routineTotalUnits").value || 0) || "",
attemptsPerSession: Number(("routineAttemptsPerSession").value∣∣0)∣∣"",unitType:("routineAttemptsPerSession").value || 0) || "",
    unitType: ("routineAttemptsPerSession").value∣∣0)∣∣"",unitType:("routineUnitType").value || "balls_cleared",
targetMode: ("routineTargetMode").value∣∣"custom",targetColour:("routineTargetMode").value || "custom",
    targetColour: ("routineTargetMode").value∣∣"custom",targetColour:("routineTargetColour").value || inferTargetColour(("routineTargetMode").value)∣∣"",trackHighestBreak:("routineTargetMode").value) || "",
    trackHighestBreak: ("routineTargetMode").value)∣∣"",trackHighestBreak:("routineTrackHighestBreak").value === "yes",
difficultyLabel: ("routineDifficultyLabel").value.trim()∣∣"Basetarget",category,folder,subfolder,description:("routineDifficultyLabel").value.trim() || "Base target",
    category, folder, subfolder,
    description: ("routineDifficultyLabel").value.trim()∣∣"Basetarget",category,folder,subfolder,description:("routineDescription").value.trim()
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
("addRoutineToPlanBtn").addEventListener("click", () => {
  const id = ("routineToAdd").value;
if (!id) return;
planDraft.push(id);
renderPlanBuilder();
});
function renderPlanBuilder() {
("planBuilderList").innerHTML = planDraft.map((id, i) => {
    const r = routineById(id);
    return `
      
{i + 1}. ${escapeHtml(r?.name || "Missing exercise")}</strong>
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
}("resumeSessionBtn").addEventListener("click",resumePersistedSession);("resumeSessionBtn").addEventListener("click", resumePersistedSession);
("resumeSessionBtn").addEventListener("click",resumePersistedSession);("discardSessionBtn").addEventListener("click", discardPersistedSession);
("todayResumeSessionBtn").addEventListener("click",resumePersistedSession);("todayResumeSessionBtn").addEventListener("click", resumePersistedSession);
("todayResumeSessionBtn").addEventListener("click",resumePersistedSession);("todayDiscardSessionBtn").addEventListener("click", discardPersistedSession);
("startSessionBtn").addEventListener("click", () => {
  const plan = data.plans.find(p => p.id === ("planSelect").value);
if (!plan) return alert("Create or select a plan first.");
activeSession = { id: uuid(), type: "plan", planId: plan.id, planName: plan.name, routineIds: [...anchorRoutines().map(r=>r.id), ...plan.routineIds.filter(id => data.routines.some(r => r.id === id) && !anchorRoutines().some(a=>a.id===id))], index: 0, startedAt: new Date().toISOString(), completedLogs: [], plannedRoutineIds: plan.routineIds ? [...plan.routineIds] : [] };
startRoutineScreen();
persistActiveSession();
});
("startFreeSessionBtn").addEventListener("click", () => {
  const rid = ("freeRoutineSelect").value;
if (!rid) return alert("Create at least one exercise first.");
activeSession = { id: uuid(), type: "free", planName: Free training — ${new Date().toLocaleDateString()}
, routineIds: [rid], index: 0, startedAt: new Date().toISOString(), completedLogs: [] };
startRoutineScreen();
persistActiveSession();
});
("repeatLastExerciseBtn").addEventListener("click", () => {
  const last = data.logs.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
  if (!last) return alert("No previous exercise to repeat yet.");
  const routine = routineById(last.routineId);
  if (!routine) return alert("The last exercise template no longer exists.");
  activeSession = { id: uuid(), type: "free", planName: `Repeat — {new Date().toLocaleDateString()}`, routineIds: [routine.id], index: 0, startedAt: new Date().toISOString(), completedLogs: [] };
startRoutineScreen();
});
function startRoutineScreen() {
persistActiveSession();
resetTimerState();
("sessionSummary").classList.add("hidden");("sessionSummary").classList.add("hidden");
  ("sessionSummary").classList.add("hidden");("freeNextCard").classList.add("hidden");
("activeSession").classList.remove("hidden");
  updateSessionFocusState();
  renderCurrentRoutine();
}
("resetSessionBtn").addEventListener("click", () => {
activeSession = null;
clearPersistedActiveSession();
stopTimer();
resetTimerState();
("activeSession").classList.add("hidden");("activeSession").classList.add("hidden");
  ("activeSession").classList.add("hidden");("freeNextCard").classList.add("hidden");
updateSessionFocusState();
("sessionSummary").classList.add("hidden");
  updateSessionFocusState();
});
function renderCurrentRoutine() {
  persistActiveSession();
  if (!activeSession || activeSession.index >= activeSession.routineIds.length) return completeSession();
  const r = routineById(activeSession.routineIds[activeSession.index]);
  if (!r) return;
  ("currentRoutineName").textContent = r.name;
const sessionTxt = activeSession.type === "free" ? "Free training" : ${activeSession.index + 1}/${activeSession.routineIds.length}
;
("currentRoutineMeta").textContent=‘("currentRoutineMeta").textContent = `("currentRoutineMeta").textContent=‘{sessionTxt} · fmtScoring(r.scoring)⋅target{fmtScoring(r.scoring)} · target fmtScoring(r.scoring)⋅target{r.target || "n/a"} · default r.duration∣∣0min⋅{r.duration || 0} min · r.duration∣∣0min⋅{r.folder || "Unfiled"} / r.subfolder∣∣"General"‘;{r.subfolder || "General"}`;
  r.subfolder∣∣"General"‘;("practiceNotes").value = "";
$("sessionVenueTable").value = activeSession.tableId || getLastTableId() || "";
("sessionIntervention").value="";("sessionIntervention").value = "";
  ("sessionIntervention").value="";("sessionInterventionNote").value = "";
("sessionRating").value="";("sessionRating").value = "";
  ("sessionRating").value="";("sessionTags").value = "";
if (r.description) { ("routineDescriptionBox").textContent=r.description;("routineDescriptionBox").textContent = r.description; ("routineDescriptionBox").textContent=r.description;("routineDescriptionBox").classList.remove("hidden"); }
else ("routineDescriptionBox").classList.add("hidden");resetTimerState();renderScoreInputs(r);prefillSmartDefaults(r);("routineDescriptionBox").classList.add("hidden");
  resetTimerState();
  renderScoreInputs(r);
  prefillSmartDefaults(r);
  ("routineDescriptionBox").classList.add("hidden");resetTimerState();renderScoreInputs(r);prefillSmartDefaults(r);("saveNextBtn").textContent = activeSession.type === "free" ? "Save Routine" : "Save & Next";
("skipBtn").classList.toggle("hidden",activeSession.type==="free");("skipBtn").classList.toggle("hidden", activeSession.type === "free");
  ("skipBtn").classList.toggle("hidden",activeSession.type==="free");("endFreeSessionBtn").classList.toggle("hidden", activeSession.type !== "free");
updateSessionFocusState();
renderLivePerformanceCard(r);
}
function renderScoreInputs(r) {
let html = "";
if (r.scoring === "progressive_completion") {
html += <div><label>Average ${progressiveUnitLabel(r)} per attempt</label><input id="scoreValue" type="number" min="0" step="0.01" placeholder="e.g. 8" inputmode="decimal"></div>
;
html += <div><label>Best attempt (${progressiveUnitLabel(r)})</label><input id="bestAttemptValue" type="number" min="0" step="0.01" placeholder="e.g. 12" inputmode="decimal"></div>
;
html += <div><label>Attempts</label><input id="attemptsValue" type="number" min="1" step="1" value="${r.attemptsPerSession || r.attempts || ""}" inputmode="numeric"></div>
;
html += <div><label>Completions</label><input id="completionCountValue" type="number" min="0" step="1" placeholder="0 if none" inputmode="numeric"></div>
;
if (r.trackHighestBreak) html += <div><label>Highest break (optional)</label><input id="highestBreakValue" type="number" min="0" step="1" placeholder="e.g. 32" inputmode="numeric"></div>
;
html += <div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty" inputmode="decimal"></div>
;
} else if (r.scoring === "success_rate") {
html += <div><label>Made</label><input id="scoreValue" type="number" min="0" step="1" placeholder="e.g. 7" inputmode="numeric"></div>
;
html += <div><label>Attempts</label><input id="attemptsValue" type="number" min="1" step="1" value="${r.attempts || ""}" placeholder="e.g. 10" inputmode="numeric"></div>
;
html += <div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty" inputmode="decimal"></div>
;
} else {
html += <div><label>Score</label><input id="scoreValue" type="number" step="0.01" placeholder="Enter score" inputmode="decimal"></div>
;
html += <div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty" inputmode="decimal"></div>
;
}
("scoreInputs").innerHTML=html;renderQuickScoreControls(r);setTimeout(()=>("scoreInputs").innerHTML = html;
  renderQuickScoreControls(r);
  setTimeout(() => ("scoreInputs").innerHTML=html;renderQuickScoreControls(r);setTimeout(()=>("scoreValue")?.focus(), 120);
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
if (("scoreValue"))("scoreValue")) ("scoreValue"))("scoreValue").value = last.score || 0;
if (("attemptsValue"))("attemptsValue")) ("attemptsValue"))("attemptsValue").value = last.attempts || last.attemptsPerSessionAtLog || "";
if (("manualTimeValue"))("manualTimeValue")) ("manualTimeValue"))("manualTimeValue").value = last.timeMinutes || "";
if (("bestAttemptValue"))("bestAttemptValue")) ("bestAttemptValue"))("bestAttemptValue").value = last.bestAttempt || "";
if (("completionCountValue"))("completionCountValue")) ("completionCountValue"))("completionCountValue").value = last.completionCount || "";
if (("highestBreakValue"))("highestBreakValue")) ("highestBreakValue"))("highestBreakValue").value = last.highestBreak || "";
if (("sessionRating") && last.sessionRating) ("sessionRating").value = last.sessionRating;
if (("sessionTags") && last.sessionTags) ("sessionTags").value = last.sessionTags;
}
function renderQuickScoreControls(r) {
const box = ("quickScoreControls");
  if (!box) return;
  box.classList.remove("hidden");
  const autoMacros = getQuickLogAutoAdvanceSetting() !== "off";
  if (r.scoring === "success_rate") {
    const attempts = Math.max(1, Number(r.attempts || r.attemptsPerSession || 10));
    const chips = Array.from({length: Math.min(attempts, 30) + 1}, (_, i) => i)
      .map(i => `{i}); renderLivePerformanceCard(routineById(activeSession?.routineIds?.[activeSession?.index]));">${i}</button>)
      .join("");
    box.innerHTML = 

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
function decrementScore() { adjustScore(-1); }function prefillSmartDefaults(r) {
const similar = data.logs.filter(l => l.routineId === r.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
const last = similar[0];
if (last && ("manualTimeValue") && !Number(("manualTimeValue").value)) {
("manualTimeValue").placeholder=‘last:("manualTimeValue").placeholder = `last: ("manualTimeValue").placeholder=‘last:{last.timeMinutes} min;
  }
  const recentRating = data.logs.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).find(l => l.sessionRating);
  if (recentRating && $("sessionRating")) $("sessionRating").placeholder = 
last: ${recentRating.sessionRating}`;
}
("saveNextBtn").addEventListener("click",saveCurrentRoutine);("saveNextBtn").addEventListener("click", saveCurrentRoutine);
("saveNextBtn").addEventListener("click",saveCurrentRoutine);("skipBtn").addEventListener("click", () => { if (!activeSession) return; activeSession.index += 1; persistActiveSession(); stopTimer(); renderCurrentRoutine(); });
("endFreeSessionBtn").addEventListener("click",completeSession);("endFreeSessionBtn").addEventListener("click", completeSession);
("endFreeSessionBtn").addEventListener("click",completeSession);("endFreeFromNextBtn").addEventListener("click", completeSession);
("continueFreeBtn").addEventListener("click", () => {
  if (!activeSession) return;
  const rid = ("nextFreeRoutineSelect").value;
if (!rid) return alert("Select a routine.");
activeSession.routineIds = [rid];
activeSession.index = 0;
("freeNextCard").classList.add("hidden");("freeNextCard").classList.add("hidden");
  ("freeNextCard").classList.add("hidden");("activeSession").classList.remove("hidden");
renderCurrentRoutine();
});
function saveCurrentRoutine() {
if (!activeSession) return;
const r = routineById(activeSession.routineIds[activeSession.index]);
if (!r) return;
const score = Number(("scoreValue")?.value∣∣0);constattempts=(r.scoring==="successrate"∣∣r.scoring==="progressivecompletion")?Number(("scoreValue")?.value || 0);
  const attempts = (r.scoring === "success_rate" || r.scoring === "progressive_completion") ? Number(("scoreValue")?.value∣∣0);constattempts=(r.scoring==="successr​ate"∣∣r.scoring==="progressivec​ompletion")?Number(("attemptsValue")?.value || 0) : Number(r.attempts || 0);
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
bestAttempt: Number(("bestAttemptValue")?.value∣∣0)∣∣"",completionCount:Number(("bestAttemptValue")?.value || 0) || "",
    completionCount: Number(("bestAttemptValue")?.value∣∣0)∣∣"",completionCount:Number(("completionCountValue")?.value || 0) || "",
highestBreak: Number(("highestBreakValue")?.value∣∣0)∣∣"",totalUnits:r.totalUnits∣∣"",unitType:r.unitType∣∣"",targetMode:r.targetMode∣∣"",targetProfileId:activeProfile?.id∣∣"",targetAtLog:activeProfile?.target∣∣r.target∣∣"",stretchTargetAtLog:activeProfile?.stretchTarget∣∣r.stretchTarget∣∣"",totalUnitsAtLog:activeProfile?.totalUnits∣∣r.totalUnits∣∣"",attemptsPerSessionAtLog:activeProfile?.attemptsPerSession∣∣r.attemptsPerSession∣∣r.attempts∣∣"",difficultyLabelAtLog:activeProfile?.difficultyLabel∣∣r.difficultyLabel∣∣"",targetColour:r.targetColour∣∣inferTargetColour(r.targetMode)∣∣"",performance:"N/A",tableId:activeSession.tableId∣∣("highestBreakValue")?.value || 0) || "",
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
    tableId: activeSession.tableId || ("highestBreakValue")?.value∣∣0)∣∣"",totalUnits:r.totalUnits∣∣"",unitType:r.unitType∣∣"",targetMode:r.targetMode∣∣"",targetProfileId:activeProfile?.id∣∣"",targetAtLog:activeProfile?.target∣∣r.target∣∣"",stretchTargetAtLog:activeProfile?.stretchTarget∣∣r.stretchTarget∣∣"",totalUnitsAtLog:activeProfile?.totalUnits∣∣r.totalUnits∣∣"",attemptsPerSessionAtLog:activeProfile?.attemptsPerSession∣∣r.attemptsPerSession∣∣r.attempts∣∣"",difficultyLabelAtLog:activeProfile?.difficultyLabel∣∣r.difficultyLabel∣∣"",targetColour:r.targetColour∣∣inferTargetColour(r.targetMode)∣∣"",performance:"N/A",tableId:activeSession.tableId∣∣("sessionVenueTable")?.value || "",
venueTable: getTableName(activeSession.tableId || ("sessionVenueTable")?.value)∣∣activeSession.venueTable∣∣"",venueTableSnapshot:getTableName(activeSession.tableId∣∣("sessionVenueTable")?.value) || activeSession.venueTable || "",
    venueTableSnapshot: getTableName(activeSession.tableId || ("sessionVenueTable")?.value)∣∣activeSession.venueTable∣∣"",venueTableSnapshot:getTableName(activeSession.tableId∣∣("sessionVenueTable")?.value) || "",
tableNote: tableById(activeSession.tableId)?.info || activeSession.tableNote || "",
sessionIntervention: ("sessionIntervention")?.value∣∣"",sessionInterventionNote:("sessionIntervention")?.value || "",
    sessionInterventionNote: ("sessionIntervention")?.value∣∣"",sessionInterventionNote:("sessionInterventionNote")?.value || "",
sessionRating: Number(("sessionRating")?.value∣∣0)∣∣"",sessionTags:("sessionRating")?.value || 0) || "",
    sessionTags: ("sessionRating")?.value∣∣0)∣∣"",sessionTags:("sessionTags")?.value || "",
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
saveData();
("activeSession").classList.add("hidden");("activeSession").classList.add("hidden");
    ("activeSession").classList.add("hidden");("freeNextCard").classList.remove("hidden");
updateSessionFocusState();
} else {
activeSession.index += 1;
persistActiveSession();
saveData();
renderCurrentRoutine();
}
}
function completeSession() {
if (!activeSession) return;
stopTimer();
("activeSession").classList.add("hidden");("activeSession").classList.add("hidden");
  ("activeSession").classList.add("hidden");("freeNextCard").classList.add("hidden");
updateSessionFocusState?.();
const logs = activeSession.completedLogs || data.logs.filter(l => l.sessionId === activeSession.id);
const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
("sessionSummary").innerHTML=‘<h2>Sessioncomplete</h2><p><strong>("sessionSummary").innerHTML = `<h2>Session complete</h2><p><strong>("sessionSummary").innerHTML=‘<h2>Sessioncomplete</h2><p><strong>{escapeHtml(getPlanName(activeSession))}</strong></p><p>logs.lengthexerciseslogged⋅{logs.length} exercises logged · logs.lengthexerciseslogged⋅{totalTime.toFixed(1)} total minutes</p><table class="history-table today-table"><thead><tr><th>Exercise</th><th>Type</th><th>Score</th><th>Performance</th><th>Time</th></tr></thead><tbody>{logs.map(l => `{escapeHtml(getRoutineName(l))}{(l.tableId || l.venueTable) ? `
{escapeHtml(getTableName(l))}</span> : ""}</td><td>${escapeHtml(l.category || "")}</td><td>${displayScore(l)}</td><td>${escapeHtml(l.performance || "N/A")}</td><td>${l.timeMinutes} min</td>
).join("")}</tbody></table>`;
("sessionSummary").classList.remove("hidden");data.sessions=data.sessions∣∣[];constexistingIdx=data.sessions.findIndex(s=>s.id===activeSession.id);constcompletedSessionId=activeSession.id;constsessionRecord=id:activeSession.id,name:getPlanName(activeSession),planNameSnapshot:activeSession.planName,planId:activeSession.planId∣∣"",type:activeSession.type,tableId:activeSession.tableId∣∣"",venueTable:getTableName(activeSession.tableId)∣∣activeSession.venueTable∣∣"",venueTableSnapshot:getTableName(activeSession.tableId)∣∣activeSession.venueTable∣∣"",tableNote:tableById(activeSession.tableId)?.info∣∣activeSession.tableNote∣∣"",startedAt:activeSession.startedAt,endedAt:newDate().toISOString(),logIds:logs.map(l=>l.id);if(existingIdx>=0)data.sessions[existingIdx]=sessionRecord;elsedata.sessions.push(sessionRecord);safeStorageSet(STORAGEKEY,JSON.stringify(data),"startupsave");resetTimerState();activeSession=null;clearPersistedActiveSession();updateSessionFocusState?.();document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));("sessionSummary").classList.remove("hidden");
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
  activeSession = null;
  clearPersistedActiveSession();
  updateSessionFocusState?.();
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  ("sessionSummary").classList.remove("hidden");data.sessions=data.sessions∣∣[];constexistingIdx=data.sessions.findIndex(s=>s.id===activeSession.id);constcompletedSessionId=activeSession.id;constsessionRecord=id:activeSession.id,name:getPlanName(activeSession),planNameSnapshot:activeSession.planName,planId:activeSession.planId∣∣"",type:activeSession.type,tableId:activeSession.tableId∣∣"",venueTable:getTableName(activeSession.tableId)∣∣activeSession.venueTable∣∣"",venueTableSnapshot:getTableName(activeSession.tableId)∣∣activeSession.venueTable∣∣"",tableNote:tableById(activeSession.tableId)?.info∣∣activeSession.tableNote∣∣"",startedAt:activeSession.startedAt,endedAt:newDate().toISOString(),logIds:logs.map(l=>l.id);if(existingIdx>=0)data.sessions[existingIdx]=sessionRecord;elsedata.sessions.push(sessionRecord);safeStorageSet(STORAGEK​EY,JSON.stringify(data),"startupsave");resetTimerState();activeSession=null;clearPersistedActiveSession();updateSessionFocusState?.();document.querySelectorAll(".panel").forEach(p=>p.classList.remove("active"));("practice")?.classList.add("active");
document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
document.querySelector('.tab[data-tab="practice"]')?.classList.add("active");
renderToday();
openReflectionModal(completedSessionId);
renderStats();
}
function getElapsedMs() { return elapsedBeforeStartMs + (timerStartMs ? Date.now() - timerStartMs : 0); }
function getElapsedMinutes() { return Math.round((getElapsedMs() / 60000) * 10) / 10; }
function resetTimerState() { stopTimer(); timerStartMs = null; elapsedBeforeStartMs = 0; updateTimerDisplay(); }
("timerStartBtn").addEventListener("click", () => {
  if (timerStartMs) return;
  timerStartMs = Date.now();
  timerInterval = setInterval(updateTimerDisplay, 250);
  ("timerState").textContent = "timer running";
updateTimerDisplay();
});
("timerPauseBtn").addEventListener("click", () => {
  if (!timerStartMs) return;
  elapsedBeforeStartMs += Date.now() - timerStartMs;
  timerStartMs = null;
  stopTimer();
  ("timerState").textContent = "timer paused";
updateTimerDisplay();
});
("timerResetBtn").addEventListener("click", resetTimerState);
function stopTimer() { if (timerInterval) clearInterval(timerInterval); timerInterval = null; }
function updateTimerDisplay() {
  const totalSeconds = Math.floor(getElapsedMs() / 1000);
  const mins = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const secs = (totalSeconds % 60).toString().padStart(2, "0");
  ("timerDisplay").textContent = ${mins}:${secs}
;
if (!timerStartMs && getElapsedMs() === 0) ("timerState").textContent = "timer stopped";
}
function displayScore(l) {
  if (l.scoring === "progressive_completion") return `{l.score}/l.totalUnits∣∣"?"{l.totalUnits || "?"} l.totalUnits∣∣"?"{l.unitType || "units"} avg (Number(l.normalizedScore∣∣0).toFixed(1){Number(l.normalizedScore || 0).toFixed(1)}%)Number(l.normalizedScore∣∣0).toFixed(1){l.targetColour ? " · "+fmtTargetColour(l.targetColour) : ""}l.bestAttempt?"⋅best"+l.bestAttempt:""{l.bestAttempt ? " · best "+l.bestAttempt : ""}l.bestAttempt?"⋅best"+l.bestAttempt:""{l.highestBreak ? " · break "+l.highestBreak : ""};
  if (l.scoring === "success_rate") return 
l.score/{l.score}/l.score/{l.attempts} (Number(l.normalizedScore∣∣0).toFixed(1)if(l.scoring==="scoreperminute")return‘{Number(l.normalizedScore || 0).toFixed(1)}%)`;
  if (l.scoring === "score_per_minute") return `Number(l.normalizedScore∣∣0).toFixed(1)if(l.scoring==="scorep​erm​inute")return‘{l.score} (Number(l.normalizedScore∣∣0).toFixed(2)/min)‘;return‘{Number(l.normalizedScore || 0).toFixed(2)}/min)`;
  return `Number(l.normalizedScore∣∣0).toFixed(2)/min)‘;return‘{l.score}`;
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
label = Week of ${localDateKey(start)}
;
} else if (period === "monthly") {
start = new Date(d.getFullYear(), d.getMonth(), 1);
end = new Date(d.getFullYear(), d.getMonth()+1, 1);
label = ${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}
;
} else if (period === "yearly") {
start = new Date(d.getFullYear(), 0, 1);
end = new Date(d.getFullYear()+1, 0, 1);
label = ${d.getFullYear()}
;
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
} else if (period === "monthly") key = ${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}
;
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
if (delta > 7.5) return Improving (+${delta.toFixed(1)}% vs prior ${windowSize})
;
if (delta < -7.5) return Declining (${delta.toFixed(1)}% vs prior ${windowSize})
;
return Stable (${delta.toFixed(1)}% vs prior ${windowSize})
;
}
function benchmarkText(values, windowSize) {
if (!values.length) return "No data";
const latest = values[values.length-1];
const baseline = values.length > 1 ? avg(values.slice(Math.max(0, values.length-windowSize-1), -1)) : latest;
if (!baseline) return "No baseline";
const delta = ((latest - baseline) / Math.abs(baseline)) * 100;
return ${latest.toFixed(2)} latest vs ${baseline.toFixed(2)} personal baseline (${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%)
;
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
("generateConstraintPlanBtn").addEventListener("click", () => {
  const total = Number(("constraintTotalMinutes").value || 60);
const count = Math.max(1, Number(("constraintExerciseCount").value∣∣4));constfocus=("constraintExerciseCount").value || 4));
  const focus = ("constraintExerciseCount").value∣∣4));constfocus=("constraintFocusType").value || "all";
const allocs = [
{key:"potting", pct:Number(("allocPotting").value || 0)},
    {key:"break-building", pct:Number(("allocBreak").value || 0)},
{key:"other", pct:Number(("allocOther").value || 0)}
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
  if (!("planName").value.trim()) ("planName").value=‘Generated("planName").value = `Generated ("planName").value=‘Generated{total} min session — ${new Date().toLocaleDateString()}`;
renderPlanBuilder();
});
let pendingReflectionSessionId = "";
function anchorRoutines() {
return (data.routines || []).filter(r => r.isAnchor);
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
return <div class="review-box"><h3>Anchor drill baseline ${statHelpButton("anchorBaseline")}</h3>${rows.map(row => 
<div class="reflection-row"><strong>escapeHtml(row.name)</strong>:{escapeHtml(row.name)}</strong>: escapeHtml(row.name)</strong>:{row.todayAvg === null ? "not logged in this view" : row.todayAvg.toFixed(1)}${row.baseline === null ? "" : " vs baseline "+row.baseline.toFixed(1)}</div>).join("")}</div>
;
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
const box = ("trainingLoadBox");if(!box)return;constload=trainingLoadByDay(14);constmax=Math.max(1,...load.map(d=>d.time));consttotal7=load.slice(−7).reduce((a,b)=>a+b.time,0);constprev7=load.slice(0,7).reduce((a,b)=>a+b.time,0);constdelta=prev7?((total7−prev7)/Math.abs(prev7))∗100:null;box.innerHTML=‘<divclass="load−card"><h3>Trainingload—last14days("trainingLoadBox");
  if (!box) return;
  const load = trainingLoadByDay(14);
  const max = Math.max(1, ...load.map(d=>d.time));
  const total7 = load.slice(-7).reduce((a,b)=>a+b.time,0);
  const prev7 = load.slice(0,7).reduce((a,b)=>a+b.time,0);
  const delta = prev7 ? ((total7-prev7)/Math.abs(prev7))*100 : null;
  box.innerHTML = `<div class="load-card"><h3>Training load — last 14 days ("trainingLoadBox");if(!box)return;constload=trainingLoadByDay(14);constmax=Math.max(1,...load.map(d=>d.time));consttotal7=load.slice(−7).reduce((a,b)=>a+b.time,0);constprev7=load.slice(0,7).reduce((a,b)=>a+b.time,0);constdelta=prev7?((total7−prev7)/Math.abs(prev7))∗100:null;box.innerHTML=‘<divclass="load−card"><h3>Trainingload—last14days{statHelpButton("trainingLoad")}</h3>
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
}function formatDurationHuman(minutes) {
const m = Math.round(Number(minutes || 0));
if (!m) return "0 min";
const h = Math.floor(m / 60);
const rem = m % 60;
if (!h) return ${rem} min
;
if (!rem) return ${h}h
;
return ${h}h ${rem}m
;
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
async function renderExportFolderStatus(){ const el=("exportFolderStatus");if(!el)return;if(!supportsExportFolderPicker())el.className="analytics−noteexport−folder−fallback";el.innerHTML="Folderexportisnotsupportedbythisbrowser.FileswillusenormalDownloads.";return;consthandle=awaitgetExportFolderHandle();if(!handle)el.className="analytics−noteexport−folder−fallback";el.innerHTML="Exportfoldernotselected.FileswillusenormalDownloads.";return;constname=localStorage.getItem("snookerPracticePWA.exportFolderName")∣∣handle.name∣∣"Selectedfolder";el.className="analytics−noteexport−folder−ok";el.innerHTML=‘Selectedexportfolder:<strong>("exportFolderStatus"); if(!el) return; if(!supportsExportFolderPicker()){ el.className="analytics-note export-folder-fallback"; el.innerHTML="Folder export is not supported by this browser. Files will use normal Downloads."; return; } const handle=await getExportFolderHandle(); if(!handle){ el.className="analytics-note export-folder-fallback"; el.innerHTML="Export folder not selected. Files will use normal Downloads."; return; } const name=localStorage.getItem("snookerPracticePWA.exportFolderName") || handle.name || "Selected folder"; el.className="analytics-note export-folder-ok"; el.innerHTML=`Selected export folder: <strong>("exportFolderStatus");if(!el)return;if(!supportsExportFolderPicker())el.className="analytics−noteexport−folder−fallback";el.innerHTML="Folderexportisnotsupportedbythisbrowser.FileswillusenormalDownloads.";return;consthandle=awaitgetExportFolderHandle();if(!handle)el.className="analytics−noteexport−folder−fallback";el.innerHTML="Exportfoldernotselected.FileswillusenormalDownloads.";return;constname=localStorage.getItem("snookerPracticePWA.exportFolderName")∣∣handle.name∣∣"Selectedfolder";el.className="analytics−noteexport−folder−ok";el.innerHTML=‘Selectedexportfolder:<strong>{escapeHtml(name)}</strong>.`; }
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
function renderTableSelects(){ ensureTablesDatabase(); const sel=("sessionVenueTable");if(!sel)return;constcurrent=sel.value∣∣getLastTableId()∣∣"";sel.innerHTML=‘<optionvalue="">Notspecified</option>‘+data.tables.map(t=>‘<optionvalue="("sessionVenueTable"); if(!sel) return; const current=sel.value||getLastTableId()||""; sel.innerHTML=`<option value="">Not specified</option>`+data.tables.map(t=>`<option value="("sessionVenueTable");if(!sel)return;constcurrent=sel.value∣∣getLastTableId()∣∣"";sel.innerHTML=‘<optionvalue="">Notspecified</option>‘+data.tables.map(t=>‘<optionvalue="{escapeAttr(t.id)}">{escapeHtml(t.name)}`).join(""); sel.value=current&&data.tables.some(t=>t.id===current)?current:""; }
function clearTableForm(){ if(!("tableNameInput")) return; ("tableEditId").value="";("tableEditId").value=""; ("tableEditId").value="";("tableNameInput").value=""; ("tableTypeInput").value="";("tableTypeInput").value=""; ("tableTypeInput").value="";("tableInfoInput").value=""; }
function saveTableDefinition(){ ensureTablesDatabase(); const name=("tableNameInput").value.trim();if(!name)returnalert("Enteratablename.");constid=("tableNameInput").value.trim(); if(!name) return alert("Enter a table name."); const id=("tableNameInput").value.trim();if(!name)returnalert("Enteratablename.");constid=("tableEditId").value||uuid(); const existing=data.tables.find(t=>t.id===id); const table={id,name,type:("tableTypeInput").value.trim(),info:("tableTypeInput").value.trim(),info:("tableTypeInput").value.trim(),info:("tableInfoInput").value.trim(),createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),nameHistory:existing?.nameHistory||[]}; if(existing&&existing.name!==name)table.nameHistory.push({name:existing.name,changedAt:new Date().toISOString()}); data.tables=existing?data.tables.map(t=>t.id===id?table:t):[...data.tables,table]; clearTableForm(); saveData(); }
function editTableDefinition(id){ const t=tableById(id); if(!t)return; ("tableEditId").value=t.id;("tableEditId").value=t.id; ("tableEditId").value=t.id;("tableNameInput").value=t.name||""; ("tableTypeInput").value=t.type∣∣"";("tableTypeInput").value=t.type||""; ("tableTypeInput").value=t.type∣∣"";("tableInfoInput").value=t.info||""; }
function deleteTableDefinition(id){ const used=(data.logs||[]).some(l=>l.tableId===id); if(used)return alert("This table is used by logs. Rename it instead of deleting so historical stats remain linked."); if(!confirm("Delete this table definition?"))return; data.tables=(data.tables||[]).filter(t=>t.id!==id); saveData(); }
function renderEditTableOptions(currentId,currentName=""){ ensureTablesDatabase(); const selectedId=currentId||tableByName(currentName)?.id||""; return <option value="">Not specified</option>
+data.tables.map(t=><option value="${escapeAttr(t.id)}" ${t.id===selectedId?"selected":""}>${escapeHtml(t.name)}</option>
).join(""); }
function renderTableDatabase(){ const box=("tableList");if(!box)return;ensureTablesDatabase();box.innerHTML=(data.tables∣∣[]).map(t=>‘<divclass="table−db−row"><div><strong>("tableList"); if(!box)return; ensureTablesDatabase(); box.innerHTML=(data.tables||[]).map(t=>`<div class="table-db-row"><div><strong>("tableList");if(!box)return;ensureTablesDatabase();box.innerHTML=(data.tables∣∣[]).map(t=>‘<divclass="table−db−row"><div><strong>{escapeHtml(t.name)}</strong><div class="meta">escapeHtml(t.type∣∣"Notype")⋅{escapeHtml(t.type||"No type")} · escapeHtml(t.type∣∣"Notype")⋅{escapeHtml(t.info||"No info")}</div>{(t.nameHistory||[]).length?`Previous names: 
{(t.nameHistory||[]).map(x=>escapeHtml(x.name)).join(", ")}</div>:""}</div><div class="small-actions"><button class="secondary" onclick="editTableDefinition('${t.id}')">Edit</button><button class="secondary" onclick="deleteTableDefinition('${t.id}')">Delete</button></div></div>
).join(""); }
function analyticsHelp(title,measures,calc,interpret,use){ return <div class="help-rich"><p><strong>What it measures:</strong> ${measures}</p><p><strong>How calculated:</strong> ${calc}</p><p><strong>How to interpret:</strong> ${interpret}</p><div class="example"><strong>Typical use:</strong> ${use}</div></div>
; }
let adaptivePlanDraft = [];
function getPeriodizationPhase() {
const manual = $("periodizationPhase")?.value || "auto";
if (manual !== "auto") return manual;
const comp = ("competitionDate")?.value?newDate(("competitionDate")?.value ? new Date(("competitionDate")?.value?newDate(("competitionDate").value) : null;
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
const upgrades = (data.routines || []).some(r => targetUpgradeSuggestionForRoutine(r.id));
if (upgrades) return "performance";
const unstable = (data.routines || []).some(r => {
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
mix:"More anchor drills and repeated setups; fewer