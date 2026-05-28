# Snooker Practice PWA

Version: 5.7.75F-contextual-validation-dock

## v5.7.75F — Contextual Validation Dock

This build adds contextual validation directly to the selected routine workflow in the Routine Management Console.

### Included

- selected routine validation dock beside the derived metadata summary;
- routine-level issues now appear next to the routine editor instead of only in the global validation table;
- section shortcuts route issues to Core, Transfer, Dependency, or Benchmark / ETU fields;
- Quick Edit Mode from v5.7.75E is retained;
- spreadsheet density, governance metrics, workflow simplification, dependency chains and visual transfer graph remain in place;
- build identity, version module, cache keys and visible app panel updated to v5.7.75F.

### Validation

Run `node --check app.js` and `node --check modules/app-core.js` after unpacking. The release package was generated after those checks passed.
