# Snooker Practice PWA v5.5.20

## v5.5.20 — Performance / Memory Pass

This release builds on v5.5.19 and focuses on reducing CPU spikes, garbage-collection pressure, and hidden-panel rendering cost while preserving the current data model, offline-first storage design, and v5.5.x hardening baseline.

### Main changes

- Removed redundant per-routine sorting inside the routine-log grouping cache. Sequential grouping now preserves chronological order from the already ordered log stream.
- Reworked core localStorage serialization to avoid deep-cloning the full data tree before stripping high-volume IndexedDB collections.
- Deferred hidden Stats analytics from the global render pipeline; heavy Stats panels now render when the Stats tab is active.
- Limited swipeable history cards to the 10 most recent scoped logs and reused the routine-log map for sparkline inputs.
- Memoized skill alias lookup maps and routine-level statistics, with invalidation tied to data/cache changes.
- Reduced repeated table-repair scans by limiting legacy table-reference repair to startup migration paths.
- Replaced hot-loop Date object construction with Date.parse in Bayesian aggregation and recency helpers.

### Integrity

- Version: v5.5.20
- Build tag: performance-memory-pass
- Build timestamp: 2026-05-20 09:45 CEST
- Base: v5.5.19 defaults / forecast hardening
- JavaScript syntax checks passed.
- Manifest JSON validation passed.
- Zip integrity validation passed.

### Deployment note

Because this is a PWA with a service worker, deploy all files together and use the new query-string version references included in `index.html`, `app.js`, and `service-worker.js`. If a tester sees stale behavior after deployment, reload once or clear the old service-worker cache.
