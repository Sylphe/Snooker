function finiteNumber(value, fallback=0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function betaPosterior(successes, attempts, priorAlpha=2, priorBeta=2, priorMeta={}) {
  const nRaw = finiteNumber(attempts, 0);
  const sRaw = finiteNumber(successes, 0);
  const n = Math.max(0, nRaw);
  const s = Math.max(0, Math.min(n, sRaw));
  const pa = Math.max(0.0001, finiteNumber(priorAlpha, 2));
  const pb = Math.max(0.0001, finiteNumber(priorBeta, 2));
  const alpha = pa + s;
  const beta = pb + Math.max(0, n - s);
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / (Math.pow(alpha + beta, 2) * (alpha + beta + 1));
  const sd = Math.sqrt(Math.max(0, variance));
  return {
    alpha,
    beta,
    attempts:n,
    rawAttempts:Math.max(0, finiteNumber(priorMeta?.rawAttempts, n)),
    successes:s,
    rawSuccesses:Math.max(0, finiteNumber(priorMeta?.rawSuccesses, s)),
    priorAlpha:pa,
    priorBeta:pb,
    priorStrength:pa + pb,
    priorMean:pa / (pa + pb),
    priorSource:priorMeta?.source || "generic",
    priorLabel:priorMeta?.label || "Generic Beta(2,2) prior",
    priorDetail:priorMeta?.detail || "Used when personalized evidence is insufficient.",
    mean,
    lower:Math.max(0, mean - 1.96 * sd),
    upper:Math.min(1, mean + 1.96 * sd),
    sd
  };
}

function bayesianLogUsesSideSplit(log) {
  const mode = log?.sideMode || log?.sideSplitMode || log?.sideSplit;
  return !!(log?.sideSplitEnabled || mode === "left_right" || mode === "lr" || mode === "side_split" || log?.sideScores || log?.leftSideScore !== undefined || log?.rightSideScore !== undefined || log?.sideLeftScore !== undefined || log?.sideRightScore !== undefined);
}

function bayesianAttemptMode(log) {
  const mode = log?.attemptMode || log?.sideAttemptMode || log?.leftRightAttemptMode;
  return mode === "per_side" || mode === "perSide" || mode === "side" ? "per_side" : "shared";
}

function bayesianEffectiveAttempts(log) {
  const attempts = Math.max(0, Number(log?.attempts || 0));
  return bayesianLogUsesSideSplit(log) && bayesianAttemptMode(log) === "per_side" ? attempts * 2 : attempts;
}

export const BAYESIAN_DECAY_HALF_LIFE_DAYS = 30;

export function aggregateSuccessRateLogs(logs, options = {}) {
  const nowRaw = Number(options.now || Date.now());
  const now = Number.isFinite(nowRaw) ? nowRaw : Date.now();
  const halfLifeRaw = Number(options.halfLifeDays || BAYESIAN_DECAY_HALF_LIFE_DAYS);
  const halfLifeDays = Number.isFinite(halfLifeRaw) && halfLifeRaw > 0 ? halfLifeRaw : BAYESIAN_DECAY_HALF_LIFE_DAYS;
  return (logs || []).reduce((acc, l) => {
    const attempts = bayesianEffectiveAttempts(l);
    const scoreRaw = Number(l?.score ?? 0);
    const score = Number.isFinite(scoreRaw) ? Math.max(0, scoreRaw) : 0;
    if (attempts > 0) {
      const parsedDate = l?.createdAt ? new Date(l.createdAt).getTime() : now;
      const safeDate = Number.isFinite(parsedDate) ? Math.min(parsedDate, now) : now;
      const daysOld = Math.max(0, (now - safeDate) / 86400000);
      const weightRaw = Math.pow(0.5, daysOld / halfLifeDays);
      const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? weightRaw : 1;
      acc.attempts += attempts * weight;
      acc.successes += Math.min(score, attempts) * weight;
      acc.rawAttempts += attempts;
      acc.rawSuccesses += Math.min(score, attempts);
      acc.sessions += 1;
      acc.effectiveWeight += weight;
    }
    return acc;
  }, {successes:0, attempts:0, rawSuccesses:0, rawAttempts:0, sessions:0, effectiveWeight:0, halfLifeDays});
}

export function bayesianReliabilityLabel(posterior) {
  const rawAttempts = Number(posterior?.rawAttempts ?? posterior?.attempts ?? 0);
  if (!posterior || rawAttempts < 10) return {level:"low", label:"Low confidence", detail:"Not enough attempts yet."};
  const width = posterior.upper - posterior.lower;
  if (rawAttempts >= 80 && width <= 0.18) return {level:"high", label:"High confidence", detail:"Stable enough for target decisions."};
  if (rawAttempts >= 30 && width <= 0.28) return {level:"medium", label:"Medium confidence", detail:"Usable, but keep collecting data."};
  return {level:"low", label:"Low confidence", detail:"Wide uncertainty band."};
}

export function formatPercent(value, digits=1) {
  return `${(Number(value || 0) * 100).toFixed(digits)}%`;
}

export function bayesianAdvice(posterior, targetPct=0) {
  if (!posterior || !posterior.attempts) return "Log more attempts before interpreting this drill.";
  const target = Number(targetPct || 0) / 100;
  const reliability = bayesianReliabilityLabel(posterior);
  if (reliability.level === "low") return "Repeat this drill to reduce uncertainty before changing difficulty.";
  if (target && posterior.lower >= target) return "Posterior confidence is above target; consider increasing difficulty or stretch target.";
  if (target && posterior.upper < target) return "Posterior confidence is below target; keep difficulty stable and rebuild consistency.";
  if (target) return "Credible interval overlaps target; keep the same target and collect more data.";
  return "Use this as a baseline ability estimate.";
}


export function bayesianRecommendationSignal({posterior, targetPct=0}) {
  if (!posterior || !posterior.attempts) {
    return {scoreDelta:8, label:"baseline needed", action:"repeat", reason:"no Bayesian baseline yet"};
  }
  const reliability = bayesianReliabilityLabel(posterior);
  const target = Number(targetPct || 0) / 100;
  const width = posterior.upper - posterior.lower;

  if (reliability.level === "low") {
    return {
      scoreDelta:16,
      label:"uncertainty high",
      action:"repeat",
      reason:`Bayesian uncertainty is high (${formatPercent(width)} interval width)`
    };
  }

  if (target && posterior.lower >= target) {
    return {
      scoreDelta:-6,
      label:"ready to progress",
      action:"progress",
      reason:"credible interval is above target"
    };
  }

  if (target && posterior.upper < target) {
    return {
      scoreDelta:14,
      label:"rebuild consistency",
      action:"stabilize",
      reason:"credible interval is below target"
    };
  }

  if (target) {
    return {
      scoreDelta:6,
      label:"target overlap",
      action:"hold",
      reason:"credible interval overlaps target"
    };
  }

  return {
    scoreDelta:0,
    label:"baseline valid",
    action:"hold",
    reason:"Bayesian baseline available"
  };
}


export function bayesianActionPolicy(signal, posterior, targetPct=0) {
  const action = signal?.action || "hold";
  const target = Number(targetPct || 0);
  const ability = posterior ? formatPercent(posterior.mean) : "N/A";
  const interval = posterior ? `${formatPercent(posterior.lower)}–${formatPercent(posterior.upper)}` : "N/A";

  if (action === "repeat") {
    return {
      action,
      title:"Repeat drill",
      instruction:"Repeat this drill before changing difficulty. The current evidence base is still too uncertain.",
      coaching:"Collect more attempts under the same setup so the estimate can tighten.",
      badge:"Repeat",
      detail:`Posterior ability ${ability}; credible interval ${interval}.`
    };
  }

  if (action === "progress") {
    return {
      action,
      title:"Increase difficulty",
      instruction:"Increase difficulty slightly: harder position, tighter constraint, fewer attempts, or higher target.",
      coaching:"Progress only one variable at a time so the next logs remain interpretable.",
      badge:"Progress",
      detail:`Posterior ability ${ability} is confidently above the ${target || "current"} target.`
    };
  }

  if (action === "stabilize" || action === "rebuild") {
    return {
      action:"rebuild",
      title:"Deload / rebuild",
      instruction:"Simplify the drill or deload the target until consistency recovers.",
      coaching:"Use easier positions or reduce constraints; rebuild mechanics before increasing pressure.",
      badge:"Rebuild",
      detail:`Posterior credible interval ${interval} is below target.`
    };
  }

  return {
    action:"hold",
    title:"Keep target",
    instruction:"Keep the current target and continue logging. The credible interval overlaps the target.",
    coaching:"Do not raise difficulty yet; collect more evidence at the same setup.",
    badge:"Hold",
    detail:`Posterior ability ${ability}; credible interval ${interval}.`
  };
}



