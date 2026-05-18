# Snooker Practice PWA v4.32.0

## v4.32.0 — Target Credible Intervals / Bayesian Calibration v1

Build timestamp: 2026-05-18 11:37 CEST.

v4.32.0 adds the first uncertainty-aware target calibration layer on top of v4.31.0 Latent Current Form Estimate. The app now shows expected target ranges instead of relying only on point forecasts, and it shrinks low-sample signals toward a neutral prior so early hot or cold streaks do not overdrive target advice.

### Added

- Target Credible Intervals v1 insight card on the Insights page.
- Low-N shrinkage for target range estimation.
- Uncertainty badges: evidence strength plus interval width.
- Cautious target progression / regression guidance.
- Recommendation reasons now include target-range context.
- Target advice is calibrated separately from raw recent performance and current form.

### Analytical intent

This is not the full Bayesian optimization layer. It is a practical calibration bridge: the app now treats target advice as uncertain, dampens small-sample signals, and gives range-based guidance before future hierarchical Bayesian skill estimates are introduced.

### Validation

- App version, build metadata, cache references, and service worker cache name updated to v4.32.0.
- JavaScript syntax validation passed.
- Zip integrity validated.
