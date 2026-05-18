# Snooker Practice PWA v4.32.1

## v4.32.1 — Target Credible Intervals Stability Patch

Build timestamp: 2026-05-18 13:16 CEST (Europe/Paris).

This release is a stability checkpoint on top of v4.32.0. It keeps the Target Credible Intervals / Bayesian Calibration v1 feature set, but hardens it so malformed or legacy logs cannot break the bootstrap, tab binding, data hydration, or the Insights render path.

### Changes

- Added safe score extraction for target credible interval calculations.
- Wrapped target interval calculations, recommendation target reasons, and the target interval insight card in defensive guards.
- Malformed legacy logs are skipped for target-range calculations instead of throwing inside `renderAll()`.
- Removed duplicated unused `renderRecommendationDiagnostics()` helpers from module files and the service worker; the app-core definition is retained.
- Removed the unused `completedLogs` property from synthetic pressure-session records; pressure sessions continue to persist `logIds`.
- Updated app version, build metadata, module query strings, and service worker cache name to v4.32.1.

### Notes

This build intentionally does not include v4.33 Dynamic Difficulty Adjustment. It is designed as a clean v4.32 checkpoint before reintroducing v4.33 logic.

Local-first PWA. No account. No backend. Export JSON backups regularly.
