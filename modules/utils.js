export function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2,10);
}

export function structuredCloneSafe(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

export function cssEscapeSafe(value) {
  if (window.CSS && typeof window.CSS.escape === "function") return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

export function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    '"':"&quot;",
    "'":"&#39;"
  }[ch]));
}

export function escapeAttr(str) {
  return escapeHtml(str).replaceAll("`","&#096;");
}

export function htmlText(value) {
  return escapeHtml(value);
}

export function attrText(value) {
  return escapeAttr(value);
}

export function jsArg(value) {
  return escapeAttr(JSON.stringify(String(value ?? "")));
}

export function numText(value, fallback="") {
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : escapeHtml(fallback);
}

export function numAttr(value, fallback="") {
  return escapeAttr(numText(value, fallback));
}

export function safeClassToken(value, allowed, fallback="") {
  return allowed.includes(value) ? value : fallback;
}

export function sortedBy(arr, comparator) {
  return [...(arr || [])].sort(comparator);
}
