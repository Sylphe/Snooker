# Snooker Practice PWA v4.27.1

## v4.27.1 — Recommendation feedback toggle + undo

This patch makes recommendation feedback reversible. Accept and Skip now behave as toggles: selecting the active state clears it, selecting the opposite state replaces the prior open feedback state, and each change shows an undo toast. Completion tracking now only completes currently active accepted recommendations, so an accepted recommendation that was later skipped or cleared is no longer incorrectly marked as completed by a future log.


Build timestamp: 2026-05-18 10:06 CEST

## Release focus

v4.27.1 upgrades the Smart Session Builder from a drill picker into a practice architect. The builder now structures a session around energy budgets, block sequencing, transfer value, recovery-mode constraints, and recommendation feedback tracking.

## Added

- Smart Session Builder v2: sessions are now built as structured blocks rather than a flat ranked drill list.
- Session energy architecture: cognitive load, fatigue load, confidence-risk load, and context-switching are estimated for the generated plan.
- Budget display: the generated session shows cognitive, fatigue, confidence-risk, and switching usage versus the current session budget.
- Block-based session design: warm-up/calibration, primary skill block, transfer block, pressure or robustness block, and confidence finish.
- Recovery-mode redesign: fewer drills, lower switching, more familiar drills, lower volatility, and a confidence-preserving finish.
- Transfer-value weighting: foundational drills and routines with stronger skill-transfer characteristics receive additional weighting.
- Recommendation feedback tracking: recommendations can be marked accepted or skipped.
- Completion feedback tracking: when an accepted recommendation is later logged, the app records score-after and improvement-after-recommendation.
- Recommendation feedback counters: the Smart Session Builder shows accepted, skipped, and completed recommendation counts.

## Updated

- Adaptive scoring now blends existing heuristic/Bayesian signals with transfer value and energy load.
- Session blocks are now explicitly labelled by purpose, making the generated plan easier to follow during practice.
- Recommendation rows include transfer value and load indicators.
- App version and cache-busting references updated to v4.27.1.
- Build metadata updated in `modules/version.js` and the home screen.
- Service worker cache name updated for the new release.
- Build timestamps remain in Europe/Paris local time with CET/CEST notation.

## Notes

This release makes the Bayesian Optimization roadmap practical: the app now records recommendation decisions and outcomes, which creates the feedback loop required for future sequential decision-making under uncertainty. v4.28 can build on this by making recommendation scoring more context-aware, while v4.29 can use the skill map and feedback outcomes to estimate transfer between drills.
