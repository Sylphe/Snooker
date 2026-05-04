# Snooker Practice Log — v3.25.5

Built from the v3.24 working set.

## Added

- Dark mode and high-contrast mode with system preference support.
- Interface settings in the Data tab for theme, focus mode, and quick-log macros.
- Full-screen session mode for active drill logging.
- Faster one-tap score entry for success-rate drills using score chips from 0 to attempts.
- Quick-log macros: log 0, half, or max and auto-advance.
- Live target check card during active sessions showing current score, target, stretch target, and last three scores.

## Package

Root-level PWA files: `index.html`, `app.js`, `styles.css`, `manifest.json`, `service-worker.js`, `icon.svg`, `README.md`.

Confirm version: the header should show v3.25.5.


## Fixes in v3.25.5

- Rebuilt interface settings persistence with direct localStorage + main data storage writes.
- Theme is now applied to both `html` and `body`, preventing selector mismatch.
- Added aggressive dark/high-contrast coverage for nested panels, badges, pills, modals, SVG chart elements and post-session reflection.
- Updated the service worker to use network-first fetching for app shell files, reducing stale cached CSS/JS issues after deployment.
