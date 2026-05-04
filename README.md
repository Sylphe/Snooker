# Snooker Practice Log — v3.28.0

Built from the working v3.27.0 base.

## Fixed in v3.28.0

- Implemented the CSS theme simplification pass.
- Simplified dark / high-contrast styling from stacked override patches into a variable-driven theme layer.
- Preserved the working dark-mode palette from the v3.25.9/v3.25.10 lineage.
- Reduced duplicated theme CSS and removed the old repeated dark/contrast override blocks.
- Kept the existing session focus mode, one-tap score entry, scoped rendering, safe-rendering helpers, timer persistence, soft-delete behavior, and the `typeof getScopedStatsLogs !== "undefined"` startup-crash fix.

## Deferred

- IndexedDB migration.
- Service-worker architecture change.
- ES6 module refactor.
- Full rendering rewrite.
- Array immutability refactor.
- Log-edit modal / bottom-sheet UX.

## Package

Root-level PWA files: `index.html`, `app.js`, `styles.css`, `manifest.json`, `service-worker.js`, `icon.svg`, `README.md`.

Confirm version: the header should show v3.28.0.
