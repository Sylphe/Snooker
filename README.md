# Snooker Practice PWA v5.5.23

## v5.5.23 — Lightweight Core Serialization Pass

Built from the working v5.5.22 table-repair isolation release.

This release applies Optimization 2 only: `serializeCoreData()` now builds a compact core snapshot directly instead of deep-cloning the full application state and then stripping high-volume `logs` and `sessions`. IndexedDB-ready saves keep logs/sessions out of localStorage while preserving low-volume configuration, routines, plans, tables, taxonomy, settings, and migration metadata.

No lazy rendering, table migration relocation, recommendation-stat caching, or other performance changes were added in this build.

Build timestamp: 2026-05-20 11:18 CEST.
