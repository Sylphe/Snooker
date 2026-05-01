const STORAGE_KEY = "snookerPracticePWA.v3";
const OLD_KEYS = ["snookerPracticePWA.v1", "snookerPracticePWA.v2"];
const APP_VERSION = "3.2-final";

const defaultData = {
  appVersion: APP_VERSION,
  routines: [
    { id: crypto.randomUUID(), name: "Line-up", scoring: "raw", attempts: "", duration: 20, target: 50, category: "break-building", folder: "Break-building", subfolder: "Line-up", description: "Standard line-up drill. Log highest continuous score or agreed score metric." },
    { id: crypto.randomUUID(), name: "Long potting — 10 attempts", scoring: "success_rate", attempts: 10, duration: 10, target: 7, category: "potting", folder: "Potting", subfolder: "Long pots", description: "Ten long pots. Log made balls out of attempts." },
    { id: crypto.randomUUID(), name: "Black from spot", scoring: "success_rate", attempts: 10, duration: 10, target: 8, category: "potting", folder: "Potting", subfolder: "Colours", description: "Ten black-ball attempts from defined cue-ball positions." },
    { id: crypto.randomUUID(), name: "Safety drill", scoring: "points", attempts: "", duration: 15, target: 10, category: "safety", folder: "Safety", subfolder: "General", description: "Use a points system, e.g. +1 good leave, -1 poor leave." }
  ],
  plans: [],
  logs: []
};

let data = loadData();
let planDraft = [];
let activeSession = null;
let timerInterval = null;
let timerStartMs = null;
let elapsedBeforeStartMs = 0;
let deferredInstallPrompt = null;

function $(id) { return document.getElementById(id); }

function migrateData(d) {
  d.appVersion = APP_VERSION;
  d.routines = (d.routines || []).map(r => ({
    ...r,
    folder: r.folder || r.category || "Unfiled",
    subfolder: r.subfolder || "General",
    category: r.category || "uncategorized"
  }));
  d.plans = d.plans || [];
  d.logs = (d.logs || []).map(l => ({
    sessionId: l.sessionId || crypto.randomUUID(),
    sessionName: l.sessionName || "Legacy session",
    sessionType: l.sessionType || "plan",
    folder: l.folder || "Unfiled",
    subfolder: l.subfolder || "General",
    category: l.category || "uncategorized",
    ...l
  }));
  return d;
}

function loadData() {
  let raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    for (const k of OLD_KEYS) {
      const old = localStorage.getItem(k);
      if (old) { raw = old; break; }
    }
  }
  if (!raw) {
    const seeded = structuredClone(defaultData);
    seeded.plans.push({ id: crypto.randomUUID(), name: "Default 60 min practice", routineIds: seeded.routines.map(r => r.id), createdAt: new Date().toISOString() });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  const parsed = migrateData(JSON.parse(raw));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  return parsed;
}

function saveData() {
  data.appVersion = APP_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderAll();
}

function fmtScoring(type) {
  return ({ raw:"Raw score", success_rate:"Success rate", highest_break:"Highest break", points:"Points system", score_per_minute:"Time-based score" })[type] || type;
}
function categories() { return [...new Set(data.routines.map(r => r.category || "uncategorized"))].sort(); }
function folders() { return [...new Set(data.routines.map(r => r.folder || "Unfiled"))].sort(); }
function subfolders() { return [...new Set(data.routines.map(r => r.subfolder || "General"))].sort(); }
function routineById(id) { return data.routines.find(r => r.id === id); }
function normalizeScore(log) {
  if (log.scoring === "success_rate") return log.attempts > 0 ? (log.score / log.attempts) * 100 : 0;
  if (log.scoring === "score_per_minute") return log.timeMinutes > 0 ? log.score / log.timeMinutes : 0;
  return Number(log.score || 0);
}
function avg(arr) { return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0; }
function stdDev(arr) { if (arr.length < 2) return 0; const m=avg(arr); return Math.sqrt(avg(arr.map(x=>Math.pow(x-m,2)))); }
function trendLabel(values) {
  if (values.length < 4) return "Not enough data yet";
  const recent = avg(values.slice(-3));
  const prior = avg(values.slice(0,-3));
  if (prior === 0) return "Not enough baseline";
  const delta = ((recent - prior) / Math.abs(prior)) * 100;
  if (delta > 7.5) return `Improving (+${delta.toFixed(1)}% vs prior average)`;
  if (delta < -7.5) return `Declining (${delta.toFixed(1)}% vs prior average)`;
  return `Stable (${delta.toFixed(1)}% vs prior average)`;
}
function localDateKey(dateLike = new Date()) {
  const d = new Date(dateLike);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
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
  select.innerHTML = `<option value="all">${allLabel}</option>` + values.map(v => `<option value="${escapeAttr(v)}">${escapeHtml(v)}</option>`).join("");
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
}

function renderRoutineSelects() {
  const cats = categories(), flds = folders(), subs = subfolders();

  setSelectOptions($("routineCategorySelect"), cats, "Select existing type/category", $("routineCategorySelect").value || "all");
  setSelectOptions($("routineFolderSelect"), flds, "Select existing folder", $("routineFolderSelect").value || "all");
  setSelectOptions($("routineSubfolderSelect"), subs, "Select existing subfolder", $("routineSubfolderSelect").value || "all");

  setSelectOptions($("exerciseTypeFilter"), cats, "All types", $("exerciseTypeFilter").value || "all");
  setSelectOptions($("exerciseFolderFilter"), flds, "All folders", $("exerciseFolderFilter").value || "all");
  setSelectOptions($("planTypeFilter"), cats, "All types", $("planTypeFilter").value || "all");
  setSelectOptions($("planFolderFilter"), flds, "All folders", $("planFolderFilter").value || "all");
  setSelectOptions($("randomTypeFilter"), cats, "All types", $("randomTypeFilter").value || "all");
  setSelectOptions($("randomFolderFilter"), flds, "All folders", $("randomFolderFilter").value || "all");

  const planPickerRoutines = visibleRoutines($("planTypeFilter").value || "all", $("planFolderFilter").value || "all");
  $("routineToAdd").innerHTML = planPickerRoutines.map(r => `<option value="${r.id}">${escapeHtml(r.folder || "Unfiled")} / ${escapeHtml(r.subfolder || "General")} — ${escapeHtml(r.name)}</option>`).join("") || `<option value="">No matching exercises</option>`;

  const allRoutineOptions = visibleRoutines().map(r => `<option value="${r.id}">${escapeHtml(r.name)} — ${fmtScoring(r.scoring)}</option>`).join("");
  $("freeRoutineSelect").innerHTML = allRoutineOptions || `<option value="">No exercises yet</option>`;
  $("nextFreeRoutineSelect").innerHTML = allRoutineOptions || `<option value="">No exercises yet</option>`;

  $("planSelect").innerHTML = data.plans.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("") || `<option value="">No plans yet</option>`;
  $("statsRoutineSelect").innerHTML = data.routines.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("") || `<option value="">No exercises yet</option>`;

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
    ${r.target ? `<span class="badge">Target: ${r.target}</span>` : ""}
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
  $("routineTarget").value = r.target || "";
  $("routineDescription").value = r.description || "";
  document.querySelector('[data-tab="templates"]').click();
  window.scrollTo({top: 0, behavior: "smooth"});
}

function clearRoutineForm() {
  $("routineFormTitle").textContent = "Create exercise";
  $("routineEditId").value = "";
  ["routineName","routineCategoryNew","routineFolderNew","routineSubfolderNew","routineAttempts","routineDuration","routineTarget","routineDescription"].forEach(id => $(id).value = "");
  $("routineScoring").value = "raw";
  $("routineCategorySelect").value = "all";
  $("routineFolderSelect").value = "all";
  $("routineSubfolderSelect").value = "all";
}
$("clearRoutineFormBtn").addEventListener("click", clearRoutineForm);

function duplicateRoutine(id) {
  const r = routineById(id);
  if (!r) return;
  data.routines.push({...r, id: crypto.randomUUID(), name: `${r.name} copy`});
  saveData();
}
function deleteRoutine(id) {
  if (!confirm("Delete this exercise template? Existing historical logs will remain.")) return;
  data.routines = data.routines.filter(r => r.id !== id);
  data.plans = data.plans.map(p => ({...p, routineIds: p.routineIds.filter(rid => rid !== id)}));
  saveData();
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
    id: $("routineEditId").value || crypto.randomUUID(),
    name,
    scoring: $("routineScoring").value,
    attempts: Number($("routineAttempts").value || 0) || "",
    duration: Number($("routineDuration").value || 0) || "",
    target: Number($("routineTarget").value || 0) || "",
    category,
    folder,
    subfolder,
    description: $("routineDescription").value.trim()
  };

  if ($("routineEditId").value) data.routines = data.routines.map(r => r.id === routine.id ? routine : r);
  else data.routines.push(routine);

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
  data.plans.push({id: crypto.randomUUID(), name, routineIds: [...planDraft], createdAt: new Date().toISOString()});
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
  if (!confirm("Delete this training plan?")) return;
  data.plans = data.plans.filter(p => p.id !== id);
  saveData();
}

$("startSessionBtn").addEventListener("click", () => {
  const plan = data.plans.find(p => p.id === $("planSelect").value);
  if (!plan) return alert("Create or select a plan first.");
  activeSession = { id: crypto.randomUUID(), type: "plan", planId: plan.id, planName: plan.name, routineIds: plan.routineIds.filter(id => data.routines.some(r => r.id === id)), index: 0, startedAt: new Date().toISOString(), completedLogs: [] };
  startRoutineScreen();
});
$("startFreeSessionBtn").addEventListener("click", () => {
  const rid = $("freeRoutineSelect").value;
  if (!rid) return alert("Create at least one exercise first.");
  activeSession = { id: crypto.randomUUID(), type: "free", planName: `Free training — ${new Date().toLocaleDateString()}`, routineIds: [rid], index: 0, startedAt: new Date().toISOString(), completedLogs: [] };
  startRoutineScreen();
});
function startRoutineScreen() {
  resetTimerState();
  $("sessionSummary").classList.add("hidden");
  $("freeNextCard").classList.add("hidden");
  $("activeSession").classList.remove("hidden");
  renderCurrentRoutine();
}
$("resetSessionBtn").addEventListener("click", () => {
  activeSession = null;
  stopTimer();
  resetTimerState();
  $("activeSession").classList.add("hidden");
  $("freeNextCard").classList.add("hidden");
  $("sessionSummary").classList.add("hidden");
});
function renderCurrentRoutine() {
  if (!activeSession || activeSession.index >= activeSession.routineIds.length) return completeSession();
  const r = routineById(activeSession.routineIds[activeSession.index]);
  if (!r) return;
  $("currentRoutineName").textContent = r.name;
  const sessionTxt = activeSession.type === "free" ? "Free training" : `${activeSession.index + 1}/${activeSession.routineIds.length}`;
  $("currentRoutineMeta").textContent = `${sessionTxt} · ${fmtScoring(r.scoring)} · target ${r.target || "n/a"} · default ${r.duration || 0} min · ${r.folder || "Unfiled"} / ${r.subfolder || "General"}`;
  $("practiceNotes").value = "";
  if (r.description) { $("routineDescriptionBox").textContent = r.description; $("routineDescriptionBox").classList.remove("hidden"); }
  else $("routineDescriptionBox").classList.add("hidden");
  resetTimerState();
  renderScoreInputs(r);
  $("saveNextBtn").textContent = activeSession.type === "free" ? "Save Routine" : "Save & Next";
  $("skipBtn").classList.toggle("hidden", activeSession.type === "free");
  $("endFreeSessionBtn").classList.toggle("hidden", activeSession.type !== "free");
}
function renderScoreInputs(r) {
  let html = "";
  if (r.scoring === "success_rate") {
    html += `<div><label>Made</label><input id="scoreValue" type="number" min="0" step="1" placeholder="e.g. 7"></div>`;
    html += `<div><label>Attempts</label><input id="attemptsValue" type="number" min="1" step="1" value="${r.attempts || ""}" placeholder="e.g. 10"></div>`;
    html += `<div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty"></div>`;
  } else {
    html += `<div><label>Score</label><input id="scoreValue" type="number" step="0.01" placeholder="Enter score"></div>`;
    html += `<div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty"></div>`;
  }
  $("scoreInputs").innerHTML = html;
}
$("saveNextBtn").addEventListener("click", saveCurrentRoutine);
$("skipBtn").addEventListener("click", () => { if (!activeSession) return; activeSession.index += 1; stopTimer(); renderCurrentRoutine(); });
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
  const attempts = r.scoring === "success_rate" ? Number($("attemptsValue")?.value || 0) : Number(r.attempts || 0);
  const manualTime = Number($("manualTimeValue")?.value || 0);
  const timerMinutes = getElapsedMinutes();
  const timeMinutes = manualTime || timerMinutes || Number(r.duration || 0);

  if (r.scoring === "success_rate" && attempts <= 0) return alert("Enter attempts.");
  if (Number.isNaN(score)) return alert("Enter a valid score.");

  const log = {
    id: crypto.randomUUID(),
    sessionId: activeSession.id,
    sessionName: activeSession.planName,
    sessionType: activeSession.type,
    routineId: r.id,
    routineName: r.name,
    folder: r.folder || "Unfiled",
    subfolder: r.subfolder || "General",
    category: r.category || "uncategorized",
    scoring: r.scoring,
    score,
    attempts,
    timeMinutes: Math.round(timeMinutes * 10) / 10,
    normalizedScore: 0,
    notes: $("practiceNotes").value.trim(),
    createdAt: new Date().toISOString()
  };
  log.normalizedScore = normalizeScore(log);
  data.logs.push(log);
  activeSession.completedLogs.push(log);
  stopTimer();

  if (activeSession.type === "free") {
    saveData();
    $("activeSession").classList.add("hidden");
    $("freeNextCard").classList.remove("hidden");
  } else {
    activeSession.index += 1;
    saveData();
    renderCurrentRoutine();
  }
}
function completeSession() {
  if (!activeSession) return;
  stopTimer();
  $("activeSession").classList.add("hidden");
  $("freeNextCard").classList.add("hidden");
  const logs = activeSession.completedLogs || data.logs.filter(l => l.sessionId === activeSession.id);
  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  $("sessionSummary").innerHTML = `<h2>Session complete</h2><p><strong>${escapeHtml(activeSession.planName)}</strong></p><p>${logs.length} exercises logged · ${totalTime.toFixed(1)} total minutes</p><table class="history-table"><thead><tr><th>Exercise</th><th>Type</th><th>Score</th><th>Normalized</th><th>Time</th></tr></thead><tbody>${logs.map(l => `<tr><td>${escapeHtml(l.routineName)}</td><td>${escapeHtml(l.category || "")}</td><td>${displayScore(l)}</td><td>${Number(l.normalizedScore || 0).toFixed(2)}</td><td>${l.timeMinutes} min</td></tr>`).join("")}</tbody></table>`;
  $("sessionSummary").classList.remove("hidden");
  activeSession = null;
  renderToday();
  renderStats();
}

function getElapsedMs() { return elapsedBeforeStartMs + (timerStartMs ? Date.now() - timerStartMs : 0); }
function getElapsedMinutes() { return Math.round((getElapsedMs() / 60000) * 10) / 10; }
function resetTimerState() { stopTimer(); timerStartMs = null; elapsedBeforeStartMs = 0; updateTimerDisplay(); }
$("timerStartBtn").addEventListener("click", () => {
  if (timerStartMs) return;
  timerStartMs = Date.now();
  timerInterval = setInterval(updateTimerDisplay, 250);
  $("timerState").textContent = "timer running";
  updateTimerDisplay();
});
$("timerPauseBtn").addEventListener("click", () => {
  if (!timerStartMs) return;
  elapsedBeforeStartMs += Date.now() - timerStartMs;
  timerStartMs = null;
  stopTimer();
  $("timerState").textContent = "timer paused";
  updateTimerDisplay();
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
  if (l.scoring === "success_rate") return `${l.score}/${l.attempts} (${Number(l.normalizedScore || 0).toFixed(1)}%)`;
  if (l.scoring === "score_per_minute") return `${l.score} (${Number(l.normalizedScore || 0).toFixed(2)}/min)`;
  return `${l.score}`;
}

$("statsRoutineSelect").addEventListener("change", renderStats);
$("statsDateSelect").addEventListener("change", renderStats);
$("statsPeriodSelect").addEventListener("change", renderStats);
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
    end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    label = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
  } else if (period === "yearly") {
    start = new Date(d.getFullYear(), 0, 1);
    end = new Date(d.getFullYear() + 1, 0, 1);
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
    } else if (period === "monthly") {
      key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    } else if (period === "yearly") {
      key = String(d.getFullYear());
    } else {
      key = localDateKey(d);
    }
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

function renderStats() {
  const period = $("statsPeriodSelect").value || "daily";
  const rid = $("statsRoutineSelect").value;
  const dateKey = $("statsDateSelect").value || localDateKey();
  const range = getPeriodRange(period, dateKey);

  let scopedLogs = period === "overall" ? data.logs.slice() : logsInRange(data.logs, range.start, range.end);
  scopedLogs = scopedLogs.sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));

  let html = `<h3>${period === "exercise" ? "Per exercise view" : "Training view"} — ${escapeHtml(range.label)}</h3>`;
  html += renderDateView(scopedLogs);

  if (scopedLogs.length) {
    html += `<h3>Volume chart</h3>${renderVolumeChart(bucketLogs(scopedLogs, period === "overall" ? "monthly" : period), "time", "Training time")}`;
    html += `<h3>Exercise mix</h3>${renderCategoryChart(scopedLogs)}`;
  }

  if (period === "exercise" && rid) {
    const exerciseLogs = data.logs.filter(l => l.routineId === rid).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
    html += renderExerciseProgression(exerciseLogs);
  } else if (rid) {
    const exerciseLogs = scopedLogs.filter(l => l.routineId === rid);
    if (exerciseLogs.length) html += renderExerciseProgression(exerciseLogs);
  }

  $("statsOutput").innerHTML = html;
}

function renderExerciseProgression(logs) {
  if (!logs.length) return `<h3>Routine progression</h3><p>No logs for this exercise in the selected view.</p>`;
  const vals = logs.map(l => Number(l.normalizedScore || 0));
  const last5 = vals.slice(-5);
  const best = Math.max(...vals);
  const latest = vals[vals.length - 1];
  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);

  return `<h3>Routine progression</h3><div class="stats-grid">
    <div class="stat-card"><span>Latest</span><div class="value">${latest.toFixed(2)}</div></div>
    <div class="stat-card"><span>Average</span><div class="value">${avg(vals).toFixed(2)}</div></div>
    <div class="stat-card"><span>Best</span><div class="value">${best.toFixed(2)}</div></div>
    <div class="stat-card"><span>Last 5 avg</span><div class="value">${avg(last5).toFixed(2)}</div></div>
    <div class="stat-card"><span>Volatility</span><div class="value">${stdDev(vals).toFixed(2)}</div></div>
    <div class="stat-card"><span>Total time</span><div class="value">${totalTime.toFixed(1)}m</div></div>
  </div><div class="trend">${trendLabel(vals)}</div>${renderChart(logs)}
  <table class="history-table"><thead><tr><th>Date</th><th>Score</th><th>Normalized</th><th>Time</th><th>Notes</th></tr></thead><tbody>${logs.slice(-15).reverse().map(l => `<tr><td>${new Date(l.createdAt).toLocaleDateString()}</td><td>${displayScore(l)}</td><td>${Number(l.normalizedScore || 0).toFixed(2)}</td><td>${l.timeMinutes}m</td><td>${escapeHtml(l.notes || "")}</td></tr>`).join("")}</tbody></table>`;
}

function renderDateView(logs) {
  if (!logs.length) return "<p>No exercises logged for this date.</p>";
  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  const types = {};
  logs.forEach(l => { types[l.category || "uncategorized"] = (types[l.category || "uncategorized"] || 0) + 1; });
  return `<div class="stats-grid">
    <div class="stat-card"><span>Exercises</span><div class="value">${logs.length}</div></div>
    <div class="stat-card"><span>Total time</span><div class="value">${totalTime.toFixed(1)}m</div></div>
    <div class="stat-card"><span>Types</span><div class="value">${Object.keys(types).length}</div></div>
  </div><p>${Object.entries(types).map(([k,v]) => `<span class="badge">${escapeHtml(k)}: ${v}</span>`).join("")}</p>
  <table class="history-table"><thead><tr><th>Time</th><th>Session</th><th>Exercise</th><th>Type</th><th>Score</th><th>Duration</th></tr></thead><tbody>${logs.map(l => `<tr><td>${new Date(l.createdAt).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</td><td>${escapeHtml(l.sessionName || "")}</td><td>${escapeHtml(l.routineName)}</td><td>${escapeHtml(l.category || "")}</td><td>${displayScore(l)}</td><td>${l.timeMinutes}m</td></tr>`).join("")}</tbody></table>`;
}
function renderToday() {
  const today = localDateKey();
  const logs = data.logs.filter(l => sameDate(l, today)).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (!logs.length) { $("todaySummary").innerHTML = "<p>No training logged today yet.</p>"; return; }

  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  const byType = {}, bySession = {};
  logs.forEach(l => {
    byType[l.category || "uncategorized"] = (byType[l.category || "uncategorized"] || 0) + 1;
    bySession[l.sessionId] ||= {name: l.sessionName || "Session", type: l.sessionType || "", logs: []};
    bySession[l.sessionId].logs.push(l);
  });

  $("todaySummary").innerHTML = `<div class="stats-grid">
    <div class="stat-card"><span>Exercises</span><div class="value">${logs.length}</div></div>
    <div class="stat-card"><span>Total time</span><div class="value">${totalTime.toFixed(1)}m</div></div>
    <div class="stat-card"><span>Exercise types</span><div class="value">${Object.keys(byType).length}</div></div>
  </div><p>${Object.entries(byType).map(([k,v]) => `<span class="badge">${escapeHtml(k)}: ${v}</span>`).join("")}</p>
  <h3>Today’s exercise mix</h3>${renderCategoryChart(logs)}
  ${
    Object.values(bySession).map(s => {
      const st = s.logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
      return `<div class="item"><div class="item-title"><strong>${escapeHtml(s.name)}</strong><span class="badge">${s.logs.length} exercises · ${st.toFixed(1)}m</span></div><table class="history-table"><thead><tr><th>Exercise</th><th>Type</th><th>Score</th><th>Time</th></tr></thead><tbody>${s.logs.map(l => `<tr><td>${escapeHtml(l.routineName)}</td><td>${escapeHtml(l.category || "")}</td><td>${displayScore(l)}</td><td>${l.timeMinutes}m</td></tr>`).join("")}</tbody></table></div>`;
    }).join("")
  }`;
}
function renderVolumeChart(buckets, metric, title) {
  if (!buckets.length) return `<div class="chart-wrap"><p class="muted">No data for chart.</p></div>`;
  const w=720,h=260,padL=44,padR=18,padT=20,padB=54;
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
      return `<rect class="chart-bar" x="${x}" y="${y}" width="${barW}" height="${bh}"><title>${b.label}: ${v.toFixed ? v.toFixed(1) : v}</title></rect>`;
    }).join("")}
    ${buckets.filter((_,i)=> i===0 || i===buckets.length-1 || i===Math.floor((buckets.length-1)/2)).map((b,i,arr) => {
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
  const w=720,h=260,padL=120,padR=18,padT=20,padB=28;
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
  const w=720,h=240,padL=44,padR=18,padT=20,padB=42;
  const minY=Math.min(...points.map(p=>p.y)), maxY=Math.max(...points.map(p=>p.y)), yRange=maxY===minY?1:maxY-minY;
  const xScale=i=>padL+(i/Math.max(1,points.length-1))*(w-padL-padR);
  const yScale=y=>padT+(maxY-y)/yRange*(h-padT-padB);
  const path=points.map((p,idx)=>`${idx===0?"M":"L"} ${xScale(p.i).toFixed(1)} ${yScale(p.y).toFixed(1)}`).join(" ");
  const yTicks=[0,.25,.5,.75,1].map(t=>minY+yRange*t);
  const xLabels=points.filter((_,i)=>i===0||i===points.length-1||i===Math.floor((points.length-1)/2));
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${yTicks.map(y=>`<line class="chart-grid" x1="${padL}" x2="${w-padR}" y1="${yScale(y)}" y2="${yScale(y)}"></line>`).join("")}<line class="chart-axis" x1="${padL}" x2="${padL}" y1="${padT}" y2="${h-padB}"></line><line class="chart-axis" x1="${padL}" x2="${w-padR}" y1="${h-padB}" y2="${h-padB}"></line><path class="chart-line" d="${path}"></path>${points.map(p=>`<circle class="chart-point" cx="${xScale(p.i)}" cy="${yScale(p.y)}" r="4"><title>${p.label}: ${p.y.toFixed(2)}</title></circle>`).join("")}${yTicks.map(y=>`<text class="chart-label" x="5" y="${yScale(y)+4}">${y.toFixed(1)}</text>`).join("")}${xLabels.map(p=>`<text class="chart-label" x="${xScale(p.i)-28}" y="${h-15}">${p.label.slice(5)}</text>`).join("")}</svg></div>`;
}

$("exportCsvBtn").addEventListener("click", () => {
  const headers = ["createdAt","sessionName","sessionType","routineName","routineId","folder","subfolder","category","scoring","score","attempts","timeMinutes","normalizedScore","notes"];
  const rows = [headers.join(",")].concat(data.logs.map(l => headers.map(h => csvEscape(l[h] ?? "")).join(",")));
  downloadFile("snooker-practice-logs.csv", rows.join("\n"), "text/csv");
});
$("exportJsonBtn").addEventListener("click", () => downloadFile("snooker-practice-backup.json", JSON.stringify(data,null,2), "application/json"));
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
function csvEscape(value) { return `"${String(value).replaceAll('"','""')}"`; }
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }
function escapeAttr(str) { return escapeHtml(str).replaceAll("`","&#096;"); }

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
      const reg = await navigator.serviceWorker.register("service-worker.js?v=3.2");
      if (reg && reg.update) reg.update();
    } catch(e) {
      console.warn("Service worker registration failed", e);
    }
  });
}

renderAll();
