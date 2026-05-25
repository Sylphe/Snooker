# Snooker Practice PWA v5.7.50

## v5.7.50 — Prediction bootstrap duplicate-function fix

This release fixes the v5.7.49 bootstrap/hydration failure caused by duplicate prediction helper function declarations in the ES module. The prediction logic remains guarded and keeps the nonlinear ETU calibration from v5.7.49.

### Fixes

- Removed duplicate prediction helper function declarations that prevented `modules/app-core.js` from loading as an ES module.
- Preserved nonlinear ETU scaling and sustainable-pace forecast wording.
- Kept prediction rendering bootstrap-safe so prediction failures do not block storage hydration.
- Updated build label, service-worker cache version, module cache-busting references, index build text, and README metadata to v5.7.50.

### Notes

- No storage schema change.
- No log migration.
- No IndexedDB/localStorage data impact.
