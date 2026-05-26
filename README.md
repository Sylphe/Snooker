# Snooker Practice PWA

Version: 5.7.74C-routine-console-validation-dashboard

## v5.7.74C

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


### v5.7.74C
- Added Routine Console validation dashboard.
- Added dedicated ETU subtype bulk editor.
- Added benchmark semantics bulk editor.
- Added transfer graph metadata bulk editor.
- Preserved Routine Pack Manager and bootstrap/hydration fixes.
