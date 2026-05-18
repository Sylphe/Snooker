# Snooker Practice PWA v4.39.0

## v4.39.0 — Kalman-style Current Form

Built from the confirmed-working v4.38.0 Thompson Sampling v2 package.

### Added / changed
- Adds a pure Kalman-style current-form estimator in `modules/inference.js`.
- Separates estimated current form from noisy daily observed scores.
- Uses fatigue, focus, and confidence reflection inputs as observation-noise signals rather than direct hard penalties.
- Updates the Current Form insight card to show Kalman-style uncertainty.
- Keeps current-form recommendation adjustments guarded and additive.

### Safety / stability approach
- No storage schema changes.
- No hydration changes.
- No session-state changes.
- Kalman calculations are guarded with fallback to the previous recent-vs-baseline method if needed.
- Syntax and duplicate-declaration checks performed during packaging.

### Build
- Version: v4.39.0
- Build timestamp: 2026-05-18 17:02 CEST
- Cache/module refs: v4.39.0
