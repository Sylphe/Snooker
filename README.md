# Snooker Practice PWA v5.6.7

## v5.6.7 — Context-Aware Calibration Engine

Built from the working v5.6.5 Adaptive Target Engine branch.

This release upgrades the Adaptive Target Engine from a generic statistical target reducer into a snooker-aware calibration layer.

### Main changes

- Adds drill-category productive bands:
  - long potting: 30–60%
  - safety/tactical: 50–75%
  - break-building: 40–70%
  - pressure: 25–55%
  - cue-ball/positional control: 45–70%
  - rest/recovery: 35–65%
- Adds training-mode recognition:
  - normal
  - stretch
  - overload
  - maintenance / recovery
- Caps target reductions so the engine no longer collapses targets such as 50 → 10.
- Treats success-rate targets as percentages, not as raw attempt-count ceilings.
- Adds category-relative calibration context: if a whole category is underperforming, the engine reduces more cautiously.
- Adds safer stretch-target calculation by scoring type.
- Improves AI coaching export instructions with snooker-specific productive bands and calibration rules.
- Preserves the existing Accept / Snooze / Reject workflow and new target-profile versioning.

### Design intent

The engine now distinguishes between:

- a routine that is genuinely too hard;
- a deliberate stretch/overload routine;
- a category-wide target mismatch;
- insufficient sample size;
- volatile evidence.

This should produce more realistic snooker recommendations, especially for long-potting and difficult positional routines.
