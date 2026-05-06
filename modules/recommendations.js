export function recommendationMode(routine) {
  return ["active", "occasional", "excluded"].includes(routine?.recommendationMode) ? routine.recommendationMode : "active";
}

export function isRecommendationEligible(routine) {
  return recommendationMode(routine) !== "excluded";
}

export function recommendationRecencyCap(routine) {
  return recommendationMode(routine) === "occasional" ? 7 : 14;
}

export function recommendationUndertrainingMultiplier(routine) {
  return recommendationMode(routine) === "occasional" ? 0.35 : 1;
}

export function recommendationModeLabel(value) {
  return {
    active:"Active recommendation",
    occasional:"Occasional only",
    excluded:"Excluded from recommendations"
  }[value] || "Active recommendation";
}

export function cappedRecencyDays(days, routine) {
  return Math.min(Number(days || 0), recommendationRecencyCap(routine));
}

export function applyRecommendationCap(score, routine) {
  return recommendationMode(routine) === "occasional" ? Math.min(score, 75) : score;
}

export function recommendationScoreFloor(routine) {
  return recommendationMode(routine) === "excluded" ? -999 : 0;
}


export function adaptiveActionForState(state) {
  switch(state.phase) {
    case "baseline":
      return "Log baseline data with normal target. Do not adjust difficulty yet.";
    case "stabilize":
      return "Repeat current setup. Keep target stable and focus on consistency.";
    case "progress":
      return state.upgrade ? "Increase target or constraint. Apply target version if appropriate." : "Raise difficulty slightly or add a constraint.";
    case "vary":
      return "Inject one variation: position, distance, cushion, or random order.";
    case "recover":
      return "Use lighter block. Reduce duration or complexity; avoid target increase.";
    case "refresh":
      return "Re-test this drill to keep the dataset current.";
    default:
      return "Maintain current drill and collect more evidence.";
  }
}

export function scoreAdaptivePriority(state, goal="auto", undertrainedBonus=0) {
  let score = 0;
  const r = state.routine;
  if (!r) return -999;
  if (r.isAnchor) score += 18;
  if (state.hit !== null) score += Math.max(0, 75 - state.hit) * 0.4;
  if (state.psi && state.psi.psi < 70) score += (70 - state.psi.psi) * 0.35;
  if (state.drift && state.drift.deltaPct < 0) score += Math.min(20, Math.abs(state.drift.deltaPct));
  if (state.plateau && state.plateau.isPlateau) score += 14;
  if (state.days >= 7) score += Math.min(12, Math.min(state.days, recommendationRecencyCap(r)));
  if (undertrainedBonus) score += undertrainedBonus * 0.8 * recommendationUndertrainingMultiplier(r);

  if (goal === "stability") {
    if (state.phase === "stabilize" || r.isAnchor) score += 25;
  } else if (goal === "progression") {
    if (state.phase === "progress" || state.upgrade) score += 25;
  } else if (goal === "recovery") {
    if (state.phase === "recover" || (state.fatigue && state.fatigue.slope < 0)) score += 25;
  } else if (goal === "variety") {
    if (state.phase === "vary" || state.days >= 10) score += 25;
  }
  return applyRecommendationCap(score, r);
}

export function scoreMixedStrategyRoutine({routine, stats, strategy, days, undertrainedBonus}) {
  if (recommendationMode(routine) === "excluded") return -999;
  let score = Number(stats?.score || 0);
  const cappedDays = cappedRecencyDays(days, routine);
  const undertraining = Number(undertrainedBonus || 0) * recommendationUndertrainingMultiplier(routine);
  if (strategy === "exploit") {
    score += (stats.hit === null ? 5 : Math.max(0, 80 - stats.hit) * 0.55);
  } else if (strategy === "explore") {
    score += Math.min(24, cappedDays * 1.5);
    score += undertraining * 1.1;
  } else {
    score += Math.min(14, cappedDays);
    score += routine.isAnchor ? 8 : 0;
  }
  if (recommendationMode(routine) === "occasional") score -= 8;
  return score;
}
