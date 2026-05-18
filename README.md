# Snooker Practice PWA v4.30.0

## v4.30.0 — Change-Point Detection v1

Build timestamp: 2026-05-18 11:18 CEST

## Release focus

v4.30.0 adds the first change-point detection layer. The app now tries to distinguish meaningful performance shifts from ordinary volatility: possible breakthrough, possible slump, possible plateau, volatile/noisy state, or insufficient evidence.

## Added

- Change-Point Detection v1 insight card on the Insights page.
- Overall breakthrough / slump / plateau / volatility classification.
- Skill-level change-point checks using the canonical skill tags added in v4.26.
- Evidence-adjusted effect scoring so low-sample shifts are dampened before being shown as strong signals.
- Skill-level shift wording that explains the recent window versus the prior baseline.
- Guardrails against overreacting to noisy, high-volatility windows.

## Updated

- App version, build metadata, cache references, and service worker cache name updated to v4.30.0.
- Build timestamp remains in Europe/Paris local time with CET/CEST notation.
- The Insights page now includes change-point detection alongside reflection intelligence, skill mapping, and the transfer model.

## Notes

This is still a pragmatic v1, not the full Bayesian latent-state model. It uses window comparisons, evidence dampening, and volatility checks to provide useful coaching signals without overclaiming.

Next planned release:

- v4.31 — Latent Current Form Estimate: separate current form from long-term skill and use fatigue/confidence/context to adjust readiness.
