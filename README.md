# Snooker Practice PWA — v5.7.61 Smart Builder ETU integration

This build formalizes ETU by skill domain and improves the Predictions-domain ledger layout for mobile readability.

## Changes
- Added a clearer ETU by skill domain ledger in Predictions.
- Allocates effective ETU across break-building, cue-ball control, long potting, safety, pressure, tactical and rest-play exposure.
- Shows each domain's effective ETU, raw ETU, logs, minutes, hit-rate, current level and progress toward the next L-band.
- Fixed the compressed ETU value column by giving ETU values a stable right-side width and tabular numeric formatting.
- Retained v5.7.59.2 prediction calibration logic: sustainable pace caps, confidence penalties, nonlinear milestone scaling and benchmark forecastability guards.
- Updated build name, cache version, module cache-busting references and README.

## Compatibility
No schema, storage, routine, or log changes.

---

# Snooker Practice PWA — v5.7.61 Prediction calibration v2

This build adds the second prediction calibration pass: forecasts now use domain-specific ETU, sustainable pace caps, benchmark-distance guards, confidence penalties, nonlinear milestone scaling, and a Domain ETU ledger inside Predictions. No storage schema or log migration changes.

# Snooker Practice PWA v5.7.59

## v5.7.59 — Recovery/readiness ETU helper and compact scope fix

This maintenance release builds on v5.7.58 and keeps the recovery/readiness engine intact while improving explainability and mobile usability.

### Changes
- Expanded the ETU helper with clearer explanation of raw ETU vs effective ETU, diminishing returns after ~90 minutes, quality/fatigue weighting, and why ETU should not be maximized mechanically.
- Removed duplicate Recovery/readiness output from the ETU Development Load panel; recovery/readiness now appears only in its dedicated Prediction module.
- Kept ETU Development Load focused on historical load, rolling windows, cumulative ETU path, quality mix, and component calibration.
- Made the sticky Analytics Scope panel more compact on mobile and collapsed by default to avoid blocking the screen.
- Updated build name, cache version, module cache-busting references, and README.

### Compatibility
No schema, storage, routine, or log changes.

