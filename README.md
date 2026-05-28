# Snooker Practice Log

Version: 5.7.76H.2-routine-console-grid-panel-stabilization

## v5.7.76H.2 — Routine Console Grid & Panel Stabilization

This patch stabilizes the desktop Routine Console after the rail/focus-inspector changes. KPI-driven views now keep the routine table contained, validation and explainability panels stay in normal document flow, and the grid uses safer sticky/frozen-column behavior.

Included:

- selected-routine focus inspector below the grid and above the full editor;
- compact validity, ETU, transfer, dependency, benchmark and recovery status;
- semantic chip summary for archetype, preset, ETU and validation state;
- quick section navigation buttons for Core, Transfer, Dependency and ETU / benchmark;
- desktop sticky behavior and mobile-safe stacking;
- v5.7.76G left navigation rail preserved;
- build identity, version module, cache keys and visible app panel updated to v5.7.76H.2.

Validation:

- node syntax checks passed;
- zip integrity test passed.
