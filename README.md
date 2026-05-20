# Snooker Practice PWA v5.6.0

## v5.6.0 — Routine Pack Foundation

Built from the working v5.5.29 coaching performance baseline.

This release starts the v5.6 Routine Intelligence branch. It adds the foundational infrastructure required for curated exercise libraries, external routine-pack workflows, and future adaptive target calibration.

### Main changes

- Added routine pack JSON export for the active exercise library.
- Added routine library CSV export for external spreadsheet review/editing.
- Added routine pack JSON import with validation, preview, and conservative merge behavior.
- Added canonical routine IDs so catalogue routines can be updated without breaking user logs.
- Added routine-pack metadata fields: canonical ID, catalogue source, pack version, metadata version.
- Added target-profile and skill-map preservation during routine pack export/import.
- Added routine-pack import history metadata.
- Added routine-pack schema/template files for future curated downloadable packs.

### Merge behavior

Routine-pack imports are intentionally conservative:

- Existing routines are matched by canonical ID first, then by routine ID.
- Existing user target histories are preserved by default.
- Existing user descriptions are preserved by default.
- Imported skill maps and catalogue metadata are merged.
- Missing routines are added as catalogue routines.
- Import validation blocks malformed packs before data is changed.

### Included templates

- `routine-pack-schema/routine-pack-template.json`
- `routine-pack-schema/routine-library-template.csv`

These templates define the early pack format for curated routine libraries and external spreadsheet-based review.

### Next v5.6 steps

Planned follow-up releases:

- v5.6.1 — CSV reimport and external editing workflow
- v5.6.2 — curated snooker routine pack v1
- v5.6.3 — adaptive target calibration engine
- v5.6.4 — inferred skill-level profiles
- v5.6.5 — recommendation integration with routine intelligence

Build timestamp: 2026-05-20 14:24 CEST.
