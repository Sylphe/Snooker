# Snooker Practice PWA v4.36.3

## v4.36.3 — Smooth Evidence / Inference Utilities

Built from the confirmed working v4.36.1 Bayesian Practice Optimization bootstrap-fix package.

### Added / changed
- Added safe event binding for high-risk root-level DOM listeners.
- Hardened `bootstrapIndexedDBStorage()` with outer error capture and safe render fallback.
- Reworked `renderAll()` so individual panel failures are caught and logged instead of blocking the entire UI.
- Added reusable `safeCall()`, `safeOn()`, `safeRenderAll()`, and finite-number guard utilities.
- Preserved v4.36 Bayesian Practice Optimization behavior.

### Safety / stability approach
- No storage schema changes.
- No hydration data-model changes.
- No new Bayesian feature logic.
- No broad event-delegation rewrite.
- No IndexedDB/session transaction redesign.
- Syntax and duplicate-declaration checks performed during packaging.

### Build
- Version: v4.36.3
- Build timestamp: 2026-05-18 16:04 CEST
- Cache/module refs: v4.36.3

### v4.36.3 changes
- Added new pure `modules/inference.js` utility module.
- Replaced abrupt evidence step factors with smooth shrinkage-based weighting.
- Reduced sample-size threshold jumps in recommendation confidence.
- Optimizer uncertainty fallback now uses shrinkage weighting.
- No storage, hydration, or session schema changes.
