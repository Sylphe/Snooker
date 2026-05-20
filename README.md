# Snooker Practice PWA v5.5.22

## v5.5.22 — Table Repair Isolation Pass

Build timestamp: 2026-05-20 11:08 CEST

This release is built from the stable v5.5.21 lazy stats rendering package. It applies Optimization 35 only: legacy table-link repair is isolated from hot lookup helpers so table lookups no longer scan historical logs repeatedly.

Included changes:
- Removed the historical log repair sweep from `tableById()`, `tableByName()`, and normal table-select rendering paths.
- Added a one-time `repairLegacyTableLinksOnce()` migration helper for legacy logs with `venueTable` but no `tableId`.
- Bootstrap now calls `ensureTablesDatabase({ repairLegacy: true })` after IndexedDB hydration, before reference refresh/render.
- Normal table helpers now remain O(1)/small-array lookups instead of triggering full log scans.
- No serialization rewrite, recommendation-cache rewrite, hidden-stats gating changes, or table-default behavior changes were introduced beyond this targeted optimization.

Validation performed:
- JavaScript syntax checks.
- Manifest JSON validation.
- Zip integrity test.
