# Snooker Practice PWA v4.28.0

## v4.28.0 — Context-Aware Recommendation Engine

Build timestamp: 2026-05-18 10:13 CEST

## Release focus

v4.28.0 upgrades recommendations from static drill ranking to context-aware coaching. The engine now uses recent reflection signals, fatigue/confidence state, volatility, transfer value, exploration/exploitation logic, and recommendation outcome feedback to decide what to suggest and how to explain it.

## Added

- Contextual recommendation scoring: routines are now scored using weakness, transfer value, context fit, recovery suitability, confidence suitability, fatigue suitability, volatility risk, uncertainty, and prior recommendation outcomes.
- State-aware recommendation modes: the app infers Recovery, Acquisition, Consolidation, or Performance mode from recent reflection and performance signals.
- Exploration/exploitation weighting: uncertain routines receive controlled exploration upside, while high-evidence weaknesses remain eligible for exploitation.
- Volatility profiling: routines are classified as low, medium, or high volatility based on historical score variation and skill type.
- Confidence preservation logic: recovery-context recommendations favor familiar, lower-volatility routines and reduce excessive cognitive/fatigue/confidence load.
- Context-aware recommendation reasons: recommendation cards and logic panels now explain why a drill fits the current training state.
- Recommendation outcome signal: completed accepted recommendations now feed back into future scoring through score-after and improvement-after-recommendation.

## Updated

- Smart Session Builder v2 now uses the same context-aware state mode when auto-selecting recovery/progression-oriented sessions.
- Adaptive session block scoring now blends energy load, transfer value, contextual fit, and volatility profile.
- Recommendation logic panel renamed to Context-aware recommendation logic and now displays state mode, volatility, uncertainty, and leading reasons.
- App version and cache-busting references updated to v4.28.0.
- Build metadata updated in `modules/version.js` and the home screen.
- Service worker cache name updated for the new release.
- Build timestamps remain in Europe/Paris local time with CET/CEST notation.

## Notes

This release operationalizes the Bayesian Optimization roadmap in practical form. The app is still not doing full Bayesian latent-skill estimation; that remains postponed to the advanced probabilistic layer. v4.28 instead introduces the contextual decision layer required before transfer modelling and change-point detection become reliable.

Next planned releases:

- v4.29 — Transfer Model v1: skill transfer graph, cross-skill correlation, and transfer-aware recommendations.
- v4.30 — Change-Point Detection v1: breakthrough, slump, and plateau detection at skill-category level.
- v4.31+ — Advanced probabilistic layer: latent form estimates, credible intervals, hierarchical priors, and Bayesian practice optimization.
