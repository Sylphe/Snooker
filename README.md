# Snooker Practice PWA v4.35.0

## v4.35.0 — Recommendation Learning v2

Built from stable v4.34.0. This release adds a guarded recommendation-learning layer on top of accepted/skipped/completed feedback.

### Added
- Routine-level recommendation learning profiles from accepted, skipped, and completed recommendations.
- Soft personalized ranking weights: repeated skips down-weight a routine; positive completed outcomes boost it.
- Average score-after / improvement-after-recommendation interpretation.
- Recommendation Learning v2 insight card on the Insights page.
- Learning badge and learning-aware reasons in Smart Recommendations.

### Stability precautions
- No top-level recommendation-learning execution.
- All learning insight calculations are guarded with `try/catch`.
- Recommendation learning is a soft score only; it does not overwrite logs, scores, tags, or historical records.
- Service worker cache name, module query strings, and build metadata are aligned to v4.35.0.

Build timestamp: 2026-05-18 14:02 CEST.
