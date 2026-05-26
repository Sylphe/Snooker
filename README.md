# Snooker Practice PWA

Version: 5.7.67.13-etu-semantic-refinement
Build: 2026-05-26 14:45 CEST

Changes:
- Added ETU Semantic Refinement for the Smart Builder and prediction load layer.
- Split generic ETU into four load subtypes: technical ETU, cognitive ETU, confidence/emotional ETU, and pressure ETU.
- Added subtype allocation for planned Smart Builder drills and historical session ETU rows.
- Surfaced subtype mix in the Smart Builder ETU budget rationale and ETU-aware builder context.
- Added subtype-aware readiness guards to avoid stacking pressure-heavy or decision-heavy work after recent load.
- Preserved existing recommendation scoring, explanation compression, benchmark semantics, sanity guardrails, and advanced audits.

## v5.7.67.13
- Implemented subtype helper functions and aggregate subtype profiles.
- Added planned-session ETU subtype allocation by drill/block.
- Added historical ETU subtype allocation from pressure, transfer, adaptive, quality, and fatigue signals.
- Added subtype display in session review ETU snapshot.

## v5.7.67.12 retained
- Three-level recommendation explanation architecture: one-line reason, constraint summary, and advanced audit.
- Rationale fragments are normalized and deduplicated locally and across the generated session.

## v5.7.67.11 retained
- Benchmark exposure metadata layer: none, support, calibration, test, pressure-test.
- Smart Builder recovery/sanity logic distinguishes benchmark support from benchmark testing.
- Debug/audit layers remain available.
