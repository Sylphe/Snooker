# Snooker Practice PWA v5.7.54

## v5.7.54 — Prediction visuals and ETU benchmark path

This release builds on the stable v5.7.50 prediction/bootstrap baseline and adds historical Effective Training Unit views inside the Stats > Predictions tab.

### Added

- ETU Development Load panel in Predictions.
- Session ETU timeline for recent training sessions.
- 7-day and 14-day ETU load indicators.
- Recent cumulative ETU path.
- ETU quality mix: micro/recovery, light/maintenance, development, and high-development sessions.
- Helper wording clarifying that ETU is a development-load metric, not a volume target to maximize.

### Technical notes

- Forecast logic remains bootstrap-safe and guarded.
- No storage schema change.
- No log migration.
- No IndexedDB/localStorage data impact.
- Updated build label, service-worker cache version, module cache-busting references, index build text, and README metadata to v5.7.54.


## v5.7.54
- Restored compact prediction visual summary from the prediction visualization layer.
- Kept ETU history visuals added in v5.7.53.
- Reworked cumulative ETU path with axes, labels, and Junior / Club / Senior directional ETU reference lines.
- Updated build name, cache versions, and module references.
