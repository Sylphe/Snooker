# Snooker Practice PWA v5.7.49

## v5.7.49 — Nonlinear ETU prediction calibration

This release recalibrates the Predictions tab so Effective Training Unit forecasts no longer extrapolate short-term training bursts linearly into unrealistic level timelines.

### Prediction calibration changes

- Replaced raw recent ETU/week conversion with a capped sustainable development pace.
- Added nonlinear ETU scaling for higher break-class milestones.
- Stable 50+, stable 70+, and century-capable forecasts now require progressively larger consolidation loads.
- Century-capable forecasts are treated as speculative unless stronger evidence exists.
- Break milestone rows now show near-term / mid-term / long-term / speculative tiers.
- Calendar translations now say “at sustainable pace” instead of “at recent pace”.
- ETU helper now explains that higher levels require consolidation, variance reduction and pressure stability, not only more logged time.

### Safety

- No schema, log, storage, routine-pack, or IndexedDB changes.
- Prediction renderer remains guarded so it cannot block bootstrap or hydration.
- Build label, service-worker cache version, module cache-busting references, index build text, and README metadata updated to v5.7.49.
