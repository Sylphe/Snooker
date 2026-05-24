# Snooker Practice PWA v5.7.46

## v5.7.46 — Prediction engine calibration fix

Calibrates the Stats > Predictions layer after v5.7.45 proved too optimistic for benchmark and break-class readiness windows.

### What changed

- Recalibrated benchmark progression forecasts using distance-to-threshold and benchmark evidence.
- Added an evidence-adjusted progression slope separate from raw recent slope.
- Made break milestone windows more conservative and explicitly stable-class oriented.
- Penalized forecasts for volatility and low domain confidence.
- Corrected the main blocker tile so it uses the weakest inferred domain consistently.
- Kept prediction rendering guarded so it cannot block bootstrap, hydration, storage load, or Stats rendering.

### Compatibility

- No schema changes.
- No log migration changes.
- No storage-impacting changes.
- Existing routines, logs, sessions, and backups remain compatible.

### Build discipline

- Build label, service-worker cache version, module cache-busting references, index build text, and README metadata updated to v5.7.46.
