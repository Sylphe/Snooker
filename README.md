# Snooker Practice Log — v3.27.0

Built from the working v3.26.0 base.

## Fixed in v3.27.0

- Implemented point 2 from the audit: a lightweight safe-rendering hardening pass.
- Added helpers for escaped HTML text, escaped attributes, safe JavaScript string arguments in inline handlers, numeric text/attributes, and whitelisted class tokens.
- Hardened high-risk repeated UI renderers: log rows, edit forms, table rows, SVG chart titles, target-upgrade controls, routine cards, and the live performance card.
- Hardened field-help HTML generation so dynamic help text is escaped before insertion.
- Preserved the v3.26 scoped-rendering performance improvement.
- Preserved the v3.25.10 startup-crash fix using the safe `typeof getScopedStatsLogs !== "undefined"` guard.
- Kept deferred: IndexedDB migration, service-worker architecture change, ES6 module refactor, full rendering rewrite, and array immutability refactor.

## Package

Root-level PWA files: `index.html`, `app.js`, `styles.css`, `manifest.json`, `service-worker.js`, `icon.svg`, `README.md`.

Confirm version: the header should show v3.27.0.
