# Snooker Practice Log — v3.25.9

Built from the v3.25.6 working set.

## Fixed

- Replaced the stacked interface-settings patches with one deterministic settings layer.
- Removed competing inline handlers from `index.html` for theme, focus mode, and quick-log settings.
- Interface settings now persist to direct `localStorage` keys and to the main app data object.
- Theme application now consistently sets `data-theme-mode` and resolved `data-theme` on both `html` and `body`.
- System theme mode now resolves consistently to light/dark in both early page load and runtime updates.
- Exit Focus Mode now changes only the current active session focus state, not the default preference.
- Added a final consolidated theme CSS section for dark/high-contrast coverage across phase cards, analytics cards, SVG charts, modals, tables, badges, and nested panels.

## Package

Root-level PWA files: `index.html`, `app.js`, `styles.css`, `manifest.json`, `service-worker.js`, `icon.svg`, `README.md`.

Confirm version: the header should show v3.25.9.
