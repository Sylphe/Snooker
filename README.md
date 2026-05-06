# Snooker Practice Log — v4.14.2 Recovery Hotfix

Built from the last known-good v4.13 line.

## Why this release exists

v4.14.0 introduced a malformed `app-core.js` runtime path that could prevent startup, tab switching, and data hydration. v4.14.2 avoids inheriting that path by rebuilding from stable v4.13 and applying only low-risk hardening fixes.

## v4.14.2 changes

- Rebuilt from v4.13 stable base.
- Added exponential time decay to Bayesian success-rate aggregation.
- Removed version query strings from `manifest.json` `start_url` and shortcut URLs.
- Added iOS safe-area protection to focus-mode sticky log actions.
- Hardened delegated `data-action` event handling for text-node targets.
- Expanded service-worker network-first behavior to all JavaScript module files.
- Preserved v4.7.3 storage fix and v4.8.2 render rollback safety.

## Stability checkpoints

- `saveCoreData()` and `serializeCoreData()` are present.
- `renderToday()` and `renderStats()` remain in `app-core.js`.
- `render.js` remains limited to the validated low-risk Phase 1 extraction.
- IndexedDB recovery helper is present.
- Service worker cache marker is `snooker-practice-log-v4-14-2-final`.

## Testing checklist

1. Hard refresh or close/reopen the installed PWA.
2. Verify tabs switch normally.
3. Verify routines appear in dropdowns/pickers.
4. Verify Data → storage dashboard loads.
5. Verify no IndexedDB fallback warning appears.
6. Export a full backup.
