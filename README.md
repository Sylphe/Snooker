# Snooker Practice Log — v4.0.0

Built from the validated v3.33 storage-stable release.

## v4.0 architectural refactor

- Converted the app loading path to ES modules.
- Added a module bootstrap (`app.js`) and version module (`modules/version.js`).
- Moved the main application runtime to `modules/app-core.js`.
- Added an explicit compatibility bridge so existing generated inline handlers continue to work safely during the transition.
- Updated the service worker to cache the module files.
- Preserved v3.33 IndexedDB storage diagnostics, storage integrity checks, synthetic test-log tools, and all prior fixes.

## Package

Root-level PWA files plus `/modules`:

- `index.html`
- `app.js`
- `styles.css`
- `manifest.json`
- `service-worker.js`
- `icon.svg`
- `README.md`
- `modules/app-core.js`
- `modules/version.js`

Confirm version: the header should show v4.0.0.
