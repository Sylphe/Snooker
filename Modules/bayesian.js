export function betaPosterior(successes, attempts, priorAlpha=2, priorBeta=2) {
  const s = Math.max(0, Number(successes || 0));
  const n = Math.max(0, Number(attempts || 0));
  const alpha = priorAlpha + s;
  const beta = priorBeta + Math.max(0, n - s);
  const mean = alpha / (alpha + beta);
  const variance = (alpha * beta) / (Math.pow(alpha + beta, 2) * (alpha + beta + 1));
  const sd = Math.sqrt(Math.max(0, variance));
  return {
    alpha,
    beta,
    attempts:n,
    successes:s,
    mean,
    lower:Math.max(0, mean - 1.96 * sd),
    upper:Math.min(1, mean + 1.96 * sd),
    sd
  };
}

export function aggregateSuccessRateLogs(logs) {
  return (logs || []).reduce((acc, l) => {
    const attempts = Math.max(0, Number(l.attempts || 0));
    const score = Math.max(0, Number(l.score || 0));
    if (attempts > 0) {
      acc.attempts += attempts;
      acc.successes += Math.min(score, attempts);
      acc.sessions += 1;
    }
    return acc;
  }, {successes:0, attempts:0, sessions:0});
}

export function bayesianReliabilityLabel(posterior) {
  if (!posterior || posterior.attempts < 10) return {level:"low", label:"Low confidence", detail:"Not enough attempts yet."};
  const width = posterior.upper - posterior.lower;
  if (posterior.attempts >= 80 && width <= 0.18) return {level:"high", label:"High confidence", detail:"Stable enough for target decisions."};
  if (posterior.attempts >= 30 && width <= 0.28) return {level:"medium", label:"Medium confidence", detail:"Usable, but keep collecting data."};
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
