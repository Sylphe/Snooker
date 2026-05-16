# Snooker Practice PWA v4.22.4 — Bootstrap recovery fix

This release fixes a top-level module import regression that could stop the app bootstrap, leaving navigation, saved routines, and saved exercises unavailable.

## Fixes
- Added the missing `APP_BUILD_TIMESTAMP` export expected by `app-core.js`.
- Added the missing `openSnookerDB` import used by storage diagnostics.
- Restored a local `renderLogRow()` helper so history rendering cannot fail on an unexported helper.
- Preserved prior Stats render recovery changes.
- Normalized version/cache markers to v4.22.4.
