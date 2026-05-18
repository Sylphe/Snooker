# Snooker Practice PWA v4.43.0

## v4.43.0 — Skill Tag Manager

Built from v4.42.0 Adaptive Session Periodization.

### Added
- Skill Tag Manager tab under Exercises.
- Add, edit, archive/restore, and merge controlled skill tags.
- Alias management to prevent duplicate variants such as `cueball speed`, `cue ball speed`, and `cue-ball speed`.
- Category management for Technical, Break-building, Safety / tactical, Mental, Physical, and Custom skill groups.
- Optional transfer relationship field for future skill-relationship analytics.
- Exercise creator skill chips now read from the managed skill library.
- Historical routine/log skill references can be remapped when tags are merged.
- New app icon applied via `icon.svg` and manifest references.

### Guardrails
- No storage/hydration/session-flow changes.
- Existing default skill tags remain available.
- Archived tags are hidden from new selection chips but remain readable in historical data.
- Skill references continue to use stable canonical IDs.
- Bootstrap/render hardening remains in place.

### Build
- Version: v4.43.0
- Build timestamp: 2026-05-18 18:43 CEST
