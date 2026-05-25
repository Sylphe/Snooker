# Snooker Practice PWA — v5.7.67.1 Template constraint engine and ETU bypass

## v5.7.67.1 changes

- Added Smart Builder Template Constraint Engine.
- Recovery templates now strongly suppress benchmark tests, high-volatility drills, low-hit-rate acquisition drills, and high confidence-risk drills.
- Added domain/family diversity guard for template picking to reduce recommendation collapse.
- Added Smart Builder ETU / load layer switch: use ETU layer or bypass ETU layer for Bayesian-only audit mode.
- Recommendation audit now records template-constraint modifiers separately from ETU, readiness, Bayesian, benchmark, prediction, and last-session layers.
- Updated build/cache/module query strings to v5.7.67.1.

No storage-schema or log-format changes.
