# Snooker Practice PWA — v5.7.67.2 Weighted sport-domain diversity guard

## v5.7.67.2 changes

- Added Priority 2 weighted sport-domain diversity guard for Smart Builder.
- Break-building remains structurally privileged because it is the main scoring engine in snooker.
- Added baseline sport-domain target bands: break-building 35–50%, cue-ball/positional control 15–25%, long potting 10–20%, safety/tactical 10–20% combined, rest/specialist 5–10%.
- Added saturation and substitution logic: if break-building is heavily loaded but still a bottleneck, the builder shifts toward supporting lower-load domains such as cue-ball control, long potting, safety/tactical or pressure-stability work rather than removing break-building entirely.
- Added visible note of the current sport-domain weights inside Smart Builder. This will later feed the Builder Debug Console in Priority 10.
- Preserved the ETU bypass switch for Bayesian-only audit mode.
- Updated build/cache/module query strings to v5.7.67.2.


## v5.7.67.2 changes

- Added Smart Builder Template Constraint Engine.
- Recovery templates now strongly suppress benchmark tests, high-volatility drills, low-hit-rate acquisition drills, and high confidence-risk drills.
- Added domain/family diversity guard for template picking to reduce recommendation collapse.
- Added Smart Builder ETU / load layer switch: use ETU layer or bypass ETU layer for Bayesian-only audit mode.
- Recommendation audit now records template-constraint modifiers separately from ETU, readiness, Bayesian, benchmark, prediction, and last-session layers.
- Updated build/cache/module query strings to v5.7.67.2.

No storage-schema or log-format changes.
