# Snooker Practice PWA v5.6.3

## v5.6.3 — AI Coaching Export

Built from the working v5.6.1 external editing workflow.

This release adds an AI-readable coaching export designed specifically for snooker practice analysis. It is not a generic backup: it produces a compact decision package for target calibration, routine prioritization, skill-gap diagnosis, and next-session recommendations.

### Added

- Export AI Coaching Snapshot JSON from the Data / Import-Export panel.
- Snooker-specific AI instructions embedded directly in the export.
- Routine catalogue snapshot with canonical IDs, scoring modes, targets, skills, transfer tags, and target history.
- Per-routine statistical snapshot including averages, volatility, target hit rate, routine stats, and recent evidence logs.
- Available analytical outputs included where calculable: Bayesian success-rate estimates, target credible intervals, dynamic difficulty, current form, change-point signal, performance stability, fatigue slope, plateau/overtraining checks, difficulty ladder, forecast, progressive-completion stats, context normalization, and transfer value.
- Global player profile with total routines/logs/sessions, total practice time, target hit rate, current form, fatigue, plateau, overtraining, change-point, and forecast signals.
- Skill profile summary aggregated by primary/secondary/transfer skills.
- Target calibration candidates with suggested target changes and rationale.
- Recent evidence section limited for AI readability.

### Intended use

Export `snooker-ai-coaching-export-*.json`, upload or paste it into an AI tool, and ask for snooker-specific recommendations on:

- which routines are too hard, too easy, or in the productive learning band;
- how to adjust targets without corrupting historical stats;
- which skills are undertrained or volatile;
- which routines should be prioritized in the next training block;
- whether routine metadata, tags, or transfer skills need cleanup.

### Notes

This export can include notes, timestamps, and detailed performance data. Share it only with AI tools or people you trust.

## v5.6.1 — External Editing Workflow

Built from the working v5.6.1 routine pack foundation.

This release adds the first practical bulk-editing workflow for the exercise library. It allows users to export the library to CSV, edit core routine fields in a spreadsheet, then reimport the CSV with validation and a diff-style preview before applying changes.

### Main changes

- Added Routine CSV import from the Import / Export panel.
- Added CSV parser with quoted-cell support and file-size/type validation.
- Added validation for required names, duplicate canonical IDs, and invalid numeric fields.
- Added import preview showing added, updated, and unchanged routine counts.
- Added conservative merge behavior preserving existing routine IDs and historical logs.
- Added CSV import history metadata.
- Added skill-map parsing for primary, secondary, and transfer skills using pipe/comma/semicolon-separated values.
- Added canonical-ID matching so external spreadsheet edits update catalogue routines without breaking log references.

### CSV merge behavior

Routine CSV imports are designed for spreadsheet-based editing:

- Existing routines are matched by canonical ID.
- Existing routine IDs are preserved.
- Existing logs remain linked to their routines.
- Missing catalogue routines are added.
- Skill maps are normalized against the app taxonomy.
- Invalid rows are blocked before any data is changed.


## v5.6.1 — Routine Pack Foundation

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

- v5.6.1 — CSV reimport and external editing workflow ✅
- v5.6.3 — curated snooker routine pack v1
- v5.6.3 — adaptive target calibration engine
- v5.6.4 — inferred skill-level profiles
- v5.6.5 — recommendation integration with routine intelligence

Build timestamp: 2026-05-20 14:44 CEST.
