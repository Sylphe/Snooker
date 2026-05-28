# Snooker Practice PWA

Version: 5.7.76H.3-routine-console-selected-panel-containment-fix

## v5.7.76H.3 — Routine Console Selected Panel Containment Fix

This patch stabilizes the selected-routine area of the desktop Routine Console after row selection and KPI-driven filtering.

### Fixed

- removed the residual selected-editor left offset inherited from older desktop console layouts;
- constrained the selected routine editor to the main console width;
- constrained the Focus Inspector, contextual validation dock, derived metadata explainability card, transfer graph and dependency panels;
- prevented chip rails, validation buttons, long routine names and graph add-row controls from spilling off-screen;
- added safer wrapping and min-width rules across selected-routine panels;
- preserved v5.7.76H.2 grid/panel stabilization and all v5.7.76H focus inspector features.

### Validation

- ES module syntax check passed.
- Zip integrity test passed.
