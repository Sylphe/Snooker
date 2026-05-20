# Snooker Practice PWA v5.5.28

## v5.5.28 — Render / I-O Polish

Built from the working v5.5.27 cache stability baseline.

This release applies the selected low-risk render and I/O optimizations:

- Downsamples large SVG progression charts before rendering to reduce paint cost.
- Updates the tournament preparation planner on input as well as change events.
- Adds a horizontal scroll wrapper for wide history tables on mobile.
- Checks the active IndexedDB connection version before reusing it across upgrades.
- Routes library search/filter changes to the local routine list renderer instead of the full app render pipeline.
- Makes service-worker app-file matching case-insensitive.
- Replaces the linear slope helper with a closed-form O(1) index denominator to reduce temporary array allocation.

Build timestamp: 2026-05-20 12:05 CEST.
