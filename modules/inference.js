// Pure inference utilities. No DOM access, no app state mutation.
export function clampNumber(value, min = 0, max = 1, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function shrinkageWeight(sampleSize = 0, priorStrength = 8) {
  const n = Math.max(0, Number(sampleSize) || 0);
  const p = Math.max(0.0001, Number(priorStrength) || 8);
  return n / (n + p);
}

export function smoothEvidence(sampleSize = 0, options = {}) {
  const n = Math.max(0, Number(sampleSize) || 0);
  const priorStrength = Number.isFinite(Number(options.priorStrength)) ? Number(options.priorStrength) : 8;
  const weight = shrinkageWeight(n, priorStrength);
  let level = "insufficient";
  let label = "Insufficient evidence";
  if (n >= 30 && weight >= 0.78) { level = "strong"; label = "Strong evidence"; }
  else if (n >= 14 && weight >= 0.62) { level = "moderate"; label = "Moderate evidence"; }
  else if (n >= 5 && weight >= 0.38) { level = "weak"; label = "Weak evidence"; }
  else if (n >= 2) { level = "early"; label = "Early signal"; }
  return { n, level, label, factor: weight, weight, priorStrength };
}

export function shrinkTowardPrior(observed, prior, sampleSize = 0, priorStrength = 8) {
  const obs = Number(observed);
  const base = Number(prior);
  if (!Number.isFinite(obs) && !Number.isFinite(base)) return null;
  if (!Number.isFinite(obs)) return base;
  if (!Number.isFinite(base)) return obs;
  const w = shrinkageWeight(sampleSize, priorStrength);
  return base * (1 - w) + obs * w;
}
