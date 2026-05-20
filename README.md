# Snooker Practice PWA v5.5.24

## v5.5.24 — Swipe History Rendering Cap

Built from the working v5.5.23 lightweight core serialization release.

This release isolates Optimization 6 only: the swipeable history carousel is capped to the 10 most recent scoped logs, preventing large historical datasets from generating excessive card DOM and inline sparkline SVGs. The traditional history table remains available for broader review.

No lazy rendering, serialization changes, table migration relocation, recommendation-stat caching, or broader render-pipeline changes were added in this build.

Build timestamp: 2026-05-20 11:18 CEST.
