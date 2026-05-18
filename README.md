# Snooker Practice PWA v4.29.1

## v4.29.1 — Evidence Calibration and Readability Patch

Build timestamp: 2026-05-18 10:58 CEST

## Release focus

v4.29.1 improves the interpretability of the v4.29 Transfer Model and the wider insights page. Advanced signals are now labelled and dampened by evidence strength so that low-sample outputs remain visible but no longer speak with the same authority as mature signals.

## Added

- Evidence-strength labels: Early signal, Weak evidence, Moderate evidence, and Strong evidence.
- Evidence-weighted dampening for residuals, transfer-need scoring, progress velocity, drift, plateau, and session quality impact.
- Reflection coverage display so partial reflection data no longer appears as a broken N/A state.
- Clearer transfer-model wording with primary transfer targets and bottleneck severity labels.
- Evidence badges in key analytics rows.
- Extra styling for compact evidence badges on the insights page.

## Updated

- Expected-vs-actual residuals now show evidence-adjusted residuals for low-N routines.
- Transfer Model v1 cards now explain that indirect transfer signals are evidence-weighted.
- Bottlenecks are shown as Low / Moderate / High / Severe rather than opaque raw numbers.
- Session-length analytics are worded as directional rather than definitive because short-session results can be selection-biased.
- Plateau and velocity wording now avoids overclaiming from small samples.
- App version, cache references, service worker cache name, and build metadata updated to v4.29.1.
- Build timestamps remain in Europe/Paris local time with CET/CEST notation.

## Notes

This is not the full Bayesian layer. It is an interim calibration layer that prevents low-sample signals from over-driving interpretation or recommendations before the later probabilistic system is introduced.

Next planned release:

- v4.30 — Change-Point Detection v1: breakthrough, slump, and plateau detection at skill-category level.
