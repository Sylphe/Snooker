# Snooker Practice PWA v5.6.0

## v5.6.0 — Coaching Performance Pass

Built from the working v5.5.28 render/I-O polish baseline.

This release applies the next coaching/recommendation performance optimizations on top of v5.5.28:

- Adds a conservative Bayesian decay cutoff to avoid processing logs with negligible statistical weight.
- Passes routine objects and grouped log maps through adaptive/recommendation hot paths to reduce redundant routine lookups.
- Consolidates coaching-engine base metrics so target rate and skill-gap calculations do not rescan the same logs repeatedly.
- Preserves the v5.5.28 render/I-O polish layer: SVG downsampling, table scroll wrappers, case-insensitive SW matching, local routine-list search rendering, and IndexedDB version-aware connection reuse.

Build timestamp: 2026-05-20 13:32 CEST.


### v5.6.0 changes
- Added conservative Bayesian decay cutoff to skip negligible old-weight logs in hot success-rate aggregation.
- Reduced redundant routine lookups in recommendation/adaptive-session loops by passing routine objects and grouped log maps through hot paths.
- Consolidated coaching-engine base metrics to avoid repeated basic scans for target rate and skill-gap calculations.
