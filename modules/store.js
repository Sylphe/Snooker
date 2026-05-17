export const INDEXEDDB_NAME = "snookerPracticePWA.db";
export const INDEXEDDB_VERSION = 2;
export const INDEXEDDB_LOG_STORE = "logs";
export const INDEXEDDB_SESSION_STORE = "sessions";
export const INDEXEDDB_MIGRATION_KEY = "snookerPracticePWA.indexedDBMigration.v1";

function ensureObjectStores(db) {
  if (!db.objectStoreNames.contains(INDEXEDDB_LOG_STORE)) {
    const logs = db.createObjectStore(INDEXEDDB_LOG_STORE, {keyPath:"id"});
    logs.createIndex("createdAt", "createdAt", {unique:false});
    logs.createIndex("routineId", "routineId", {unique:false});
    logs.createIndex("sessionId", "sessionId", {unique:false});
  }
  if (!db.objectStoreNames.contains(INDEXEDDB_SESSION_STORE)) {
    const sessions = db.createObjectStore(INDEXEDDB_SESSION_STORE, {keyPath:"id"});
    sessions.createIndex("startedAt", "startedAt", {unique:false});
    sessions.createIndex("endedAt", "endedAt", {unique:false});
  }
}

export function openSnookerDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("IndexedDB is not available in this browser."));
    const req = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);
    req.onupgradeneeded = () => {
      ensureObjectStores(req.result);
    };
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(INDEXEDDB_LOG_STORE) || !db.objectStoreNames.contains(INDEXEDDB_SESSION_STORE)) {
        db.close();
        reject(new Error("IndexedDB opened but required object stores are missing. Reload once to complete schema upgrade."));
        return;
      }
      resolve(db);
    };
    req.onblocked = () => { console.warn("IndexedDB upgrade is blocked by another open app tab. Waiting for the browser to complete the upgrade."); };
    req.onerror = () => reject(req.error || new Error("Could not open IndexedDB."));
  });
}

export function idbGetAll(storeName) {
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, "readonly");
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => { db.close(); reject(tx.error); };
    } catch(e) {
      db.close();
      reject(e);
    }
  }));
}

export function idbGetStores(storeNames) {
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    const out = {};
    let remaining = storeNames.length;
    let settled = false;
    try {
      const tx = db.transaction(storeNames, "readonly");
      storeNames.forEach(name => {
        const req = tx.objectStore(name).getAll();
        req.onsuccess = () => {
          out[name] = req.result || [];
          remaining -= 1;
          if (remaining === 0 && !settled) {
            settled = true;
            resolve(out);
          }
        };
        req.onerror = () => {
          if (!settled) {
            settled = true;
            reject(req.error);
          }
        };
      });
      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        if (!settled) {
          settled = true;
          reject(tx.error);
        }
      };
    } catch(e) {
      db.close();
      reject(e);
    }
  }));
}

export function idbReplaceAll(storeName, rows) {
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, "readwrite");
      const store = tx.objectStore(storeName);
      store.clear();
      (rows || []).forEach(row => { if (row && row.id) store.put(row); });
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    } catch(e) {
      db.close();
      reject(e);
    }
  }));
}

export function idbPut(storeName, item) {
  if (!item || !item.id) return Promise.resolve(false);
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).put(item);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    } catch(e) {
      db.close();
      reject(e);
    }
  }));
}

export function idbDelete(storeName, id) {
  if (!id) return Promise.resolve(false);
  return openSnookerDB().then(db => new Promise((resolve, reject) => {
    let tx;
    try {
      tx = db.transaction(storeName, "readwrite");
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    } catch(e) {
      db.close();
      reject(e);
    }
  }));
}


export function idbDeleteDatabase() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return resolve(false);
    const req = indexedDB.deleteDatabase(INDEXEDDB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error("Could not delete IndexedDB database."));
    req.onblocked = () => reject(new Error("IndexedDB delete is blocked by another open app tab. Close other Snooker app tabs and reload."));
  });
}


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


/* ===== v4.25 Unified Recommendation Foundation ===== */

function derivePerformanceSignal(log, routine){
  const attempts = Number(log.attempts || log.totalAttempts || 0);
  const made = Number(log.made || log.score || 0);

  let normalizedScore = 0;
  if(attempts > 0){
    normalizedScore = Math.max(0, Math.min(100, (made / attempts) * 100));
  }else{
    normalizedScore = Number(log.normalizedScore || made || 0);
  }

  const left = Number(log.leftSideScore || 0);
  const right = Number(log.rightSideScore || 0);

  const lrBalance = (left || right)
    ? 100 - Math.abs(left - right)
    : null;

  const issues = [];

  if(attempts < 0 || made < 0){
    issues.push("negative_values");
  }

  if(attempts > 0 && made > attempts){
    issues.push("score_exceeds_attempts");
  }

  return {
    normalizedScore,
    targetHit: normalizedScore >= Number(routine?.target || 70),
    effectiveAttempts: attempts,
    confidenceWeight: Math.min(1, attempts / 20),
    scoringFamily: routine?.scoringType || "generic",
    difficultyAdjustedScore: normalizedScore,
    leftRightBalance: lrBalance,
    dataQualityFlags: issues
  };
}

function evaluateRoutinePriority(routine, logs, context={}){
  const recent = (logs || []).slice(-10);

  let avg = 50;
  if(recent.length){
    avg = recent.reduce((a,l)=>a + (Number(l.normalizedScore || l.score || 0)),0)/recent.length;
  }

  const weaknessScore = 100 - avg;
  const undertrainingScore = Math.min(100, Number(context.daysSinceLast || 0) * 4);
  const uncertaintyScore = Math.max(0, 100 - recent.length * 10);
  const fatiguePenalty = Number(context.fatigueRisk || 0) * 10;

  const totalScore =
    weaknessScore * 0.45 +
    undertrainingScore * 0.30 +
    uncertaintyScore * 0.20 -
    fatiguePenalty * 0.05;

  const reasons = [];

  if(weaknessScore > 60) reasons.push("Weakness detected");
  if(undertrainingScore > 50) reasons.push("Undertrained recently");
  if(uncertaintyScore > 50) reasons.push("Low sample confidence");
  if(context.pressureNeed) reasons.push("Pressure adaptation needed");

  return {
    totalScore,
    weaknessScore,
    undertrainingScore,
    uncertaintyScore,
    fatiguePenalty,
    reasons
  };
}

function runDataQualityAudit(){
  const results = [];

  try{
    const logs = (window.data && data.logs) || [];
    const routines = (window.data && data.routines) || [];
    const routineIds = new Set(routines.map(r=>r.id));

    logs.forEach((log,idx)=>{
      if(log.routineId && !routineIds.has(log.routineId)){
        results.push({
          severity:"medium",
          type:"orphan_log",
          message:`Log ${idx+1} references deleted routine`
        });
      }

      if(Number(log.score || 0) < 0){
        results.push({
          severity:"high",
          type:"negative_score",
          message:`Negative score detected`
        });
      }

      if(Number(log.attempts || 0) > 0 &&
         Number(log.score || 0) > Number(log.attempts || 0)){
        results.push({
          severity:"high",
          type:"score_exceeds_attempts",
          message:`Score exceeds attempts`
        });
      }
    });

  }catch(err){
    console.warn(err);
  }

  return results;
}

function renderDataQualityAudit(){
  const host = document.getElementById("dataQualityAuditBox");
  if(!host) return;

  const issues = runDataQualityAudit();

  if(!issues.length){
    host.innerHTML = '<div class="small muted">No integrity issues detected.</div>';
    return;
  }

  host.innerHTML = issues.map(i=>`
    <div class="dq-item dq-${i.severity}">
      <strong>${i.type}</strong><br/>
      <span class="small">${i.message}</span>
    </div>
  `).join('');
}

/* ===== end v4.25 foundation ===== */


/* ===== v4.25.1 Data Quality UI Fix ===== */
function mountDataQualityAuditPanel(){
  try{
    if(document.getElementById("dataQualityAuditPanel")) return;
    var host =
      document.getElementById("developerOptions") ||
      document.getElementById("developerOptionsPanel") ||
      document.getElementById("storageSafetyDashboard") ||
      document.getElementById("storageDiagnosticHarness") ||
      document.querySelector('[data-panel="developer"]') ||
      document.querySelector('[data-tab="developer"]') ||
      document.querySelector(".developer-options");
    if(!host) return;

    var panel = document.createElement("div");
    panel.id = "dataQualityAuditPanel";
    panel.className = "card data-quality-panel";
    panel.innerHTML =
      '<div class="row between gap">' +
        '<div><strong>Data Quality Audit</strong>' +
        '<div class="small muted">Checks logs, routines and plans for integrity issues before advanced analytics.</div></div>' +
        '<button type="button" id="runDataQualityAuditBtn" class="btn small">Run audit</button>' +
      '</div>' +
      '<div id="dataQualityAuditBox" class="small muted" style="margin-top:8px;">Audit not run yet.</div>';
    host.appendChild(panel);

    var btn = document.getElementById("runDataQualityAuditBtn");
    if(btn){
      btn.addEventListener("click", function(){
        if(typeof renderDataQualityAudit === "function") renderDataQualityAudit();
      });
    }
  }catch(err){
    console.warn("Data quality panel mount failed", err);
  }
}
if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", mountDataQualityAuditPanel);
}else{
  mountDataQualityAuditPanel();
}
setTimeout(mountDataQualityAuditPanel, 500);
setTimeout(mountDataQualityAuditPanel, 1500);
/* ===== end v4.25.1 Data Quality UI Fix ===== */
