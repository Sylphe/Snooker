# Snooker Practice Log — v4.21.12

## v4.21.12 — Internal Stats navigation + KPI dark-mode fix

Built from v4.21.11.

Changes:

- Added build timestamp next to the visible app version in the header.
- Added `APP_BUILD_TIMESTAMP` in `modules/version.js` and diagnostic version display.
- Implemented internal Stats navigation tabs: Overview, Trends, Routines, Pressure, Insights.
- Preserved existing Stats information by moving advanced analytics into section-specific expandable modules.
- Fixed KPI dashboard dark-mode styling by replacing hard-coded white backgrounds with theme variables.
- Updated version/cache markers to `v4.21.12`.

Validation:

- JavaScript syntax checks passed across app bootstrap and modules.
