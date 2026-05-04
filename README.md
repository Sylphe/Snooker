# Snooker Practice Log — v3.26.0

Built from the v3.25.11 working set.

## Fixed in v3.26.0

- Added scoped rendering for session log saves and log edits so the app no longer calls full `renderAll()` after every logged score.
- Logging a score now refreshes only the relevant visible views, storage warning, recommendation/status widgets, and focus UI instead of rebuilding the entire application DOM.
- Kept the existing v3.25.11 fixes for settings, dark mode, duplicate log edit forms, timer persistence, and soft-deleted routines.

## Prior retained fixes

- Replaced the stacked interface-settings patches with one deterministic settings layer.
- Removed competing inline handlers from `index.html` for theme, focus mode, and quick-log settings.
- Interface settings now persist to direct `localStorage` keys and to the main app data object.
- Theme application now consistently sets `data-theme-mode` and resolved `data-theme` on both `html` and `body`.
- System theme mode now resolves consistently to light/dark in both early page load and runtime updates.
- Exit Focus Mode now changes only the current active session focus state, not the default preference.
- Added a final consolidated theme CSS section for dark/high-contrast coverage across phase cards, analytics cards, SVG charts, modals, tables, badges, and nested panels.

- Added context-safe log edit forms to avoid duplicate DOM IDs across Today, Stats, and history views.
- Persisted active-session timer state so refresh/resume can restore elapsed time and running/paused state.
- Converted exercise deletion to soft deletion: archived routines are hidden from active selection but preserved for historical logs and analytics.
- Kept IndexedDB migration deferred and left the existing network-first service worker strategy intact.

## Package

Root-level PWA files: `index.html`, `app.js`, `styles.css`, `manifest.json`, `service-worker.js`, `icon.svg`, `README.md`.

Confirm version: the header should show v3.26.0.
