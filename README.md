# Snooker Practice Log — v4.14.0

Built from the stable v4 architecture line.

## Current release: v4.14.0

Smart Recommendation now uses the Bayesian confidence signal introduced in v4.12 and integrated into ranking in v4.13.

### v4.14.0 changes

- Added Bayesian signal visibility inside the main Smart Recommendation card.
- Shows the Bayesian action, reason, posterior ability estimate, credible interval, and confidence label for success-rate drills.
- Smart Recommendation scoring now includes Bayesian confidence deltas for success-rate routines.
- Preserved the v4.7.3 storage fix and v4.8.2 rendering rollback safety.
- No storage, IndexedDB, session lifecycle, or render-orchestration changes.

## Key stability checkpoints preserved

- `saveCoreData()` and `serializeCoreData()` are present.
- IndexedDB logs/sessions storage remains active.
- IndexedDB recovery helper is present.
- `renderToday()` and `renderStats()` remain in `app-core.js`.
- `render.js` remains limited to the validated low-risk Phase 1 extraction.
- Service worker cache marker is `snooker-practice-log-v4-14-0-final`.

## Module structure

- `app.js` — ES module bootstrap.
- `modules/app-core.js` — app orchestration, state, session flow, major rendering.
- `modules/store.js` — IndexedDB/localStorage primitives.
- `modules/utils.js` — generic helpers.
- `modules/settings.js` — theme/interface settings helpers.
- `modules/analytics.js` — statistical helpers.
- `modules/bayesian.js` — Bayesian success-rate analytics.
- `modules/session.js` — session/timer primitives.
- `modules/recommendations.js` — recommendation helpers.
- `modules/render.js` — validated low-risk render helpers.
- `modules/version.js` — version constants.

## Local development

Because v4 uses ES modules, do not open `index.html` directly via `file://`. Run a local server from the project folder instead:

```bash
python -m http.server
```

Then open:

```text
http://localhost:8000/
```

## Upgrade / testing checklist

After deploying v4.14.0:

1. Open the app and verify no IndexedDB fallback warning appears.
2. Check Data → storage integrity.
3. Confirm the loaded app version shows `4.14.0-final`.
4. Open Smart Recommendation and verify Bayesian signal text appears for success-rate routines with data.
5. Log a success-rate drill and confirm Bayesian validation still updates.
6. Confirm Today and Stats tabs still render normally.
7. Export a full backup.
