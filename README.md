# Snooker Practice PWA

Version: 5.7.67.17-cross-domain-transfer-graph-v1
Build: 2026-05-26 15:05 CEST

Changes:
- Added Cross-Domain Transfer Graph v1 on top of the existing Smart Builder audit and contradiction stack.
- Computes per-pick confidence, evidence depth, statistical stability and fit-score uncertainty bands.
- Adds a plan-level confidence summary showing average confidence, evidence depth, stability and low-confidence picks.
- Injects confidence into each recommendation audit object while preserving ranking, template constraints, ETU semantics and contradiction detection.

## v5.7.67.17
- Added `smartBuilderRecommendationConfidenceSafe()` for routine-level confidence scoring.
- Added `smartBuilderAttachRecommendationConfidenceSafe()` to enrich generated plans after contradiction analysis.
- Added `renderSmartBuilderRecommendationConfidenceSafe()` and `renderSmartBuilderPlanConfidenceSafe()` to expose confidence in Smart Builder output.
- Confidence uses sample size, evidence strength, recent volatility, Bayesian profile availability, recommendation feedback and hard-template flags.

## v5.7.67.14 retained
- First-class session template schemas with allowed/forbidden domains, benchmark-density caps, volatility caps, ETU caps, recovery floors, pressure caps and switching caps.
- Template compliance panel and template-aware ranking modifiers.

## v5.7.67.13 retained
- ETU split into technical, cognitive, confidence/emotional and pressure subtypes.
- Planned-session and historical subtype allocation.

## v5.7.67.12 retained
- Three-level recommendation explanation architecture: one-line reason, constraint summary and advanced audit.
- Rationale fragments are normalized and deduplicated locally and across the generated session.

## v5.7.67.11 retained
- Benchmark exposure metadata layer: none, support, calibration, test, pressure-test.
- Smart Builder recovery/sanity logic distinguishes benchmark support from benchmark testing.
