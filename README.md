# Snooker Practice Log — v4.11.0.2.1

Built from the validated v4.0.0 ES-module release.

## v4.11.0.2.1 production-safety patch

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

Confirm version: the header should show v4.11.0.2.1.


## v4.11.0.2.1

- First small ES module split: IndexedDB/localStorage primitives moved into `modules/store.js`.
- `modules/app-core.js` keeps orchestration, rendering, and application state for now.
- No feature changes; this is a controlled modularization step before deeper v4 splits.


## v4.11.0.2.1

- Second small ES module split: shared utilities moved into `modules/utils.js`.
- Extracted UUID generation, safe cloning, HTML/attribute escaping, numeric formatting helpers, CSS escaping, class-token guarding, and immutable sort helper.
- No feature changes; this is a controlled modularization step.


## v4.11.0.2.1

- Third small ES module split: interface setting constants and theme helpers moved into `modules/settings.js`.
- `app-core.js` still owns session focus state and event binding so runtime behavior remains unchanged.
- No feature changes; this is another controlled modularization step.


## v4.11.0.2.1

- Fourth small ES module split: pure analytics helpers moved into `modules/analytics.js`.
- Extracted average, standard deviation, correlation text, rolling average, trend/benchmark text, and progress-velocity helpers.
- UI rendering, session flow, recommendations, and app state remain in `app-core.js`.


## v4.11.0.2.1

- Fifth small ES module split: session/timer primitives moved into `modules/session.js`.
- Extracted active-session draft read/write/clear helpers and timer-state formatting/math helpers.
- High-risk logging flow, rendering, and active session orchestration remain in `app-core.js` for stability.


## v4.11.0.2.1

- Sixth small ES module split: recommendation eligibility and weighting-cap helpers moved into `modules/recommendations.js`.
- Adaptive/session recommendation orchestration remains in `app-core.js` for stability.
- No feature changes; this release continues the controlled modularization path.


## v4.11.0.2

- Hotfix: hardened IndexedDB schema initialization after the v4.7 module split.
- Bumped IndexedDB schema version to force object-store validation/upgrade.
- Added clearer handling for blocked IndexedDB upgrades when another app tab is open.


## v4.11.0.2

- Hotfix: startup IndexedDB hydration now opens the database once and reads logs/sessions in a single transaction.
- Avoids parallel IndexedDB open/upgrade races observed on Android Chrome/PWA installs.
- Blocked upgrades now wait instead of immediately forcing localStorage fallback.


## v4.11.0.2

- Hotfix: restored missing `serializeCoreData()` and `saveCoreData()` functions lost during module splitting.
- IndexedDB hydration now recovers once from a broken/missing-store database by recreating the database and retrying.
- No feature changes; this is a startup/storage regression fix.


## v4.11.0

- Hotfix rollback of failed v4.8 Phase 2.
- Keeps validated v4.8 Phase 1 only: low-risk pure render helpers in `modules/render.js`.
- `renderToday`, `renderStats`, storage diagnostics, routine rendering, and dashboard rendering remain in `app-core.js` because they depend on app-scoped state and helper functions.
- No storage, IndexedDB, or session logic changes.


## v4.11.0

- Final controlled architecture split: pure adaptive/recommendation scoring helpers moved into `modules/recommendations.js`.
- Extracted adaptive action copy, adaptive priority scoring, and mixed-strategy routine scoring as pure parameterized functions.
- Stateful adaptive orchestration, rendering, and session flow remain in `app-core.js` to avoid the failed v4.8 Phase 2 dependency issue.
- Preserves the validated v4.8.2 rollback and v4.7.3 storage fixes.


## v4.11.0

- Mobile practice-flow release.
- Added a bottom-sheet exercise picker for free training and next-routine selection.
- Existing native dropdowns remain as fallback.
- Added search inside the picker with large tappable exercise rows.
- Polished focus-mode layout with sticky session header and larger quick-score controls.
- No storage, IndexedDB, render orchestration, or module-splitting changes.
