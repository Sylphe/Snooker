# Snooker Practice PWA v4.38.0

## v4.38.0 — Thompson Sampling v2

Built from the confirmed-working v4.36.3 Smooth Evidence / Inference Utilities package.

### Added / changed
- Added hierarchical Bayesian skill/drill priors for success-rate routines.
- Uses a skill-family prior from primary skill history when enough related evidence exists.
- Uses a global user success-rate fallback prior when skill-family evidence is insufficient.
- Falls back to generic Beta(2,2) when personalized evidence is still insufficient.
- Shows prior source in True Skill panels.
- Adds personalized-prior reasons to recommendations.
- Adds a Personalized Priors insight card.

### Safety / stability approach
- No storage schema changes.
- No hydration changes.
- No session-state changes.
- Prior calculations are guarded and fall back to generic priors on error.
- Syntax and duplicate-declaration checks performed during packaging.

### Build
- Version: v4.38.0
- Build timestamp: 2026-05-18 16:45 CEST
- Cache/module refs: v4.38.0
