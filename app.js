const STORAGE_KEY = "snookerPracticePWA.v3";
const OLD_KEYS = ["snookerPracticePWA.v1", "snookerPracticePWA.v2"];
const APP_VERSION = "3.13-final";

const defaultData = {
  appVersion: APP_VERSION,
  routines: [
    {
      id: crypto.randomUUID(), name: "Line-up", scoring: "raw", attempts: "", duration: 20, target: 50, stretchTarget: 65,
      category: "break-building", folder: "Break-building", subfolder: "Line-up",
      description: "Standard line-up drill. Log highest continuous score or agreed score metric."
    },
    {
      id: crypto.randomUUID(), name: "Long potting — 10 attempts", scoring: "success_rate", attempts: 10, duration: 10, target: 70, stretchTarget: 85,
      category: "potting", folder: "Potting", subfolder: "Long pots",
      description: "Ten long pots. Log made balls out of attempts. Normalized score is success percentage."
    },
    {
      id: crypto.randomUUID(), name: "Black from spot", scoring: "success_rate", attempts: 10, duration: 10, target: 80, stretchTarget: 90,
      category: "potting", folder: "Potting", subfolder: "Colours",
      description: "Ten black-ball attempts from defined cue-ball positions. Normalized score is success percentage."
    },
    {
      id: crypto.randomUUID(), name: "Safety drill", scoring: "points", attempts: "", duration: 15, target: 10, stretchTarget: 15,
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
refreshReferenceNames();
localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
let planDraft = [];
let activeSession = null;
let timerInterval = null;
let timerStartMs = null;
let elapsedBeforeStartMs = 0;
let deferredInstallPrompt = null;
let statsMode = "overview";

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
  d.sessions = d.sessions || [];
  d.logs = (d.logs || []).map(l => {
    const migrated = {
      sessionId: l.sessionId || crypto.randomUUID(),
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
        logIds: logs.map(l => l.id)
      });
    }
  });
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
    seeded.plans.push({
      id: crypto.randomUUID(),
      name: "Default 60 min practice",
      routineIds: seeded.routines.map(r => r.id),
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  const parsed = migrateData(JSON.parse(raw));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
  return parsed;
}

function saveData() {
  data.appVersion = APP_VERSION;
  refreshReferenceNames();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
  return `${strength} ${direction} (${r.toFixed(2)})`;
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
  if (!select) return;
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
  renderSmartRecommendation();
  renderTagSuggestions();
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
    ${r.stretchTarget ? `<span class="badge">Stretch: ${r.stretchTarget}</span>` : ""}${r.scoring === "progressive_completion" ? `<span class="badge">Progressive: ${r.totalUnits || "?"} ${progressiveUnitLabel(r)}</span><span class="badge">Colour: ${fmtTargetColour(r.targetColour || inferTargetColour(r.targetMode))}</span>` : ""}
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
  const subfolder = newSubfolder || (selectedSubfolder !== "all" ? selectedSubfolder : "General");

  const routine = {
    id: $("routineEditId").value || crypto.randomUUID(),
    name,
    scoring: $("routineScoring").value,
    attempts: Number($("routineAttempts").value || 0) || "",
    duration: Number($("routineDuration").value || 0) || "",
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
    description: $("routineDescription").value.trim()
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
  return confirmDeleteAction("this training plan", () => {
    data.plans = data.plans.filter(p => p.id !== id);
    saveData();
  });
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
$("repeatLastExerciseBtn").addEventListener("click", () => {
  const last = data.logs.slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))[0];
  if (!last) return alert("No previous exercise to repeat yet.");
  const routine = routineById(last.routineId);
  if (!routine) return alert("The last exercise template no longer exists.");
  activeSession = { id: crypto.randomUUID(), type: "free", planName: `Repeat — ${new Date().toLocaleDateString()}`, routineIds: [routine.id], index: 0, startedAt: new Date().toISOString(), completedLogs: [] };
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
  } else if (r.scoring === "progressive_completion") {
    box.innerHTML = `<button class="secondary" onclick="decrementScore()">-1</button><button class="secondary" onclick="incrementScore()">+1</button><button class="secondary" onclick="adjustScore(5)">+5</button><button class="secondary" onclick="setScoreValue(${r.totalUnits || 0})">Complete</button><button class="secondary" onclick="setScoreValue(0)">Clear</button>`;
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
    if (el) el.addEventListener("keydown", e => { if (e.key === "Enter") saveCurrentRoutine(); });
  });
}
function renderQuickScoreControls(r) {
  const box = $("quickScoreControls");
  if (!box) return;
  box.classList.remove("hidden");
  if (r.scoring === "success_rate") {
    const attempts = Number(r.attempts || 10);
    box.innerHTML = `
      <button class="secondary" onclick="setScoreValue(0)">0</button>
      <button class="secondary" onclick="decrementScore()">-1</button>
      <button class="secondary" onclick="incrementScore()">+1</button>
      <button class="secondary" onclick="setScoreValue(${Math.floor(attempts/2)})">Half</button>
      <button class="secondary" onclick="setScoreValue(${attempts})">Max</button>`;
  } else {
    box.innerHTML = `
      <button class="secondary" onclick="decrementScore()">-1</button>
      <button class="secondary" onclick="incrementScore()">+1</button>
      <button class="secondary" onclick="adjustScore(5)">+5</button>
      <button class="secondary" onclick="adjustScore(10)">+10</button>
      <button class="secondary" onclick="setScoreValue(0)">Clear</button>`;
  }
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
  const activeProfile = getActiveTargetProfile(r);

  const log = {
    id: crypto.randomUUID(),
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
  $("sessionSummary").innerHTML = `<h2>Session complete</h2><p><strong>${escapeHtml(getPlanName(activeSession))}</strong></p><p>${logs.length} exercises logged · ${totalTime.toFixed(1)} total minutes</p><table class="history-table"><thead><tr><th>Exercise</th><th>Type</th><th>Score</th><th>Performance</th><th>Time</th></tr></thead><tbody>${logs.map(l => `<tr><td>${escapeHtml(getRoutineName(l))}</td><td>${escapeHtml(l.category || "")}</td><td>${displayScore(l)}</td><td>${escapeHtml(l.performance || "N/A")}</td><td>${l.timeMinutes} min</td></tr>`).join("")}</tbody></table>`;
  $("sessionSummary").classList.remove("hidden");
  data.sessions = data.sessions || [];
  const existingIdx = data.sessions.findIndex(s => s.id === activeSession.id);
  const sessionRecord = {
    id: activeSession.id,
    name: getPlanName(activeSession),
    planNameSnapshot: activeSession.planName,
    planId: activeSession.planId || "",
    type: activeSession.type,
    startedAt: activeSession.startedAt,
    endedAt: new Date().toISOString(),
    logIds: logs.map(l => l.id)
  };
  if (existingIdx >= 0) data.sessions[existingIdx] = sessionRecord;
  else data.sessions.push(sessionRecord);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
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
    <p class="muted">Logic: prioritizes low target hit rate, recent underperformance, and undertrained categories.</p>`;
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
  $("statsOverviewBtn").classList.add("active-subtab");
  $("statsAdvancedBtn").classList.remove("active-subtab");
  renderStats();
});
$("statsAdvancedBtn").addEventListener("click", () => {
  statsMode = "advanced";
  $("statsAdvancedBtn").classList.add("active-subtab");
  $("statsOverviewBtn").classList.remove("active-subtab");
  renderStats();
});
$("statsRoutineSelect").addEventListener("change", renderStats);
$("statsDateSelect").addEventListener("change", renderStats);
$("statsPeriodSelect").addEventListener("change", renderStats);
$("rollingWindowInput").addEventListener("input", renderStats);
$("benchmarkWindowInput").addEventListener("input", renderStats);

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
      <div class="overview-card"><span>Total practice</span><div class="big">${totalTime.toFixed(1)}m</div></div>
      <div class="overview-card"><span>Exercises</span><div class="big">${logs.length}</div></div>
      <div class="overview-card"><span>Target hit rate</span><div class="big">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div>
      <div class="overview-card"><span>Momentum</span><div class="big">${escapeHtml(movingTrend(vals, rollingWindow))}</div></div>
      <div class="overview-card"><span>Skill gap</span><div class="big">${gap === null ? "N/A" : gap.toFixed(2)}</div></div>
      <div class="overview-card"><span>Streak</span><div class="big">${st.current}d</div></div>
    </div>`;

  html += renderCoachingEngine(logs);
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

  if (!cards.length) return `<h3>Second-order analytics</h3><p class="muted">More logs are needed for drift, quality impact, optimal session length, transfer, plateau, and overtraining diagnostics.</p>`;
  return `<h3>Second-order analytics</h3><div class="diagnostic-grid">${cards.map(c=>`<div class="diagnostic-card ${c.cls}"><strong>${escapeHtml(c.title)}</strong>${escapeHtml(c.text)}</div>`).join("")}</div>`;
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
      <div class="stat-card"><span>Hit rate at-time target</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div><div class="stat-card"><span>Hit rate current target</span><div class="value">${targetHitRateCurrentTarget(logs) === null ? "N/A" : targetHitRateCurrentTarget(logs).toFixed(1)+"%"}</div></div>
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
    <div class="stat-card"><span>Average</span><div class="value">${avg(vals).toFixed(2)}</div></div>
    <div class="stat-card"><span>Best / ceiling</span><div class="value">${best.toFixed(2)}</div></div>
    <div class="stat-card"><span>Consistency</span><div class="value">${stdDev(vals).toFixed(2)}</div></div>
    <div class="stat-card"><span>Ceiling gap</span><div class="value">${ceilingGap.toFixed(2)}</div></div>
    <div class="stat-card"><span>Target hit rate</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div>
  </div>
  <div class="trend">${escapeHtml(movingTrend(vals, rollingWindow))}</div>
  <div class="analytics-note"><strong>Benchmark:</strong> ${escapeHtml(benchmarkText(vals, benchmarkWindow))}<br><strong>Progression suggestion:</strong> ${escapeHtml(suggestion)}</div>
  ${renderChart(logs)}
  ${renderRollingChart(logs, rolling)}
  <table class="history-table"><thead><tr><th>Date</th><th>Score</th><th>Normalized</th><th>Performance</th><th>Time</th><th>Actions</th></tr></thead><tbody>${logs.slice(-20).reverse().map(l => renderLogRow(l)).join("")}</tbody></table>`;
}
function renderLogRow(l) {
  return `<tr>
    <td>${new Date(l.createdAt).toLocaleDateString()}</td>
    <td>${displayScore(l)}</td>
    <td>${Number(l.normalizedScore || 0).toFixed(2)}</td>
    <td>${escapeHtml(l.performance || "N/A")}</td>
    <td>${l.timeMinutes}m</td>
    <td><button class="secondary" onclick="showEditLog('${l.id}')">Edit</button> <button class="danger" onclick="deleteLog('${l.id}')">Delete</button></td>
  </tr><tr id="edit-${l.id}" class="hidden"><td colspan="6">${renderEditLogForm(l)}</td></tr>`;
}
function renderEditLogForm(l) {
  return `<div class="log-edit">
    <div class="log-edit-grid">
      <div><label>Date/time</label><input id="edit-createdAt-${l.id}" type="datetime-local" value="${toDateTimeLocal(l.createdAt)}"></div>
      <div><label>Score</label><input id="edit-score-${l.id}" type="number" step="0.01" value="${l.score}"></div>
      <div><label>Attempts</label><input id="edit-attempts-${l.id}" type="number" step="1" value="${l.attempts || ""}"></div>
      <div><label>Time minutes</label><input id="edit-time-${l.id}" type="number" step="0.1" value="${l.timeMinutes || ""}"></div>${l.scoring === "progressive_completion" ? `<div><label>Best attempt</label><input id="edit-best-${l.id}" type="number" step="0.01" value="${l.bestAttempt || ""}"></div><div><label>Completions</label><input id="edit-completions-${l.id}" type="number" step="1" value="${l.completionCount || ""}"></div><div><label>Highest break</label><input id="edit-break-${l.id}" type="number" step="1" value="${l.highestBreak || ""}"></div>` : ""}
      <div><label>Rating</label><input id="edit-rating-${l.id}" type="number" min="1" max="5" step="1" value="${l.sessionRating || ""}"></div>
      <div><label>Category</label><select id="edit-category-${l.id}">${categories().map(c => `<option value="${escapeAttr(c)}" ${c === (l.category || "uncategorized") ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}</select></div>
      <div><label>Tags</label><input id="edit-tags-${l.id}" value="${escapeAttr(l.sessionTags || "")}"></div>
    </div>
    <label>Notes</label><textarea id="edit-notes-${l.id}" rows="2">${escapeHtml(l.notes || "")}</textarea>
    <div class="small-actions"><button onclick="saveEditedLog('${l.id}')">Save changes</button><button class="secondary" onclick="showEditLog('${l.id}')">Cancel</button></div>
  </div>`;
}
function toDateTimeLocal(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function showEditLog(id) {
  const el = $("edit-"+id);
  if (!el) return;
  el.classList.toggle("hidden");
}
function saveEditedLog(id) {
  const idx = data.logs.findIndex(l => l.id === id);
  if (idx < 0) return;
  const l = data.logs[idx];
  const routine = routineById(l.routineId);
  l.createdAt = new Date($("edit-createdAt-"+id).value).toISOString();
  l.score = Number($("edit-score-"+id).value || 0);
  l.attempts = Number($("edit-attempts-"+id).value || 0) || "";
  l.timeMinutes = Number($("edit-time-"+id).value || 0);
  l.sessionRating = Number($("edit-rating-"+id).value || 0) || "";
  l.category = $("edit-category-"+id).value || l.category || "uncategorized";
  l.sessionTags = $("edit-tags-"+id).value || "";
  if ($("edit-best-"+id)) l.bestAttempt = Number($("edit-best-"+id).value || 0) || "";
  if ($("edit-completions-"+id)) l.completionCount = Number($("edit-completions-"+id).value || 0) || "";
  if ($("edit-break-"+id)) l.highestBreak = Number($("edit-break-"+id).value || 0) || "";
  updateTagHistoryFromInput(l.sessionTags);
  l.notes = $("edit-notes-"+id).value || "";
  l.normalizedScore = normalizeScore(l);
  l.performance = classifyPerformance(l, routine);
  data.logs[idx] = l;
  saveData();
}
function deleteLog(id) {
  return confirmDeleteAction("this session log", () => {
    data.logs = data.logs.filter(l => l.id !== id);
    saveData();
  });
}

function renderDateView(logs) {
  if (!logs.length) return "<p>No exercises logged for this view.</p>";
  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  const types = {};
  logs.forEach(l => { types[l.category || "uncategorized"] = (types[l.category || "uncategorized"] || 0) + 1; });
  const hit = targetHitRate(logs);
  return `<div class="stats-grid">
    <div class="stat-card"><span>Exercises</span><div class="value">${logs.length}</div></div>
    <div class="stat-card"><span>Total time</span><div class="value">${totalTime.toFixed(1)}m</div></div>
    <div class="stat-card"><span>Target hit rate</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div>
  </div><p>${Object.entries(types).map(([k,v]) => `<span class="badge">${escapeHtml(k)}: ${v}</span>`).join("")}</p>
  ${progressiveStatsForLogs(logs) ? `<div class="analytics-note"><strong>Progressive completion:</strong><span class="pc-kpi">Avg completion ${progressiveStatsForLogs(logs).avgCompletion.toFixed(1)}%</span><span class="pc-kpi">Best attempt ${progressiveStatsForLogs(logs).bestAttempt}</span><span class="pc-kpi">Completions ${progressiveStatsForLogs(logs).completionCount}</span><span class="pc-kpi">Highest break ${progressiveStatsForLogs(logs).highestBreak || "N/A"}</span></div>` : ""}
  ${renderTargetProfileSummary(logs)}
  <table class="history-table"><thead><tr><th>Time</th><th>Session</th><th>Exercise</th><th>Type</th><th>Score</th><th>Performance</th><th>Target version</th><th>Duration</th><th>Actions</th></tr></thead><tbody>${logs.map(l => `<tr><td>${new Date(l.createdAt).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}</td><td>${escapeHtml(getPlanName(l))}</td><td>${escapeHtml(getRoutineName(l))}</td><td>${escapeHtml(l.category || "")}</td><td>${displayScore(l)}</td><td>${escapeHtml(l.performance || "N/A")}</td><td>${escapeHtml(getTargetProfileLabel(l))}</td><td>${l.timeMinutes}m</td><td><button class="secondary" onclick="showEditLog('${l.id}')">Edit</button> <button class="danger" onclick="deleteLog('${l.id}')">Delete</button></td></tr><tr id="edit-${l.id}" class="hidden"><td colspan="9">${renderEditLogForm(l)}</td></tr>`).join("")}</tbody></table>`;
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
    <div class="stat-card"><span>Exercises</span><div class="value">${logs.length}</div></div>
    <div class="stat-card"><span>Total time</span><div class="value">${totalTime.toFixed(1)}m</div></div>
    <div class="stat-card"><span>Target hit rate</span><div class="value">${hit === null ? "N/A" : hit.toFixed(1)+"%"}</div></div>
  </div><p>${Object.entries(byType).map(([k,v]) => `<span class="badge">${escapeHtml(k)}: ${v}</span>`).join("")}</p>
  <h3>Today’s exercise mix</h3>${renderCategoryChart(logs)}
  ${Object.values(bySession).map(s => {
    const st = s.logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
    return `<div class="item"><div class="item-title"><strong>${escapeHtml(s.name)}</strong><span class="badge">${s.logs.length} exercises · ${st.toFixed(1)}m</span></div><table class="history-table"><thead><tr><th>Exercise</th><th>Type</th><th>Score</th><th>Performance</th><th>Time</th><th>Actions</th></tr></thead><tbody>${s.logs.map(l => `<tr><td>${escapeHtml(getRoutineName(l))}</td><td>${escapeHtml(l.category || "")}</td><td>${displayScore(l)}</td><td>${escapeHtml(l.performance || "N/A")}</td><td>${escapeHtml(getTargetProfileLabel(l))}</td><td>${l.timeMinutes}m</td><td><button class="secondary" onclick="showEditLog('${l.id}')">Edit</button> <button class="danger" onclick="deleteLog('${l.id}')">Delete</button></td></tr><tr id="edit-${l.id}" class="hidden"><td colspan="6">${renderEditLogForm(l)}</td></tr>`).join("")}</tbody></table></div>`;
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

$("exportCsvBtn").addEventListener("click", () => {
  const headers = ["createdAt","sessionName","currentPlanName","planNameSnapshot","sessionType","routineName","currentRoutineName","routineNameSnapshot","routineId","folder","subfolder","category","scoring","score","attempts","timeMinutes","normalizedScore","performance","sessionRating","sessionTags","bestAttempt","completionCount","highestBreak","totalUnits","unitType","targetMode","targetColour","targetProfileId","targetAtLog","stretchTargetAtLog","difficultyLabelAtLog","currentTargetPerformance","notes"];
  const rows = [headers.join(",")].concat(data.logs.map(l => headers.map(h => csvEscape(exportValue(l, h))).join(",")));
  downloadFile("snooker-practice-logs.csv", rows.join("\n"), "text/csv");
});
$("exportJsonBtn").addEventListener("click", () => downloadFile(`snooker-practice-backup-${APP_VERSION}-${new Date().toISOString().slice(0,10)}.json`, JSON.stringify({...data, backupVersion: APP_VERSION, exportedAt: new Date().toISOString()}, null, 2), "application/json"));
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
    id: crypto.randomUUID(),
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
      const reg = await navigator.serviceWorker.register("service-worker.js?v=3.13");
      if (reg && reg.update) reg.update();
    } catch(e) {
      console.warn("Service worker registration failed", e);
    }
  });
}
renderAll();

let generatedPlanDraft = [];

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

function rankRoutines(focusOverride="all") {
  return data.routines.map(r => {
    const s = routineStats(r.id);
    let score = s.score;
    if (focusOverride !== "all" && r.category === focusOverride) score += 25;
    return {routine:r, stats:s, score};
  }).sort((a,b)=>b.score-a.score);
}

function pickByCategory(ranked, category, usedIds, fallback=true) {
  let item = ranked.find(x => x.routine.category === category && !usedIds.has(x.routine.id));
  if (!item && fallback) item = ranked.find(x => !usedIds.has(x.routine.id));
  if (item) usedIds.add(item.routine.id);
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
  if(!data.routines.length){$("orchestratorBox").innerHTML="Create exercises first.";return;}
  const length = $("orchestratorLength")?.value || "60";
  const intensity = $("orchestratorIntensity")?.value || "balanced";
  const focus = $("orchestratorFocus")?.value || "all";
  const ranked = rankRoutines(focus);
  const blocks = composeBlocks(length, intensity, ranked, focus);

  generatedPlanDraft = blocks.flatMap(b => b.picks.map(p => p.routine.id));

  const weak = weaknessConcentration(data.logs)[0];
  const fatigue = fatigueCurve(data.logs);
  const context = [];
  if (weak) context.push(`Weakest area: ${weak.category}`);
  if (fatigue && fatigue.deltaPct < -12) context.push(`Fatigue risk: final third ${Math.abs(fatigue.deltaPct).toFixed(1)}% below early session`);
  if (focus !== "all") context.push(`Focus override: ${focus}`);

  $("orchestratorBox").innerHTML =
    `<div class="analytics-note"><strong>Session logic:</strong> ${context.length ? context.map(escapeHtml).join(" · ") : "balanced from available data"}</div>` +
    blocks.map(b => `<div class="training-block">
      <h3>${escapeHtml(b.name)}</h3>
      <div class="block-meta">${b.minutes} min · ${escapeHtml(b.intent)}</div>
      ${b.picks.map(p => `<div class="drill-line">
        <span><strong>${escapeHtml(p.routine.name)}</strong><br><span class="reason">${escapeHtml(p.routine.category || "uncategorized")} · priority score ${p.score.toFixed(1)}</span></span>
        <span>${p.routine.duration || Math.round(b.minutes / Math.max(1,b.picks.length))} min</span>
        <span>${escapeHtml(difficultyGuidance(p))}</span>
      </div>`).join("")}
    </div>`).join("") +
    `<div class="difficulty-note"><strong>Difficulty calibration rule:</strong> 80%+ target hit rate = increase difficulty; below 35% = simplify; middle zone = repeat and stabilize.</div>`;
}

function loadGeneratedPlan(){
  if(!generatedPlanDraft.length) generateNextSession();
  if(!generatedPlanDraft.length) return;
  planDraft = [...generatedPlanDraft];
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
