# Snooker Practice Log

## v5.3.3 — Focus Cockpit Layout Cache Fix

Build: 2026-05-19 10:59 CEST

This release corrects the v5.3.2 packaging issue where `app.js` still imported `app-core.js?v=5.3.1`, so the browser could continue loading the old Focus Mode code even though the CSS/cache references showed v5.3.2. The static app header is also updated.

### Included

- Corrected `app.js` module import to v5.3.3.
- Updated visible app header/build label.
- Preserved the exact Focus Cockpit layout changes:
  - 437px Focus Mode shell.
  - 298px central scoring stack.
  - compact operational header.
  - dominant Current Break card.
  - embedded 3x4 numpad.
  - compressed attempts / time / venue telemetry strip.
  - compact quality selector.
  - floating Save button.
  - bottom gesture footer.
- Version/cache/module references aligned to v5.3.3.

### Validation

- JS syntax checks passed.
- Duplicate-declaration checks passed.
- Zip integrity check passed.

No scoring, analytics, storage, hydration, or session schema changes.
