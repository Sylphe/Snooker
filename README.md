# Snooker Practice PWA v4.36.1

## v4.36.1 — Bayesian Practice Optimization v1

Built from the confirmed working v4.35.2 UX Readability Polish Safe package.

### Added
- Bayesian Practice Optimization v1 for uncertainty-aware recommendation ranking.
- Controlled exploration vs exploitation weighting.
- Posterior-style optimizer score layered on top of the existing recommendation engine.
- Exploration bonuses reduced when volatility is high or recovery mode is active.
- Optimizer reasons added to recommendation explanations.
- Bayesian optimization insight card in Insights.

### Safety / stability approach
- No optimizer execution at module top level.
- Optimizer calculations are guarded with defensive `try/catch` wrappers.
- Existing safe score extraction, target intervals, dynamic difficulty, context normalization, and recommendation learning remain intact.
- No hydration, IndexedDB, or bootstrap changes.

### Build
- Version: v4.36.1
- Build timestamp: 2026-05-18 14:57 CEST
- Cache/module refs: v4.36.1
