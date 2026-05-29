export const THEME_MODE_KEY = "snookerPracticePWA.themeMode";
export const SESSION_FOCUS_MODE_KEY = "snookerPracticePWA.sessionFocusMode";
export const QUICK_LOG_AUTO_ADVANCE_KEY = "snookerPracticePWA.quickLogAutoAdvance";
export const DISPLAY_DENSITY_KEY = "snookerPracticePWA.displayDensity";
export const TIMER_AUTOSTART_KEY = "snookerPracticePWA.timerAutostart";
export const TIMER_AUTOSTART_DELAY_KEY = "snookerPracticePWA.timerAutostartDelaySeconds";
export const WAKE_LOCK_KEY = "snookerPracticePWA.wakeLock";
export const HAPTIC_FEEDBACK_KEY = "snookerPracticePWA.hapticFeedback";

export function normalizeInterfaceThemeMode(value) {
  return ["system", "light", "dark", "contrast"].includes(value) ? value : "system";
}

export function normalizeOnOff(value, fallback="on") {
  return value === "off" ? "off" : (value === "on" ? "on" : fallback);
}

export function normalizeDisplayDensity(value) {
  return value === "very-compact" ? "very-compact" : (value === "compact" ? "compact" : "comfortable");
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
  const applyTo = el => {
    if (!el) return;
    el.classList.remove("theme-system", "theme-light", "theme-dark", "theme-contrast");
    el.classList.add("theme-" + storedMode);
    el.setAttribute("data-theme-mode", storedMode);
    el.setAttribute("data-theme", actualTheme);
  };
  applyTo(document.documentElement);
  applyTo(document.body);
  const meta = document.getElementById("themeColorMeta") || document.querySelector('meta[name="theme-color"]');
  if (meta) {
    let color = actualTheme === "contrast" ? "#000000" : actualTheme === "dark" ? "#07110d" : "#102b22";
    try {
      const computed = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
      if (computed) color = computed;
    } catch(_) {}
    meta.setAttribute("content", color);
  }
  return {mode: storedMode, actualTheme};
}



