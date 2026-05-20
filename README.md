# Snooker Practice PWA v5.5.21

## v5.5.21 — Lazy Stats Rendering Pass

Build timestamp: 2026-05-20 10:56 CEST

This release is built from the stable v5.5.20.1 low-risk performance package. It applies Optimization 4 only: hidden/heavy Stats analytics are deferred unless the Stats tab is active.

Included changes:
- Stats rendering is skipped during global `renderAll()` when the Stats panel is not active.
- Heavy Stats side panels are gated behind the active Stats tab.
- Opening the Stats tab explicitly renders the Stats bundle.
- No serialization rewrite, migration relocation, recommendation-cache rewrite, or table-repair changes were included.

Validation performed:
- JavaScript syntax checks.
- Manifest JSON validation.
- Zip integrity test.
