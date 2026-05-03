# Snooker Practice Log — v3.19.2

Built from v3.19.1.

## Confirmed bug fixes

- Fixed startup/migration TDZ risk where `migrateData()` could reference `activeSession` before declaration.
- Removed duplicate persisted-session helper declarations and replaced them with one canonical implementation.
- Removed dead/unreachable progressive-completion branch in `renderScoreInputs()`.
- Fixed progressive-completion attempts so the entered attempts value is used.
- Persisted in-progress free sessions after saving a routine.
- Ensured completed session records store:
  - plannedRoutineIds
  - tableId
  - venueTable / venueTableSnapshot
  - tableNote
- Ensured completed sessions clear the persisted unfinished-session draft.
- Fixed edited logs so venue/table and table note are saved.
- Added invalid date guard when editing logs.
- Updated service worker cache and asset URLs to v3.19.2.
- Added safer localStorage writes with quota/error handling.
- Added fallback helpers for `crypto.randomUUID()` and `structuredClone()`.
- Replaced HTML and CSV escaping with robust canonical implementations.
- Added multi-tab storage sync.
- Removed stale `audit_app.js` from the package.

Confirm version:
The header should show v3.19.2.
