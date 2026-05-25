# Snooker Practice PWA v5.7.56

## v5.7.56 — ETU calibration pass

This release builds on the stable v5.7.55 prediction/bootstrap baseline and refines Effective Training Units inside Stats > Predictions.

### Main changes

- Separates **raw ETU** from **effective ETU**.
- Adds calibrated diminishing returns for session duration, especially after roughly 90 minutes.
- Adds ETU component breakdown: duration, diversity, routine density, pressure, transfer, adaptive alignment, challenge quality, subjective quality, and fatigue.
- Updates the ETU helper copy so the metric is clearly framed as a development-load signal, not a volume target.
- Keeps ETU history visuals, cumulative ETU path, benchmark references, prediction visuals, and bootstrap-safe rendering.

### Compatibility

- No storage schema changes.
- No log migration changes.
- Existing logs remain compatible; missing fatigue/quality/adaptive fields fall back to neutral ETU weights.

### Build hygiene

- Updated build label, service-worker cache version, module cache-busting references, index build text, and README metadata to v5.7.56.
- JavaScript syntax, JSON validity, duplicate-function scan, and zip integrity checked.
