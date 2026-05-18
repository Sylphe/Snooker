# Snooker Practice PWA v4.33.1

## v4.33.1 — Dynamic Difficulty Adjustment

v4.33.1 adds a practical difficulty-control layer on top of v4.32.0 Target Credible Intervals. The app now distinguishes whether an exercise should be progressed, held stable, simplified, pressure-tested, or used as a confidence-preserving finish.

### Implemented

- Dynamic Difficulty Adjustment v1 insight card.
- Target hit-rate band interpretation.
- Cautious progression and regression rules using credible target ranges.
- Confidence-preserving overrides when current form or fatigue suggests escalation would be counterproductive.
- Volatility guardrail to stabilize before progressing when recent results are unstable.
- Recommendation reasons now include difficulty guidance.
- Smart recommendation scoring now receives a small difficulty-signal adjustment.
- Coaching insights now surface difficulty-change advice when relevant.

### Practical interpretation

The app now avoids treating every good score as a reason to make a drill harder. Difficulty changes are one-step only: raise the target, add a controlled pressure constraint, or simplify the setup, but not multiple changes simultaneously. This keeps training progressive without damaging confidence or overreacting to low-sample noise.

### Build

- App version: v4.33.1
- Build timestamp: 2026-05-18 11:55 CEST
- Cache and service worker references updated to v4.33.1.
