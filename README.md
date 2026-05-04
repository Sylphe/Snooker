# Snooker Practice Log — v4.0.1

Built from the validated v4.0.0 ES-module release.

## v4.0.1 production-safety patch

- Fixed IndexedDB save race risk by writing critical log/session changes immediately instead of relying on a delayed timer.
- Added single-record IndexedDB helpers for log/session puts and log deletion.
- Kept full IndexedDB replacement only for migration, import, clear-data, and synthetic-test workflows.
- Added a hydration guard so `saveData()` cannot persist empty log/session arrays before IndexedDB hydration completes.
- Added `visibilitychange` / `beforeunload` flushing for pending non-critical IndexedDB syncs.
- Updated service-worker cache fallback to use `ignoreSearch: true` so offline loading works with or without version query strings.
- Removed global `window` exposure for state variables (`data`, `activeSession`, `planDraft`, `adaptivePlanDraft`) while keeping the legacy function bridge for generated inline handlers.
- Documented that ES-module local development requires a web server, not direct `file://` opening.

## Local development

Because v4 uses ES modules, do not open `index.html` directly via `file://`. Run a local server from the project folder instead:

```bash
python -m http.server
```

Then open `http://localhost:8000/`.

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

Confirm version: the header should show v4.0.1.
