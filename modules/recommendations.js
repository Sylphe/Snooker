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
