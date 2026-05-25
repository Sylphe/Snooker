# Snooker Practice PWA v5.7.48

## v5.7.48 — Effective training load prediction forecast

Rebuilds the Predictions Stats subtab from the v5.7.43 inferred-skill UI clarity baseline, with explicit runtime guards so prediction rendering cannot block bootstrap, storage hydration, or the main Stats render.

### Added
- New Stats > Predictions subtab.
- Probabilistic progression outlook for break milestones, benchmark levels, and domain L-level movement.
- Forecast windows now use Effective Training Units (ETU) instead of raw session counts.
- ETU helper explains how duration, routine diversity, pressure/transfer work, adaptive/recommendation work, target difficulty, subjective quality, and fatigue weight the training load.
- Recent ETU/week pace is used to translate required development load into rough calendar timing.
- Stable-vs-peak interpretation using existing inferred-skill evidence.

### Safety fix
- Prediction rendering is wrapped in a defensive try/catch.
- Forecast helpers use prediction-specific function names to avoid collisions with existing utility functions.
- Forecasts are rendered only when the Predictions subtab is active.
- No schema, migration, log, IndexedDB, or storage changes.

### Maintenance
- Build label, service-worker cache version, module cache-busting references, index build text, and README metadata updated to v5.7.48.
