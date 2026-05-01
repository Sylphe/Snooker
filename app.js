const STORAGE_KEY = "snookerPracticePWA.v1";

const defaultData = {
  routines: [
    {
      id: crypto.randomUUID(),
      name: "Line-up",
      scoring: "raw",
      attempts: "",
      duration: 20,
      target: 50,
      category: "break-building",
      description: "Standard line-up drill. Log highest continuous score or agreed score metric."
    },
    {
      id: crypto.randomUUID(),
      name: "Long potting — 10 attempts",
      scoring: "success_rate",
      attempts: 10,
      duration: 10,
      target: 7,
      category: "potting",
      description: "Ten long pots. Log made balls out of attempts."
    },
    {
      id: crypto.randomUUID(),
      name: "Black from spot",
      scoring: "success_rate",
      attempts: 10,
      duration: 10,
      target: 8,
      category: "potting",
      description: "Ten black-ball attempts from defined cue-ball positions."
    },
    {
      id: crypto.randomUUID(),
      name: "Safety drill",
      scoring: "points",
      attempts: "",
      duration: 15,
      target: 10,
      category: "safety",
      description: "Use a points system, e.g. +1 good leave, -1 poor leave."
    }
  ],
  plans: [],
  logs: []
};

let data = loadData();
let planDraft = [];
let activeSession = null;
let timerInterval = null;
let elapsedSeconds = 0;
let deferredInstallPrompt = null;

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seeded = structuredClone(defaultData);
    seeded.plans.push({
      id: crypto.randomUUID(),
      name: "Default 60 min practice",
      routineIds: seeded.routines.slice(0, 4).map(r => r.id),
      createdAt: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  }
  return JSON.parse(raw);
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  renderAll();
}

function $(id) { return document.getElementById(id); }

function fmtScoring(type) {
  return {
    raw: "Raw score",
    success_rate: "Success rate",
    highest_break: "Highest break",
    points: "Points system",
    score_per_minute: "Time-based score"
  }[type] || type;
}

function normalizeScore(log) {
  if (log.scoring === "success_rate") {
    return log.attempts > 0 ? (log.score / log.attempts) * 100 : 0;
  }
  if (log.scoring === "score_per_minute") {
    const mins = log.timeMinutes || 0;
    return mins > 0 ? log.score / mins : 0;
  }
  return Number(log.score || 0);
}

function trendLabel(values) {
  if (values.length < 4) return "Not enough data yet";
  const recent = avg(values.slice(-3));
  const prior = avg(values.slice(0, -3));
  if (prior === 0) return "Not enough baseline";
  const delta = ((recent - prior) / Math.abs(prior)) * 100;
  if (delta > 7.5) return `Improving (+${delta.toFixed(1)}% vs prior average)`;
  if (delta < -7.5) return `Declining (${delta.toFixed(1)}% vs prior average)`;
  return `Stable (${delta.toFixed(1)}% vs prior average)`;
}

function avg(arr) {
  return arr.length ? arr.reduce((a,b) => a + b, 0) / arr.length : 0;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const mean = avg(arr);
  const variance = avg(arr.map(x => Math.pow(x - mean, 2)));
  return Math.sqrt(variance);
}

function renderAll() {
  renderRoutineSelects();
  renderRoutineList();
  renderPlanBuilder();
  renderPlanList();
  renderStats();
}

document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    $(btn.dataset.tab).classList.add("active");
  });
});

function renderRoutineSelects() {
  const routineOptions = data.routines.map(r => `<option value="${r.id}">${escapeHtml(r.name)} — ${fmtScoring(r.scoring)}</option>`).join("");
  $("routineToAdd").innerHTML = routineOptions || `<option>No routines yet</option>`;
  $("freeRoutineSelect").innerHTML = routineOptions || `<option>No routines yet</option>`;
  $("nextFreeRoutineSelect").innerHTML = routineOptions || `<option>No routines yet</option>`;

  const planOptions = data.plans.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  $("planSelect").innerHTML = planOptions || `<option>No plans yet</option>`;

  const statsOptions = data.routines.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join("");
  $("statsRoutineSelect").innerHTML = statsOptions || `<option>No routines yet</option>`;
}

function renderRoutineList() {
  $("routineList").innerHTML = data.routines.map(r => `
    <div class="item">
      <div class="item-title">
        <strong>${escapeHtml(r.name)}</strong>
        <span class="badge">${fmtScoring(r.scoring)}</span>
      </div>
      <p>${escapeHtml(r.description || "")}</p>
      <span class="badge">${escapeHtml(r.category || "uncategorized")}</span>
      <span class="badge">${r.duration || 0} min</span>
      ${r.attempts ? `<span class="badge">${r.attempts} attempts</span>` : ""}
      ${r.target ? `<span class="badge">Target: ${r.target}</span>` : ""}
      <div class="small-actions">
        <button class="secondary" onclick="loadRoutineForEdit('${r.id}')">Load</button>
        <button class="danger" onclick="deleteRoutine('${r.id}')">Delete</button>
      </div>
    </div>
  `).join("") || "<p>No routine templates saved yet.</p>";
}

function loadRoutineForEdit(id) {
  const r = data.routines.find(x => x.id === id);
  if (!r) return;
  $("routineName").value = r.name;
  $("routineScoring").value = r.scoring;
  $("routineAttempts").value = r.attempts || "";
  $("routineDuration").value = r.duration || "";
  $("routineTarget").value = r.target || "";
  $("routineCategory").value = r.category || "";
  $("routineDescription").value = r.description || "";
  $("routineName").dataset.editId = id;
  document.querySelector('[data-tab="templates"]').click();
}

function deleteRoutine(id) {
  if (!confirm("Delete this routine template? Existing historical logs will remain.")) return;
  data.routines = data.routines.filter(r => r.id !== id);
  data.plans = data.plans.map(p => ({ ...p, routineIds: p.routineIds.filter(rid => rid !== id) }));
  saveData();
}

$("saveRoutineBtn").addEventListener("click", () => {
  const name = $("routineName").value.trim();
  if (!name) return alert("Enter a routine name.");
  const existingId = $("routineName").dataset.editId;
  const routine = {
    id: existingId || crypto.randomUUID(),
    name,
    scoring: $("routineScoring").value,
    attempts: Number($("routineAttempts").value || 0) || "",
    duration: Number($("routineDuration").value || 0) || "",
    target: Number($("routineTarget").value || 0) || "",
    category: $("routineCategory").value.trim(),
    description: $("routineDescription").value.trim()
  };
  if (existingId) {
    data.routines = data.routines.map(r => r.id === existingId ? routine : r);
    delete $("routineName").dataset.editId;
  } else {
    data.routines.push(routine);
  }
  ["routineName","routineAttempts","routineDuration","routineTarget","routineCategory","routineDescription"].forEach(id => $(id).value = "");
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
    const r = data.routines.find(x => x.id === id);
    return `<div class="item">
      <strong>${i + 1}. ${escapeHtml(r?.name || "Missing routine")}</strong>
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

$("savePlanBtn").addEventListener("click", () => {
  const name = $("planName").value.trim();
  if (!name) return alert("Enter a plan name.");
  if (!planDraft.length) return alert("Add at least one routine.");
  data.plans.push({
    id: crypto.randomUUID(),
    name,
    routineIds: [...planDraft],
    createdAt: new Date().toISOString()
  });
  $("planName").value = "";
  planDraft = [];
  saveData();
});

function renderPlanList() {
  $("planList").innerHTML = data.plans.map(p => {
    const names = p.routineIds.map(id => data.routines.find(r => r.id === id)?.name || "Missing routine");
    return `<div class="item">
      <div class="item-title">
        <strong>${escapeHtml(p.name)}</strong>
        <span class="badge">${p.routineIds.length} routines</span>
      </div>
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
  activeSession = {
    id: crypto.randomUUID(),
    mode: "planned",
    planId: plan.id,
    planName: plan.name,
    routineIds: plan.routineIds.filter(id => data.routines.some(r => r.id === id)),
    index: 0,
    startedAt: new Date().toISOString(),
    completedLogs: []
  };
  elapsedSeconds = 0;
  $("sessionSummary").classList.add("hidden");
  $("activeSession").classList.remove("hidden");
  renderCurrentRoutine();
});
$("startFreeSessionBtn").addEventListener("click", () => {
  const routineId = $("freeRoutineSelect").value;
  const r = data.routines.find(x => x.id === routineId);
  if (!r) return alert("Create or select a routine first.");
  const today = new Date().toLocaleDateString();
  activeSession = {
    id: crypto.randomUUID(),
    mode: "free",
    planId: "",
    planName: $("freeSessionName").value.trim() || `Free training — ${today}`,
    routineIds: [],
    currentRoutineId: routineId,
    index: 0,
    startedAt: new Date().toISOString(),
    completedLogs: []
  };
  elapsedSeconds = 0;
  $("sessionSummary").classList.add("hidden");
  $("freeNextChooser").classList.add("hidden");
  $("activeSession").classList.remove("hidden");
  renderCurrentRoutine();
});


$("resetSessionBtn").addEventListener("click", () => {
  activeSession = null;
  stopTimer();
  elapsedSeconds = 0;
  $("activeSession").classList.add("hidden");
  $("freeNextChooser").classList.add("hidden");
  $("sessionSummary").classList.add("hidden");
});

function renderCurrentRoutine() {
  if (!activeSession) return;
  if (activeSession.mode === "planned" && activeSession.index >= activeSession.routineIds.length) return completeSession();
  const routineId = activeSession.mode === "free" ? activeSession.currentRoutineId : activeSession.routineIds[activeSession.index];
  const r = data.routines.find(x => x.id === routineId);
  if (!r) return;
  $("currentRoutineName").textContent = r.name;
  $("currentRoutineMeta").textContent = activeSession.mode === "free"
    ? `Free training · ${fmtScoring(r.scoring)} · target ${r.target || "n/a"} · default ${r.duration || 0} min`
    : `${activeSession.index + 1}/${activeSession.routineIds.length} · ${fmtScoring(r.scoring)} · target ${r.target || "n/a"} · default ${r.duration || 0} min`;
  $("saveNextBtn").textContent = activeSession.mode === "free" ? "Save Routine" : "Save & Next";
  $("endSessionBtn").classList.toggle("hidden", activeSession.mode !== "free");
  $("practiceNotes").value = "";
  elapsedSeconds = 0;
  updateTimerDisplay();
  $("freeNextChooser").classList.add("hidden");
  $("activeSession").classList.remove("hidden");
  renderScoreInputs(r);
}

function renderScoreInputs(r) {
  let html = "";
  if (r.scoring === "success_rate") {
    html += `<div><label>Made</label><input id="scoreValue" type="number" min="0" step="1" placeholder="e.g. 7"></div>`;
    html += `<div><label>Attempts</label><input id="attemptsValue" type="number" min="1" step="1" value="${r.attempts || ""}" placeholder="e.g. 10"></div>`;
  } else if (r.scoring === "score_per_minute") {
    html += `<div><label>Score</label><input id="scoreValue" type="number" min="0" step="1" placeholder="e.g. 25"></div>`;
    html += `<div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty"></div>`;
  } else {
    html += `<div><label>Score</label><input id="scoreValue" type="number" step="0.01" placeholder="Enter score"></div>`;
    html += `<div><label>Time, minutes</label><input id="manualTimeValue" type="number" min="0" step="0.1" placeholder="auto from timer if empty"></div>`;
  }
  $("scoreInputs").innerHTML = html;
}

$("saveNextBtn").addEventListener("click", () => {
  if (!activeSession) return;
  const routineId = activeSession.mode === "free" ? activeSession.currentRoutineId : activeSession.routineIds[activeSession.index];
  const r = data.routines.find(x => x.id === routineId);
  if (!r) return;
  const score = Number($("scoreValue")?.value || 0);
  const attempts = r.scoring === "success_rate" ? Number($("attemptsValue")?.value || 0) : Number(r.attempts || 0);
  const manualTime = Number($("manualTimeValue")?.value || 0);
  const timeMinutes = manualTime || Math.round((elapsedSeconds / 60) * 10) / 10 || Number(r.duration || 0);

  if (r.scoring === "success_rate" && attempts <= 0) return alert("Enter attempts.");
  if (Number.isNaN(score)) return alert("Enter a valid score.");

  const log = {
    id: crypto.randomUUID(),
    sessionId: activeSession.id,
    sessionName: activeSession.planName,
    routineId: r.id,
    routineName: r.name,
    scoring: r.scoring,
    score,
    attempts,
    timeMinutes,
    normalizedScore: 0,
    notes: $("practiceNotes").value.trim(),
    createdAt: new Date().toISOString()
  };
  log.normalizedScore = normalizeScore(log);
  data.logs.push(log);
  activeSession.completedLogs.push(log);
  stopTimer();
  saveData();
  if (activeSession.mode === "free") {
    $("activeSession").classList.add("hidden");
    $("freeNextChooser").classList.remove("hidden");
    return;
  }
  activeSession.index += 1;
  renderCurrentRoutine();
});

$("skipBtn").addEventListener("click", () => {
  if (!activeSession) return;
  stopTimer();
  if (activeSession.mode === "free") {
    $("activeSession").classList.add("hidden");
    $("freeNextChooser").classList.remove("hidden");
    return;
  }
  activeSession.index += 1;
  renderCurrentRoutine();
});

$("continueFreeSessionBtn").addEventListener("click", () => {
  if (!activeSession || activeSession.mode !== "free") return;
  const routineId = $("nextFreeRoutineSelect").value;
  if (!data.routines.some(r => r.id === routineId)) return alert("Select a valid routine.");
  activeSession.currentRoutineId = routineId;
  activeSession.index += 1;
  renderCurrentRoutine();
});

$("finishFreeSessionBtn").addEventListener("click", () => {
  if (!activeSession) return;
  completeSession();
});

$("endSessionBtn").addEventListener("click", () => {
  if (!activeSession) return;
  completeSession();
});

function completeSession() {
  $("activeSession").classList.add("hidden");
  const logs = activeSession.completedLogs;
  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);
  $("sessionSummary").innerHTML = `
    <h2>Session complete</h2>
    <p><strong>${escapeHtml(activeSession.planName)}</strong></p>
    <p>${logs.length} routines logged · ${totalTime.toFixed(1)} total minutes</p>
    <table class="history-table">
      <thead><tr><th>Routine</th><th>Score</th><th>Normalized</th><th>Time</th></tr></thead>
      <tbody>${logs.map(l => `<tr><td>${escapeHtml(l.routineName)}</td><td>${displayScore(l)}</td><td>${l.normalizedScore.toFixed(2)}</td><td>${l.timeMinutes} min</td></tr>`).join("")}</tbody>
    </table>
  `;
  $("sessionSummary").classList.remove("hidden");
  activeSession = null;
}

function displayScore(l) {
  if (l.scoring === "success_rate") return `${l.score}/${l.attempts} (${l.normalizedScore.toFixed(1)}%)`;
  if (l.scoring === "score_per_minute") return `${l.score} (${l.normalizedScore.toFixed(2)}/min)`;
  return `${l.score}`;
}

$("timerStartBtn").addEventListener("click", () => {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    updateTimerDisplay();
  }, 1000);
});

$("timerPauseBtn").addEventListener("click", stopTimer);

$("timerResetBtn").addEventListener("click", () => {
  stopTimer();
  elapsedSeconds = 0;
  updateTimerDisplay();
});

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

function updateTimerDisplay() {
  const mins = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const secs = (elapsedSeconds % 60).toString().padStart(2, "0");
  $("timerDisplay").textContent = `${mins}:${secs}`;
}

$("statsRoutineSelect").addEventListener("change", renderStats);

function renderStats() {
  const rid = $("statsRoutineSelect").value;
  const logs = data.logs.filter(l => l.routineId === rid).sort((a,b) => new Date(a.createdAt) - new Date(b.createdAt));
  const chart = $("progressChart");
  if (!rid || !logs.length) {
    $("statsOutput").innerHTML = "<p>No logs yet for this routine.</p>";
    chart.classList.add("hidden");
    return;
  }
  const vals = logs.map(l => Number(l.normalizedScore || 0));
  const last5 = vals.slice(-5);
  const best = Math.max(...vals);
  const latest = vals[vals.length - 1];
  const totalTime = logs.reduce((a,b) => a + Number(b.timeMinutes || 0), 0);

  $("statsOutput").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card"><span>Latest</span><div class="value">${latest.toFixed(2)}</div></div>
      <div class="stat-card"><span>Average</span><div class="value">${avg(vals).toFixed(2)}</div></div>
      <div class="stat-card"><span>Best</span><div class="value">${best.toFixed(2)}</div></div>
      <div class="stat-card"><span>Last 5 avg</span><div class="value">${avg(last5).toFixed(2)}</div></div>
      <div class="stat-card"><span>Volatility</span><div class="value">${stdDev(vals).toFixed(2)}</div></div>
      <div class="stat-card"><span>Total time</span><div class="value">${totalTime.toFixed(1)}m</div></div>
    </div>
    <div class="trend">${trendLabel(vals)}</div>
    <table class="history-table">
      <thead><tr><th>Date</th><th>Score</th><th>Normalized</th><th>Time</th><th>Notes</th></tr></thead>
      <tbody>${logs.slice(-15).reverse().map(l => `
        <tr>
          <td>${new Date(l.createdAt).toLocaleDateString()}</td>
          <td>${displayScore(l)}</td>
          <td>${l.normalizedScore.toFixed(2)}</td>
          <td>${l.timeMinutes}m</td>
          <td>${escapeHtml(l.notes || "")}</td>
        </tr>`).join("")}</tbody>
    </table>
  `;
  chart.classList.remove("hidden");
  drawProgressChart(logs);
}

function drawProgressChart(logs) {
  const canvas = $("progressChart");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(320, Math.floor(rect.width || canvas.width));
  const height = 320;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, width, height);
  const pad = { left: 46, right: 18, top: 22, bottom: 54 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const vals = logs.map(l => Number(l.normalizedScore || 0));
  const minVal = Math.min(...vals);
  const maxVal = Math.max(...vals);
  const range = maxVal === minVal ? 1 : maxVal - minVal;
  const yMin = minVal - range * 0.12;
  const yMax = maxVal + range * 0.12;

  const x = i => pad.left + (logs.length === 1 ? plotW / 2 : (i / (logs.length - 1)) * plotW);
  const y = v => pad.top + (1 - ((v - yMin) / (yMax - yMin))) * plotH;

  ctx.strokeStyle = "#dce4de";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const yy = pad.top + (i / 4) * plotH;
    ctx.moveTo(pad.left, yy);
    ctx.lineTo(width - pad.right, yy);
  }
  ctx.stroke();

  ctx.fillStyle = "#637168";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let i = 0; i <= 4; i++) {
    const val = yMax - (i / 4) * (yMax - yMin);
    ctx.fillText(val.toFixed(1), pad.left - 8, pad.top + (i / 4) * plotH);
  }

  ctx.strokeStyle = "#0f3d2e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  vals.forEach((v, i) => {
    if (i === 0) ctx.moveTo(x(i), y(v));
    else ctx.lineTo(x(i), y(v));
  });
  ctx.stroke();

  ctx.fillStyle = "#0f3d2e";
  vals.forEach((v, i) => {
    ctx.beginPath();
    ctx.arc(x(i), y(v), 4, 0, Math.PI * 2);
    ctx.fill();
  });

  if (logs.length >= 5) {
    const ma = vals.map((_, i) => {
      const start = Math.max(0, i - 4);
      return avg(vals.slice(start, i + 1));
    });
    ctx.strokeStyle = "#5f7f6f";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ma.forEach((v, i) => {
      if (i === 0) ctx.moveTo(x(i), y(v));
      else ctx.lineTo(x(i), y(v));
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = "#637168";
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const firstDate = new Date(logs[0].createdAt).toLocaleDateString();
  const lastDate = new Date(logs[logs.length - 1].createdAt).toLocaleDateString();
  ctx.fillText(firstDate, pad.left, height - 36);
  ctx.fillText(lastDate, width - pad.right, height - 36);

  ctx.textAlign = "left";
  ctx.fillText("Normalized score progression; dashed line = 5-session moving average", pad.left, height - 18);
}

$("exportCsvBtn").addEventListener("click", () => {
  const headers = ["createdAt","sessionName","routineName","routineId","scoring","score","attempts","timeMinutes","normalizedScore","notes"];
  const rows = [headers.join(",")].concat(data.logs.map(l => headers.map(h => csvEscape(l[h] ?? "")).join(",")));
  downloadFile("snooker-practice-logs.csv", rows.join("\n"), "text/csv");
});

$("exportJsonBtn").addEventListener("click", () => {
  downloadFile("snooker-practice-backup.json", JSON.stringify(data, null, 2), "application/json");
});

$("importJsonInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const imported = JSON.parse(text);
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
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const s = String(value).replaceAll('"', '""');
  return `"${s}"`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
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
  window.addEventListener("load", () => navigator.serviceWorker.register("service-worker.js"));
}

renderAll();
