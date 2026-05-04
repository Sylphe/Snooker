const STORAGE_KEY = "snookerPracticePWA.v3";
const OLD_KEYS = ["snookerPracticePWA.v1", "snookerPracticePWA.v2"];
const APP_VERSION = "3.26.0";
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
const actual = mode === "system" ? (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;
root.setAttribute("data-theme", actual);
root.setAttribute("data-theme-mode", mode);
if (document.body) { document.body.setAttribute("data-theme", actual); document.body.setAttribute("data-theme-mode", mode); }
}
applyThemeModeEarly();
const defaultData = {
appVersion: APP_VERSION,
routines: [
{ id: uuid(), name: "Line-up", scoring: "raw", attempts: "", duration: 20, target: 50, stretchTarget: 65, category: "break-building", folder: "Break-building", subfolder: "Line-up", description: "Standard line-up drill. Log highest continuous score or agreed score metric." },
{ id: uuid(), name: "Long potting — 10 attempts", scoring: "success_rate", attempts: 10, duration: 10, target: 70, stretchTarget: 85, category: "potting", folder: "Potting", subfolder: "Long pots", description: "Ten long pots. Log made balls out of attempts. Normalized score is success percentage." },
{ id: uuid(), name: "Black from spot", scoring: "success_rate", attempts: 10, duration: 10, target: 80, stretchTarget: 90, category: "potting", folder: "Potting", subfolder: "Colours", description: "Ten black-ball attempts from defined cue-ball positions. Normalized score is success percentage." },
{ id: uuid(), name: "Safety drill", scoring: "points", attempts: "", duration: 15, target: 10, stretchTarget: 15, category: "safety", folder: "Safety", subfolder: "General", description: "Use a points system, e.g. +1 good leave, -1 poor leave." }
],
plans: [], sessions: [], logs: [], tagHistory: [], interfaceSettings: { themeMode: "system", sessionFocusMode: "on", quickLogAutoAdvance: "on" }
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
// ... [Rest of your app.js remains EXACTLY as provided, EXCEPT for the theme handling functions below. I've replaced the theme interface logic for reliability] ...
/* REPLACEMENT THEME INTERFACE SECTION */
function applyThemeMode(mode) {
  const root = document.documentElement;
  const body = document.body;
  if (!mode) mode = getThemeModeSetting();
  const actual = mode === "system" ? (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : mode;
  root.setAttribute("data-theme", actual);
  if (body) body.setAttribute("data-theme", actual);
  root.setAttribute("data-theme-mode", mode);
  if (body) body.setAttribute("data-theme-mode", mode);
  const meta = document.getElementById("themeColorMeta") || document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", actual === "contrast" ? "#000000" : actual === "dark" ? "#07110d" : "#102b22");
  const sel = document.getElementById("themeModeSelect");
  if (sel && sel.value !== mode) sel.value = mode;
}
function interfaceSetTheme(value) {
  const clean = ["system", "light", "dark", "contrast"].includes(value) ? value : "system";
  localStorage.setItem(THEME_MODE_KEY, clean);
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    d.interfaceSettings = d.interfaceSettings || {};
    d.interfaceSettings.themeMode = clean;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
  } catch(e) {}
  if (typeof data !== "undefined" && data) {
    data.interfaceSettings = data.interfaceSettings || {};
    data.interfaceSettings.themeMode = clean;
  }
  applyThemeMode(clean);
  return clean;
}
function renderInterfaceSettings() {
  applyThemeMode(getThemeModeSetting());
  const theme = document.getElementById("themeModeSelect");
  const focus = document.getElementById("sessionFocusModeSelect");
  const quick = document.getElementById("quickLogAutoAdvanceSelect");
  if (theme) { theme.value = getThemeModeSetting(); theme.onchange = () => interfaceSetTheme(theme.value); }
  if (focus) { focus.value = getSessionFocusSetting(); focus.onchange = () => { localStorage.setItem(SESSION_FOCUS_MODE_KEY, focus.value); updateSessionFocusState(); }; }
  if (quick) { quick.value = getQuickLogAutoAdvanceSetting(); quick.onchange = () => { localStorage.setItem(QUICK_LOG_AUTO_ADVANCE_KEY, quick.value); if (typeof activeSession !== "undefined" && activeSession && typeof renderCurrentRoutine === "function") renderCurrentRoutine(); }; }
  updateSessionFocusState();
}
// ... [Continue with the rest of app.js exactly as you had it. The above replacements fix the persistence & application bugs] ...