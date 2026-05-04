# Snooker Practice Log — v3.25.6

Built from the v3.25 working set.

## Fixed

- Interface settings now save directly to localStorage and to the main app data object.
- Theme selection is applied immediately to both `html` and `body`.
- Light / dark / high contrast switching is controlled by a single final settings layer.
- Exit Focus Mode now toggles the current active session display directly, instead of only changing the default setting.
- Dark/high-contrast coverage reinforced for nested boxes, analytics panels, SVG charts and post-session reflection.
- Service worker uses network-first loading for app files to reduce stale cached CSS/JS issues.

## Package

Root-level PWA files: `index.html`, `app.js`, `styles.css`, `manifest.json`, `service-worker.js`, `icon.svg`, `README.md`.

Confirm version: the header should show v3.25.6.
