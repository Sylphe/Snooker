# Snooker Practice PWA v4.34.0

## v4.34.0 — Venue / Context Normalization v1

Build timestamp: 2026-05-18 13:52 CEST (Europe/Paris).

This release is built from the stable v4.33.0 safe Dynamic Difficulty checkpoint and adds context normalization without changing historical scores or bootstrap flow.

### Added

- Context-normalized performance insight card.
- Table, time-of-day, and fatigue effect modelling.
- Raw vs context-adjusted average display.
- Context evidence labels for table/time/fatigue effects.
- Routine-level context-normalization signal for recommendations.
- Recommendation reasons now highlight whether recent raw performance was helped or suppressed by context.

### Safety / bootstrap precautions

- No context-normalization logic executes at module top level.
- All context-normalization calculations are guarded with `try/catch`.
- Score extraction uses safe normalization so malformed legacy logs cannot break rendering.
- Historical logs are not rewritten; context adjustment is analytical only.
- Service worker cache name, module query strings, and build metadata are aligned to v4.34.0.

### Preserved from v4.33.0

- Dynamic Difficulty Adjustment v1.
- Target credible intervals.
- Low-N shrinkage.
- Progressive-completion bounds validation.
- Whole-number validation for count-based fields.
- Zero-denominator-safe analytics.
- Improved volatility fallback.

### Validation

- JavaScript syntax checks passed.
- Zip integrity check passed.
