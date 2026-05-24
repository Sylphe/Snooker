# Snooker Practice PWA v5.7.42

## v5.7.42 — Stats render performance pass

This release applies Phase 6 of the Stats information-architecture work. It keeps the v5.7.41 Research Lab structure intact, but reduces unnecessary Stats rendering work.

### Changes

- Heavy standalone Stats panels now render only for the active Stats mode that needs them.
- Insights-only panels render only in Insights.
- Research-only panels render only in Research Lab.
- Coaching decision engines render only in the Coaching Stats subtab.
- Table stats render only where visible/useful: Overview and Routines.
- Tournament/research input changes no longer trigger hidden Bayesian panel refreshes outside Research Lab.
- No schema, log, routine, IndexedDB, or backup format changes.

Build labels, module cache-busting references, service-worker cache version, and README metadata updated to v5.7.42.
