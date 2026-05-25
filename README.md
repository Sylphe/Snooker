# Snooker Practice PWA v5.7.47

## v5.7.47 — Prediction calibration safe rebuild

Rebuilds the Predictions Stats subtab from the v5.7.43 inferred-skill UI clarity baseline, with explicit runtime guards so prediction rendering cannot block bootstrap, storage hydration, or the main Stats render.

### Added
- New Stats > Predictions subtab.
- Probabilistic progression outlook for break milestones, benchmark levels, and domain L-level movement.
- Stable-vs-peak interpretation using existing inferred-skill evidence.

### Safety fix
- Prediction rendering is wrapped in a defensive try/catch.
- Forecast helpers use prediction-specific function names to avoid collisions with existing utility functions.
- Forecasts are rendered only when the Predictions subtab is active.
- No schema, migration, log, IndexedDB, or storage changes.

### Maintenance
- Build label, service-worker cache version, module cache-busting references, index build text, and README metadata updated to v5.7.47.
