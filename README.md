# Snooker Practice PWA v4.40.0

## v4.40.0 — Bayesian Change-Point Detection Upgrade

Built from the confirmed-working v4.39.0 Kalman Current Form package.

### Added / changed
- Upgrades the existing change-point detector with Bayesian-style structural-shift probabilities.
- Scores likely breakthrough, slump, plateau/stable, and mixed/noisy states with adjusted probability outputs.
- Adds skill-level Bayesian change-point rows using existing skill tags.
- Keeps the legacy window-based detector as a guarded fallback.
- Uses safe normalized-score extraction so malformed logs do not break the insights render path.

### Safety / stability approach
- No storage schema changes.
- No hydration changes.
- No session-state changes.
- Bayesian change-point logic is guarded and falls back to the legacy detector if it fails.
- Syntax and duplicate-declaration checks performed during packaging.

### Build
- Version: v4.40.0
- Build timestamp: 2026-05-18 17:15 CEST
- Cache/module refs: v4.40.0
