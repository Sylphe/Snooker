# Snooker Practice Log

Version: 5.7.75H-semantic-readiness-dashboard

## v5.7.75H — Semantic Readiness Dashboard

This release adds a Semantic Readiness Dashboard to the Routine Management Console and hardens the semantic chip colors for dark mode.

### Included

- semantic readiness dashboard above the grid;
- readiness bars for ETU, transfer, dependency, benchmark, validation, confidence/provenance and overall score;
- actionable weak-area chips based on the current visible routine database;
- dark-mode chip palette with stronger contrast and readable text;
- build identity, version module, cache keys and visible app panel updated to v5.7.75H.

### Validation

- `node --check` passed for `modules/app-core.js` and `app.js`;
- zip integrity test passed.
