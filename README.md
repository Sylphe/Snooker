# Snooker Practice PWA v5.5.20.1

## v5.5.20.1 — Low-Risk Performance Pass

Build: 2026-05-20 10:05 CEST

This release is built from the stable v5.5.19 Defaults / Forecast Hardening package. It intentionally avoids the higher-risk v5.5.20 optimization changes that caused bootstrap/tab/storage regressions.

### Changes

- Replaced remaining direct `CSS.escape(...)` calls in app code with the existing `cssEscapeSafe()` helper for older WebView compatibility.
- Removed redundant per-routine sorting inside `getLogsByRoutineMap()`; grouped logs preserve parent-array chronological order without extra Date allocations.
- Capped swipeable history cards to the latest 10 records to avoid DOM/SVG overload.
- Reused the grouped routine-log cache for swipe-card sparklines instead of filtering and sorting all logs per card.
- Replaced `new Date(...).getTime()` with `Date.parse(...)` in the Bayesian success-rate aggregation hot loop.

### Explicitly deferred

- No lazy hidden-stats rendering.
- No `serializeCoreData()` rewrite.
- No table-migration relocation.
- No Focus Mode DOM caching.
- No broad render pipeline rewrite.

### Validation

- JS syntax checks passed.
- Manifest JSON validation passed.
- Zip integrity checked.
