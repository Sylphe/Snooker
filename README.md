# Snooker Practice PWA v4.33.0

## v4.33.0 — Dynamic Difficulty Adjustment v1

Build timestamp: 2026-05-18 13:44 CEST (Europe/Paris).

This release is built from the stable v4.32.2 checkpoint and reintroduces Dynamic Difficulty Adjustment with bootstrap-safety precautions.

### Added

- Dynamic Difficulty Adjustment v1 insight card.
- Progress / regress / maintain / stabilize / preserve-confidence difficulty states.
- Target hit-rate bands for progression and regression guidance.
- Credible-interval guardrails before target progression.
- Current-form and fatigue guardrails before adding difficulty or pressure.
- Volatility guardrail before progression.
- One-step-only difficulty recommendations: raise target, add pressure, or simplify setup, but not multiple changes at once.
- Recommendation reasons now include difficulty guidance.

### Stability precautions

- Dynamic difficulty calculations are fully guarded with `try/catch`.
- Score extraction uses safe normalization to avoid render-path crashes from malformed legacy logs.
- No v4.33 logic executes at module top level.
- If DDA cannot compute, the app displays an unavailable state instead of breaking bootstrap.
- Service worker cache name, module query strings, and build metadata are aligned to v4.33.0.

### Preserved from v4.32.2

- Target credible intervals.
- Low-N shrinkage.
- Progressive-completion bounds validation.
- Whole-number validation for count-based fields.
- Zero-denominator-safe analytics.
- Improved volatility fallback.

### Validation

- JavaScript syntax checks passed.
- Zip integrity check passed.
