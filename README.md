# Snooker Practice PWA v5.6.6

## v5.6.6 — Scoring Archetype Cleanup

Built from the working v5.6.4 curated routine library package.

This release clarifies scoring semantics for the curated routine library and AI coaching exports. It removes ambiguity around progressive drills by making line-ups and break-building continuations use `highest_break` targets, while reserving progressive completion for true station/ladder routines and displaying it as **Steps completed**.

### Main changes

- Converted curated line-up / continuation routines from `progressive_completion` to `highest_break` where appropriate.
- Added `targetMeaning` and `scoringArchetype` metadata to curated routines.
- Relabelled `progressive_completion` in the UI as **Steps completed**.
- Removed time-density semantics from the scoring concept: time remains useful for training volume and fatigue, not performance speed.
- Updated curated target profiles so break-building targets represent highest break, not completed steps.
- Updated AI coaching instructions so external AI interprets `highest_break`, `success_rate`, `points`, and `steps completed` correctly.
- Updated routine-pack schema notes and curated library documentation.


## v5.6.4 — Curated Routine Library v1

Built from the working v5.6.4 target calibration baseline.

This release adds a bundled curated snooker routine library that users can import directly from the Data / Import-Export panel. The pack is designed as a compact, high-transfer training catalogue rather than a large unstructured exercise dump.

### Added

- Bundled `routine-packs/curated-snooker-routine-pack-v1.json`.
- `Import Curated Library v1` action in the Import / Export panel.
- `Download Curated Library JSON` action for external sharing, editing, or AI review.
- 50 curated snooker routines across potting, cue-ball control, break-building, safety/tactical, pressure/match-play, and rest/recovery.
- Stable canonical IDs for every curated routine.
- Six level target profiles for each routine: sub-30, 30-break, 50-break, 70-break, century, and pro.
- Complete metadata per routine: scoring mode, attempts, target, stretch target, total units, training intent, fatigue cost, pressure value, tactical value, primary skill, secondary skills, and transfer skills.
- Conservative merge behavior: existing user routine IDs, descriptions, target histories, and logs are preserved.
- Curated-library notes in `routine-pack-schema/curated-library-v1-notes.md`.

### Intended use

Import the curated library as catalogue routines, then duplicate/edit personal copies if needed. The default targets are designed to be productive baselines, not aspirational failure traps. Use the app target calibration system to adapt them to the player after enough logs are collected.

Build timestamp: 2026-05-20 16:20 CEST.

---


## v5.6.4 — AI Coaching Export

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
- v5.6.4 — curated snooker routine pack v1
- v5.6.4 — adaptive target calibration engine
- v5.6.4 — inferred skill-level profiles
- v5.6.5 — recommendation integration with routine intelligence

Build timestamp: 2026-05-20 14:44 CEST.
