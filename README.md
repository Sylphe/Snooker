# Snooker Practice Log — v3.32.0

Built from the working v3.31.0 storage-safety base.

## Added in v3.32.0

- Migrated high-volume `logs` and `sessions` collections to IndexedDB.
- Kept low-volume app configuration in localStorage: routines, plans, tables, interface settings, migration metadata, and backups status.
- Added automatic one-time migration from legacy localStorage logs/sessions into IndexedDB.
- LocalStorage now stores a compact core data object with empty `logs` and `sessions` arrays plus IndexedDB metadata.
- Full JSON backup still exports the in-memory combined dataset, including IndexedDB logs and sessions.
- Importing a full backup replaces the IndexedDB logs/sessions stores.
- Clear-data also clears IndexedDB log/session stores.

## Preserved

- Storage Safety Dashboard from v3.31.
- Adaptive recommendation eligibility and analytics guardrails from v3.30.
- Modal / bottom-sheet log editing from v3.29.
- Simplified theme CSS from v3.28.
- Safe rendering helpers from v3.27.
- Scoped rendering from v3.26.
- Timer persistence, soft deletion, and the `getScopedStatsLogs` startup-crash fix.

## Package

Root-level PWA files: `index.html`, `app.js`, `styles.css`, `manifest.json`, `service-worker.js`, `icon.svg`, `README.md`.

Confirm version: the header should show v3.32.0.
