export const THEME_MODE_KEY = "snookerPracticePWA.themeMode";
export const SESSION_FOCUS_MODE_KEY = "snookerPracticePWA.sessionFocusMode";
export const QUICK_LOG_AUTO_ADVANCE_KEY = "snookerPracticePWA.quickLogAutoAdvance";
export const DISPLAY_DENSITY_KEY = "snookerPracticePWA.displayDensity";
export const TIMER_AUTOSTART_KEY = "snookerPracticePWA.timerAutostart";
export const TIMER_AUTOSTART_DELAY_KEY = "snookerPracticePWA.timerAutostartDelaySeconds";
export const WAKE_LOCK_KEY = "snookerPracticePWA.wakeLock";

export function normalizeInterfaceThemeMode(value) {
  return ["system", "light", "dark", "contrast"].includes(value) ? value : "system";
}

export function normalizeOnOff(value, fallback="on") {
  return value === "off" ? "off" : (value === "on" ? "on" : fallback);
}

export function normalizeDisplayDensity(value) {
  return value === "compact" ? "compact" : "comfortable";
}

export function normalizeTimerAutostart(value) {
  return value === "auto" ? "auto" : "manual";
}

export function normalizeWakeLock(value) {
  return value === "on" ? "on" : "off";
}

export function normalizeTimerAutostartDelay(value) {
  const n = Math.round(Number(value || 0));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(300, n));
}

export function getRawStoredThemeMode(storageKey) {
  try {
    const direct = localStorage.getItem(THEME_MODE_KEY);
    if (direct) return normalizeInterfaceThemeMode(direct);
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return normalizeInterfaceThemeMode(parsed?.interfaceSettings?.themeMode || "system");
    }
  } catch(e) {}
  return "system";
}

export function resolveThemeMode(mode) {
  const clean = normalizeInterfaceThemeMode(mode);
  if (clean !== "system") return clean;
  try {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch(e) {
    return "light";
  }
}

export function applyThemeToDocument(mode) {
  const storedMode = normalizeInterfaceThemeMode(mode);
  const actualTheme = resolveThemeMode(storedMode);
  [document.documentElement, document.body].filter(Boolean).forEach(el => {
    el.classList.remove("theme-system", "theme-light", "theme-dark", "theme-contrast");
    el.classList.add("theme-" + storedMode);
    el.setAttribute("data-theme-mode", storedMode);
    el.setAttribute("data-theme", actualTheme);
  });
  const meta = document.getElementById("themeColorMeta") || document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", actualTheme === "contrast" ? "#000000" : actualTheme === "dark" ? "#07110d" : "#102b22");
  return {mode: storedMode, actualTheme};
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
