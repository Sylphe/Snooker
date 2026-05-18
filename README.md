# Snooker Practice PWA v4.32.2

## v4.32.2 — Target Credible Intervals Stability + Data Integrity Cleanup

Build timestamp: 2026-05-18 13:37 CEST (Europe/Paris).

This release is a stability and data-integrity checkpoint on top of v4.32.1. It keeps the Target Credible Intervals / Bayesian Calibration v1 feature set, while tightening validation and analytics safeguards before reintroducing v4.33 Dynamic Difficulty Adjustment.

### Changes

- Added safe score extraction for target credible interval calculations.
- Wrapped target interval calculations, recommendation target reasons, and the target interval insight card in defensive guards.
- Malformed legacy logs are skipped for target-range calculations instead of throwing inside `renderAll()`.
- Removed duplicated unused `renderRecommendationDiagnostics()` helpers from module files and the service worker; the app-core definition is retained.
- Removed the unused `completedLogs` property from synthetic pressure-session records; pressure sessions continue to persist `logIds`.
- Added bounded progressive-completion validation so average units, best attempt, completions, and highest break cannot exceed logical limits.
- Enforced whole-number validation for count-based fields such as attempts, made balls, completions, highest break, and side scores in success-rate mode.
- Replaced flat target-upgrade bumps with scoring-type-aware scaling and caps for success-rate and progressive-completion drills.
- Added safe zero-denominator percentage-change handling for drift, plateau, and fatigue calculations.
- Improved new-routine volatility fallback by using global user volatility where available instead of a fixed arbitrary value.
- Updated app version, build metadata, module query strings, and service worker cache name to v4.32.2.

### Notes

This build intentionally does not include v4.33 Dynamic Difficulty Adjustment. It is designed as a clean v4.32 checkpoint before reintroducing v4.33 logic.

Local-first PWA. No account. No backend. Export JSON backups regularly.
