# Snooker Practice Log — v3.33.0

Built from the v3.32 IndexedDB storage release.

## Added in v3.33.0

Storage diagnostics / hardening before the future v4.0 refactor:

- Storage diagnostics panel in the Data tab.
- Loaded app version and URL version display.
- Clear error log button so old fixed errors do not pollute new test runs.
- Synthetic storage test-log generator, configurable up to 20,000 logs.
- Test batch labels for easier debugging.
- Clear synthetic test logs only, preserving real training data.
- Storage integrity checker comparing:
  - in-memory logs/sessions,
  - IndexedDB logs/sessions,
  - full-backup payload counts,
  - compact localStorage core counts.
- Duplicate ID checks for logs and sessions.
- Debug exports now include URL version parameter and per-error app version/location metadata.
- Storage dashboard now shows loaded app version and page URL version parameter.

## Preserved

- IndexedDB storage for high-volume logs and sessions.
- LocalStorage core for low-volume app configuration, routines, plans, tables, and settings.
- Full JSON backup exports the combined in-memory dataset.
- Backup import replaces IndexedDB logs/sessions.
- Modal log editing / mobile bottom-sheet behavior.
- Simplified theme CSS and dark/high-contrast modes.
- Scoped rendering.
- Safe-rendering hardening.
- Timer persistence.
- Soft deletion / archived exercises.
- `getScopedStatsLogs` safe `typeof` startup-crash fix.

## Test recommendation

Before any major v4.0 refactor, use Data > Storage diagnostics:

1. Clear Error Log.
2. Generate 1,000 test logs.
3. Verify Storage Integrity.
4. Generate 10,000 test logs.
5. Verify Storage Integrity again.
6. Export Debug Info.
7. Clear Test Logs Only.
8. Verify Storage Integrity one last time.

## Package

Root-level PWA files: `index.html`, `app.js`, `styles.css`, `manifest.json`, `service-worker.js`, `icon.svg`, `README.md`.

Confirm version: the header should show v3.33.0.
