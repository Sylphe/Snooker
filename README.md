# Snooker Practice PWA v4.31.0

## v4.31.0 — Latent Current Form Estimate

Build timestamp: 2026-05-18 11:39 CEST

v4.31.0 adds the first current-form layer on top of v4.30.0 Change-Point Detection. The app now separates recent form from long-term baseline and uses fatigue, confidence, focus, volatility, and recent score movement to estimate readiness.

### Included

- Latent Current Form Estimate insight card on the Insights page.
- Current form versus long-term baseline separation.
- Fatigue-adjusted form estimate using structured reflection ratings when available.
- Confidence momentum tracking from recent reflections.
- Skill-specific current-form rows using canonical skill tags.
- Recommendation scoring now incorporates current form context.
- Context-aware recommendation reasons now mention current form state.
- App version, build metadata, cache references, and service worker cache name updated to v4.31.0.
- Build timestamp remains in Europe/Paris local time with CET/CEST notation.

### Notes

This release does not replace the long-term skill model. It estimates short-term readiness so the app can distinguish temporary form changes from durable skill changes. The output is evidence-weighted and should guide practice architecture rather than act as a hard override.
