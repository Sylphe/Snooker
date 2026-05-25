# Snooker Practice PWA — v5.7.67 Smart Builder session templates and layer audit

## v5.7.67 changes

- Added explicit Smart Builder session templates: Recovery, Consolidation, Acquisition, Benchmark-prep, Pressure, and Transfer.
- Added Recommendation Layer Audit details for Smart Builder picks so Bayesian skill value, ETU load, readiness, benchmark alignment, prediction bottleneck fit, and last-session follow-up remain auditable separately.
- ETU remains a load/dose modifier rather than replacing the Bayesian recommendation layer.
- Smart Builder output now shows the active session template and its governing layer.
- Existing ETU, benchmark roadmap, prediction, session review, and storage behavior are preserved.
- Updated build/cache/module query strings to v5.7.67.

## Safety notes

- No schema migration required.
- No historical log changes.
- Recommendation audit data is rendered from current calculations and does not overwrite existing logs.
