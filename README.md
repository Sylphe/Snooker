# Snooker Practice PWA v4.36.1

## v4.36.1 — Bayesian Practice Optimization v1 + Smooth Evidence Weighting

Built from the confirmed working v4.36.1 Bayesian Practice Optimization package.

### Included
- Pure inference utility module (`modules/inference.js`) with no DOM access or state mutation.
- Smooth Bayesian-style evidence weighting using continuous shrinkage instead of abrupt sample-size ladders.
- Evidence labels remain user-readable while internal confidence factors now move gradually as sample size grows.
- Bayesian optimizer uncertainty fallback now uses shrinkage-weighted uncertainty.
- Recommendation/insight evidence badges continue to work without changing storage or hydration.

### Safety notes
- No storage, hydration, IndexedDB, or session persistence changes.
- No top-level inference execution during bootstrap.
- Inference functions are pure and only called from guarded analytics/recommendation paths.

### Build
- Version: v4.36.1
- Build timestamp: 2026-05-18 15:08 CEST
- Cache/module refs: v4.36.1
