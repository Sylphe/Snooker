# Snooker Practice PWA

Version: 5.7.74A-routine-management-console

## v5.7.74A

Routine Management Console foundation.

Implemented:
- Desktop-first Routine Management Console inside Library.
- Full routine table covering parameters, skill tags, transfer tags, benchmark semantics, ETU subtypes, load fit and audit scores.
- Side-panel metadata editor for selected routines.
- Local save back to the app routine database.
- Visible-routine JSON export for pack governance.
- Existing Routine Validation Engine and ETU source labels preserved.

Validation:
- node --check modules/app-core.js
- node --check app.js
- zip integrity test
