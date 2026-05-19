// Pure inference utilities. No DOM access, no app state mutation.
function safeMaxLocal(arr, fallback = null) {
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

export function gaussianSample(mean = 0, sd = 1) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Number(mean || 0) + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * Math.max(0, Number(sd) || 0);
}

export function gammaSample(shape = 1, scale = 1) {
  const k = Math.max(0.0001, Number(shape) || 1);
  const theta = Math.max(0.0001, Number(scale) || 1);
  if (k < 1) {
    const u = Math.random();
    return gammaSample(k + 1, theta) * Math.pow(Math.max(u, 1e-12), 1 / k);
  }
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (let i = 0; i < 80; i++) {
    let x;
    let v;
    do {
      x = gaussianSample(0, 1);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * Math.pow(x, 4)) return theta * d * v;
    if (Math.log(Math.max(u, 1e-12)) < 0.5 * x * x + d * (1 - v + Math.log(v))) return theta * d * v;
  }
  return theta * k;
}

export function betaSample(alpha = 2, beta = 2) {
  const a = Math.max(0.0001, Number(alpha) || 2);
  const b = Math.max(0.0001, Number(beta) || 2);
  const x = gammaSample(a, 1);
  const y = gammaSample(b, 1);
  const total = x + y;
  if (!Number.isFinite(total) || total <= 0) return a / (a + b);
  return clampNumber(x / total, 0, 1, a / (a + b));
}



export function bayesianChangePointEstimate(values = [], options = {}) {
  const xs = (values || []).map(Number).filter(Number.isFinite);
  const n = xs.length;
  const minN = Math.max(8, Number(options.minN) || 10);
  const minSide = Math.max(3, Number(options.minSide) || 4);
  if (n < minN || n < minSide * 2 + 1) {
    return {
      state: "insufficient",
      label: "Insufficient data",
      n,
      probability: 0,
      bestIndex: null,
      direction: "none",
      delta: 0,
      detail: "Need more observations before Bayesian change-point scoring is useful."
    };
  }

  const mean = arr => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
  const variance = arr => {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    return arr.reduce((a, x) => a + Math.pow(x - m, 2), 0) / Math.max(1, arr.length - 1);
  };
  const globalMean = mean(xs);
  const globalVar = Math.max(16, variance(xs));
  const sigma2 = Math.max(16, Number(options.sigma2) || globalVar);
  const priorStrength = Math.max(0.25, Number(options.priorStrength) || 4);
  const minAbsDelta = Math.max(2, Number(options.minAbsDelta) || 3);

  function logSegmentMarginal(arr) {
    if (!arr.length) return -1e9;
    const k = arr.length;
    const m = mean(arr);
    const sse = arr.reduce((a, x) => a + Math.pow(x - m, 2), 0);
    const shrinkPenalty = (priorStrength * k / (priorStrength + k)) * Math.pow(m - globalMean, 2);
    const normalizer = -0.5 * k * Math.log(2 * Math.PI * sigma2) - 0.5 * Math.log(1 + k / priorStrength);
    return normalizer - (sse + shrinkPenalty) / (2 * sigma2);
  }

  const nullLog = logSegmentMarginal(xs);
  const candidates = [];
  for (let split = minSide; split <= n - minSide; split += 1) {
    const left = xs.slice(0, split);
    const right = xs.slice(split);
    const leftMean = mean(left);
    const rightMean = mean(right);
    const delta = rightMean - leftMean;
    const logLikelihood = logSegmentMarginal(left) + logSegmentMarginal(right);
    candidates.push({ split, logLikelihood, leftMean, rightMean, delta });
  }
  if (!candidates.length) {
    return { state: "insufficient", label: "Insufficient data", n, probability: 0, bestIndex: null, direction: "none", delta: 0, detail: "Need two valid windows before scoring a shift." };
  }
  candidates.sort((a, b) => b.logLikelihood - a.logLikelihood);
  const best = candidates[0];
  const allLogs = [nullLog, ...candidates.map(c => c.logLikelihood)];
  const maxLog = safeMaxLocal(allLogs, nullLog);
  const nullWeight = Math.exp(Math.max(-80, nullLog - maxLog));
  const splitWeights = candidates.map(c => Math.exp(Math.max(-80, c.logLikelihood - maxLog)));
  const totalWeight = nullWeight + splitWeights.reduce((a, b) => a + b, 0);
  const rawProbability = totalWeight > 0 ? splitWeights[0] / totalWeight : 0;
  const deltaScale = clampNumber(Math.abs(best.delta) / Math.max(minAbsDelta, Math.sqrt(sigma2) * 0.35), 0, 1, 0);
  const probability = clampNumber(rawProbability * (0.35 + 0.65 * deltaScale), 0, 0.99, 0);
  let state = "mixed";
  let label = "No confirmed shift";
  if (probability >= 0.72 && best.delta >= minAbsDelta) { state = "breakthrough"; label = "Probable breakthrough"; }
  else if (probability >= 0.72 && best.delta <= -minAbsDelta) { state = "slump"; label = "Probable slump"; }
  else if (probability >= 0.52 && Math.abs(best.delta) >= minAbsDelta) { state = best.delta > 0 ? "possible_breakthrough" : "possible_slump"; label = best.delta > 0 ? "Possible breakthrough" : "Possible slump"; }
  else if (Math.abs(best.delta) < minAbsDelta && probability < 0.45) { state = "plateau"; label = "Likely plateau / stable"; }
  const pct = Math.round(probability * 100);
  const direction = best.delta > 0 ? "positive" : best.delta < 0 ? "negative" : "flat";
  return {
    state,
    label,
    n,
    probability,
    probabilityPct: pct,
    bestIndex: best.split,
    direction,
    delta: best.delta,
    priorAvg: best.leftMean,
    recentAvg: best.rightMean,
    severity: probability * Math.min(2.5, Math.abs(best.delta) / Math.sqrt(sigma2 || 1)),
    candidates: candidates.slice(0, 5).map(c => ({split:c.split, delta:c.delta, logLikelihood:c.logLikelihood})),
    detail: `${pct}% probability of a ${direction === "positive" ? "positive" : direction === "negative" ? "negative" : "flat"} structural shift around observation ${best.split}; posterior windows ${best.leftMean.toFixed(1)} → ${best.rightMean.toFixed(1)}.`
  };
}

export function thompsonRecommendationSample(options = {}) {
  const mean = clampNumber(options.mean, -200, 300, 0);
  const uncertainty = clampNumber(options.uncertainty, 0, 80, 12);
  const explorationBonus = clampNumber(options.explorationBonus, -50, 80, 0);
  const posterior = options.posterior || null;
  const evidenceWeight = clampNumber(options.evidenceWeight, 0, 1, 0.35);
  let method = "normal";
  let drawPct = null;
  let posteriorSignal = 0;
  let posteriorUncertainty = 0;
  if (posterior && Number.isFinite(Number(posterior.alpha)) && Number.isFinite(Number(posterior.beta))) {
    drawPct = betaSample(Number(posterior.alpha), Number(posterior.beta)) * 100;
    const posteriorMeanPct = clampNumber(Number(posterior.mean) * 100, 0, 100, 50);
    posteriorSignal = (drawPct - 50) * 0.28 + (posteriorMeanPct - 50) * 0.12;
    posteriorUncertainty = Math.max(0, Number(posterior.upper || 0) - Number(posterior.lower || 0)) * 100 * 0.18;
    method = "beta";
  }
  const residualNoise = gaussianSample(0, uncertainty * (0.22 + 0.28 * (1 - evidenceWeight)) + posteriorUncertainty);
  const sampledValue = mean + posteriorSignal + residualNoise + explorationBonus;
  return {
    sampledValue: clampNumber(sampledValue, -100, 250, mean),
    drawPct,
    posteriorSignal,
    posteriorUncertainty,
    method
  };
}



export function kalmanCurrentFormEstimate(observations = [], options = {}) {
  const rows = (observations || [])
    .map((row, index) => ({
      index,
      score: Number(row && row.score),
      daysGap: Math.max(0, Number(row && row.daysGap) || 0),
      fatigue: Number(row && row.fatigue),
      focus: Number(row && row.focus),
      confidence: Number(row && row.confidence)
    }))
    .filter(row => Number.isFinite(row.score));

  const minN = Math.max(3, Number(options.minN) || 6);
  if (rows.length < minN) {
    return {
      state: "insufficient",
      label: "Insufficient form data",
      n: rows.length,
      current: null,
      baseline: null,
      delta: 0,
      uncertainty: null,
      observationNoise: null,
      detail: "Need more logs before estimating current form."
    };
  }

  const firstScores = rows.slice(0, Math.min(rows.length, Math.max(4, Math.ceil(rows.length * 0.25)))).map(r => r.score);
  const allScores = rows.map(r => r.score);
  let x = Number.isFinite(Number(options.initialState)) ? Number(options.initialState) : firstScores.reduce((a,b)=>a+b,0) / firstScores.length;
  let P = Math.max(16, Math.pow(Number(options.initialUncertainty) || 12, 2));
  const processNoiseBase = Math.max(0.25, Number(options.processNoise) || 2.2);
  const baseObservationNoise = Math.max(9, Math.pow(Number(options.observationNoise) || 11, 2));
  const trajectory = [];

  rows.forEach(row => {
    const fatiguePenalty = Number.isFinite(row.fatigue) ? Math.max(0, row.fatigue - 3) * 0.28 : 0;
    const focusNoise = Number.isFinite(row.focus) ? Math.max(0, 3 - row.focus) * 0.22 : 0;
    const confidenceNoise = Number.isFinite(row.confidence) ? Math.max(0, 3 - row.confidence) * 0.16 : 0;
    const contextNoiseMultiplier = 1 + fatiguePenalty + focusNoise + confidenceNoise;
    const gapInflation = Math.min(5, row.daysGap || 0) * processNoiseBase;
    P = P + processNoiseBase + gapInflation;
    const R = baseObservationNoise * contextNoiseMultiplier;
    const K = P / (P + R);
    x = x + K * (row.score - x);
    P = (1 - K) * P;
    trajectory.push({state: x, uncertainty: Math.sqrt(Math.max(P, 0)), gain: K, observationNoise: Math.sqrt(R), score: row.score});
  });

  const current = trajectory.length ? trajectory[trajectory.length - 1].state : x;
  const uncertainty = trajectory.length ? trajectory[trajectory.length - 1].uncertainty : Math.sqrt(P);
  const observationNoise = trajectory.length ? trajectory[trajectory.length - 1].observationNoise : Math.sqrt(baseObservationNoise);
  const baselineWindow = Math.max(4, Math.min(12, Math.floor(trajectory.length * 0.45)));
  const baselineStates = trajectory.slice(0, Math.max(1, trajectory.length - baselineWindow)).map(t => t.state);
  const baseline = baselineStates.length ? baselineStates.reduce((a,b)=>a+b,0) / baselineStates.length : allScores.reduce((a,b)=>a+b,0) / allScores.length;
  const delta = current - baseline;
  const confidence = clampNumber(1 - uncertainty / 22, 0.15, 0.95, 0.5);
  let state = "stable";
  let label = "Stable form";
  if (delta >= 5 && confidence >= 0.35) { state = "positive"; label = "Positive current form"; }
  else if (delta <= -5 && confidence >= 0.35) { state = "negative"; label = "Negative current form"; }
  else if (uncertainty >= 11 || observationNoise >= 18) { state = "volatile"; label = "Unstable form"; }
  const direction = delta >= 0 ? "above" : "below";
  return {
    state,
    label,
    n: rows.length,
    current,
    baseline,
    delta,
    rawDelta: delta,
    adjustedDelta: delta * confidence,
    uncertainty,
    observationNoise,
    confidence,
    index: Math.round(clampNumber(50 + delta * 1.8, 0, 100, 50)),
    trajectory,
    detail: `Kalman-style form estimate is ${Math.abs(delta).toFixed(1)} pts ${direction} baseline (${current.toFixed(1)} vs ${baseline.toFixed(1)}), with ${confidence >= 0.65 ? "higher" : confidence >= 0.4 ? "moderate" : "low"} confidence.`
  };
}
