# Snooker Practice Log — v3.31.0

Built from the working v3.30.0 base.

## Added in v3.31.0

- Storage safety dashboard in the Data tab.
- Shows main app data size, estimated total localStorage usage, and approximate percentage of a 5 MB localStorage ceiling.
- Shows counts for logs, sessions, exercises, plans, tables, archived exercises, and recent errors.
- Shows last full-backup status.
- Adds a dedicated “Download Full Backup” action intended as the pre-migration safeguard before future IndexedDB work.

## Preserved from prior versions

- Modal / bottom-sheet log editing.
- Simplified dark / high-contrast theme layer.
- Scoped rendering after logging and log edits.
- Safe-rendering helpers for dynamic HTML.
- Timer persistence across refresh/resume.
- Soft deletion / archiving of exercises.
- Recommendation eligibility and weighting caps.
- Analytics guardrails for low-variation / insufficient-data cases.
- The `typeof getScopedStatsLogs !== "undefined"` startup-crash fix.

## Still deferred

- IndexedDB migration.
- ES6 module refactor.
- Full rendering rewrite.
- Array immutability refactor.

## Package

Root-level PWA files: `index.html`, `app.js`, `styles.css`, `manifest.json`, `service-worker.js`, `icon.svg`, `README.md`.

Confirm version: the header should show v3.31.0.
