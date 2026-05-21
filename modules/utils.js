let __uuidCounter = 0;

export function uuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  __uuidCounter = (__uuidCounter + 1) % 1296;
  const timePart = Date.now().toString(36);
  const counterPart = __uuidCounter.toString(36).padStart(2, "0");
  let entropyPart = "";
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      entropyPart = Array.from(bytes, b => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
    }
  } catch(_) { entropyPart = ""; }
  if (!entropyPart) {
    entropyPart = Math.random().toString(36).slice(2).padEnd(12, "0").slice(0, 12);
  }
  return `id-${timePart}-${entropyPart}-${counterPart}`;
}

export function structuredCloneSafe(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

export function cssEscapeSafe(value) {
  const string = String(value ?? "");
  if (typeof window !== "undefined" && window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(string);
  // Conservative CSS.escape fallback based on the CSSOM escaping rules.
  return string.replace(/[\0-\x1f\x7f]|^-?\d|^-$|[^a-zA-Z0-9_-]/g, (ch, offset) => {
    if (ch === "\0") return "\uFFFD";
    const code = ch.charCodeAt(0).toString(16).toUpperCase();
    const needsHex = /[\0-\x1f\x7f]/.test(ch) || (offset === 0 && /[-0-9]/.test(ch));
    return needsHex ? `\\${code} ` : `\\${ch}`;
  });
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

export function safeClassToken(value, allowed, fallback="neutral") {
  const safeFallback = String(fallback || "neutral").replace(/[^a-zA-Z0-9_-]/g, "");
  return Array.isArray(allowed) && allowed.includes(value) ? value : (safeFallback || "neutral");
}

export function sortedBy(arr, comparator) {
  return [...(arr || [])].sort(comparator);
}





export function safeMax(arr, fallback = null) {
  if (!arr || !arr.length) return fallback;
  let max = -Infinity;
  let found = false;
  for (const raw of arr) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (value > max) max = value;
    found = true;
  }
  return found ? max : fallback;
}

export function safeMin(arr, fallback = null) {
  if (!arr || !arr.length) return fallback;
  let min = Infinity;
  let found = false;
  for (const raw of arr) {
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    found = true;
  }
  return found ? min : fallback;
}
