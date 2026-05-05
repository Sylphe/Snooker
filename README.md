# Snooker Practice Log — v4.7.3.1

Built from the validated v4.0.0 ES-module release.

## v4.7.3.1 production-safety patch

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

Confirm version: the header should show v4.7.3.1.


## v4.7.3.1

- First small ES module split: IndexedDB/localStorage primitives moved into `modules/store.js`.
- `modules/app-core.js` keeps orchestration, rendering, and application state for now.
- No feature changes; this is a controlled modularization step before deeper v4 splits.


## v4.7.3.1

- Second small ES module split: shared utilities moved into `modules/utils.js`.
- Extracted UUID generation, safe cloning, HTML/attribute escaping, numeric formatting helpers, CSS escaping, class-token guarding, and immutable sort helper.
- No feature changes; this is a controlled modularization step.


## v4.7.3.1

- Third small ES module split: interface setting constants and theme helpers moved into `modules/settings.js`.
- `app-core.js` still owns session focus state and event binding so runtime behavior remains unchanged.
- No feature changes; this is another controlled modularization step.


## v4.7.3.1

- Fourth small ES module split: pure analytics helpers moved into `modules/analytics.js`.
- Extracted average, standard deviation, correlation text, rolling average, trend/benchmark text, and progress-velocity helpers.
- UI rendering, session flow, recommendations, and app state remain in `app-core.js`.


## v4.7.3.1

- Fifth small ES module split: session/timer primitives moved into `modules/session.js`.
- Extracted active-session draft read/write/clear helpers and timer-state formatting/math helpers.
- High-risk logging flow, rendering, and active session orchestration remain in `app-core.js` for stability.


## v4.7.3.1

- Sixth small ES module split: recommendation eligibility and weighting-cap helpers moved into `modules/recommendations.js`.
- Adaptive/session recommendation orchestration remains in `app-core.js` for stability.
- No feature changes; this release continues the controlled modularization path.


## v4.7.3

- Hotfix: hardened IndexedDB schema initialization after the v4.7 module split.
- Bumped IndexedDB schema version to force object-store validation/upgrade.
- Added clearer handling for blocked IndexedDB upgrades when another app tab is open.


## v4.7.3

- Hotfix: startup IndexedDB hydration now opens the database once and reads logs/sessions in a single transaction.
- Avoids parallel IndexedDB open/upgrade races observed on Android Chrome/PWA installs.
- Blocked upgrades now wait instead of immediately forcing localStorage fallback.


## v4.7.3

- Hotfix: restored missing `serializeCoreData()` and `saveCoreData()` functions lost during module splitting.
- IndexedDB hydration now recovers once from a broken/missing-store database by recreating the database and retrying.
- No feature changes; this is a startup/storage regression fix.
