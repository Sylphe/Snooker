# Snooker Practice PWA v4.29.0

## v4.29.0 — Transfer Model v1

Build timestamp: 2026-05-18 10:27 CEST

## Release focus

v4.29.0 adds the first explicit skill-transfer layer. The app now reasons beyond direct routine tags: a routine can directly train one skill while indirectly supporting downstream skills such as break-building, recovery, safety, pressure resilience, or confidence stability.

## Added

- Skill transfer graph v1: canonical skill tags now have weighted upstream/downstream relationships.
- Direct and indirect skill impact logic: routines are evaluated using primary, secondary, and transfer tags, then mapped into downstream skill effects.
- Transfer-need scoring: recommendations receive additional weight when their downstream skills are currently weak or deteriorating.
- Transfer-aware recommendation reasons: recommendation cards can explain that a routine was selected because it is an upstream driver of another skill.
- Transfer Model v1 insight card: the stats insight panel now highlights high-transfer routines and current bottleneck skills.
- Foundational skill weighting: cueing, cue-ball speed, cue-ball control, pace control, positional play, safety, pressure resilience, focus consistency, and confidence stability now receive higher broad-transfer treatment.

## Updated

- Context-aware recommendation scoring now includes transfer graph need, not only direct transfer value.
- Smart Session Builder v2 benefits from transfer-aware routine ranking when choosing primary and transfer blocks.
- Recommendation logic displays richer reasons, including upstream transfer rationale.
- App version and cache-busting references updated to v4.29.0.
- Build metadata updated in `modules/version.js` and the home screen.
- Service worker cache name updated for the new release.
- Build timestamps remain in Europe/Paris local time with CET/CEST notation.

## Notes

This is intentionally a pragmatic transfer model, not full Bayesian latent-skill estimation. Correlations and transfer effects are treated as weak decision signals until the user has enough logs. The objective is better practice architecture: if break-building is weak, the app can now recommend upstream cue-ball speed, positional play, or transition drills when those have stronger expected transfer.

Next planned releases:

- v4.30 — Change-Point Detection v1: breakthrough, slump, and plateau detection at skill-category level.
- v4.31+ — Advanced probabilistic layer: latent form estimates, credible intervals, hierarchical priors, and Bayesian practice optimization.
