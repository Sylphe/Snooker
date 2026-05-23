## v5.7.3 — Focus Mode Polish

Small corrective polish release on top of v5.7.0. Stabilizes the live performance card, restores inline +/- steppers when legacy CSS hides them, improves side-split layout on compact phones, prevents timer overflow, and adds a single-button sticky action fallback. No scoring, storage, or analytics logic changed.

## v5.7.3 — Focus Mode UX Reset

Focus Mode has been rebuilt as a stable, mobile-first cockpit layout. This release consolidates the regular drill and side-split drill screens, makes the numpad the primary scoring interaction, anchors Save/Skip actions at the bottom of the screen, and overrides legacy conflicting focus-mode CSS without changing scoring, storage, session, or analytics logic.

Validation performed: JavaScript syntax checks, JSON checks, and zip integrity check.

## v5.7.3 — Selective library import and import-source tagging

- Success-rate routines now display targets as percentages in routine cards and live-session metadata.
- Exercise creation/edit form now shows a soft success-rate percentage hint beside target and stretch target inputs.
- Numeric display helper now caps non-integer numbers to a maximum of three decimals and trims trailing zeroes, reducing long Bayesian/evidence decimals in Stats.

# Snooker Practice PWA v5.6.17.2

## v5.6.17.2 — Stats Scope and Insights Resilience Fix

Adds a higher-level coaching interpretation layer on top of the existing inference, probabilistic, match simulation, and cross-routine skill graph systems.

Included:
- Natural-language coaching summary.
- Weekly coaching report using recent logs with fallback to recent sample.
- AI-generated 60 / 90 / 180 minute session plans.
- AI-adjusted target suggestions using target health and 70% true-performance intervals.
- Explainability layer: why the app recommends a skill, routine, target adjustment, or bridge block.
- AI export schema v1.4 with AI Coaching Layer v2 profile.

Startup, storage, hydration, and tab initialization were not changed.


## v5.6.17.5 — Stats scope hardening

- Capped AI coaching export routine snapshots to reduce export size and memory pressure.
- Clamped recommendation scores to finite values to prevent NaN ranking/UI leakage.
- Deduplicated target profile history during migration/import.
- Added orphan-session cleanup during migration to prevent empty sessions from skewing summaries.
- Preserved active-session table deletion guard and existing storage/import integrity fixes.


## v5.7.3
- Added selective routine-pack import preview with checkboxes, search, select all/none, and import-selected flow.
- Imported routines are tagged with source, version, batch, and timestamp metadata.
- Exercise database can filter by import source and shows imported-from badges on imported routines.


## v5.7.6 — Benchmark ladder metadata

Adds optional Junior / Club / Senior / Pro benchmark targets to exercise templates, displays benchmark context in the exercise database and active-session header, and carries benchmark fields through JSON/CSV routine imports.


## v5.7.6 — Benchmark player class estimator
- Added benchmark-based player class estimate using Junior / Club / Senior / Pro routine targets.
- Added match-stable vs technical benchmark classification.
- Added weakest benchmark domain readout in Overview and Inferred Skill insights.


## v5.7.7 Nolan Benchmark Pack v1
- Adds bundled Nolan Benchmark Pack v1 with 20 curated routines.
- Includes Junior / Club / Senior / Pro benchmark ladders, setup descriptions, coaching purpose, skill tags and transfer tags.
- Adds import/download buttons in Settings → Data import / export.


## v5.7.10 Text-first Setup Cards
- Adds setup description, scoring rule, coaching purpose, common mistake, and benchmark notes metadata.
- Displays compact setup cards in the exercise database and active session screen.
- Preserves setup metadata through routine pack and CSV import/export.


## v5.7.11 Routine Edit Save/Hydration Fix
- Fixed advanced skill tags not reliably saving from the exercise editor.
- Fixed setup-card metadata hydration when editing imported Nolan routines.
- Added silent Nolan metadata repair for routines imported before the setup-card fields were fully mapped.
- Prevented empty edit fields from wiping existing setup/scoring/coaching metadata.

## v5.7.12 Routine Edit Metadata Integrity Fix
- Preserves hidden routine metadata on edit, including canonical IDs, catalogue flags, source pack lineage, timestamps, archive flags, and metadata version history.
- Allows users to intentionally clear setup-card text fields and benchmark ladders instead of restoring old text automatically.
- Uses the universal setup metadata parser for library setup cards so imported/nested Nolan metadata displays consistently.
- Removes duplicate edit-form population to avoid overwriting fields during render.
- Adds hidden identity fields for catalogue routines and strips archived skill tags during active routine saves.

## v5.7.13 Routine Edit Hardening and Validation Fix
- Synced edited difficulty labels back to the active target profile.
- Added mobile scroll containment for large skill-chip selectors.
- Hardened skill-map cache rebuilding after skill merges.
- Persisted repaired active target profile IDs when legacy target history was incomplete.
- Clamped success-rate targets and stretch targets to 0–100.
- Rounded count-based total units and attempts-per-session fields.
- Reset the exercise form to Basic mode after clearing.
- Preserved import batch ancestry fields during routine edits.

## Changelog — v5.7.14

- Fixed fatal bootstrap regression introduced in v5.7.12/v5.7.13 where `APP_BUILD_TIMESTAMP` was missing from `modules/version.js`.
- Updated module cache-busting query strings for the bootstrap path.
- Updated service-worker cache version.
- No new per-release `.txt` file added.
## Changelog — v5.7.17

- Fixed fatal bootstrap ordering bug where `ensureTablesDatabase()` could run before `DEFAULT_TABLE_DEFINITIONS` was initialized.
- Moved default table definitions above first startup table initialization.
- Updated visible app version, module cache-busting strings, and service-worker cache version.
- No separate release `.txt` file added.



## v5.7.19 — Routine tags and pack model alignment fix

- Fixed routine skill tags not hydrating/saving reliably after edit.
- Made the routine object the source of truth for `skillMap`; the global `routineSkillMap` is treated as a cache only.
- Reordered routine-save skill synchronization so edited tags are saved before historical log skill snapshots are refreshed.
- Separated import provenance display from analytical skill/tag badges; imported-pack source is now shown as metadata, not as an analytics tag.
- No standalone release `.txt` file added.

## v5.7.20 — Curated Library v2 migration

- Normalized the bundled Curated Snooker Routine Library to the current routine DB model.
- Added setup descriptions, scoring rules, coaching purposes, common mistakes, benchmark notes, and benchmark sources across the curated pack.
- Added Junior / Club / Senior / Pro benchmark ladders across all curated routines.
- Set bundled curated defaults to Club target and Senior stretch target instead of Pro-level defaults.
- Converted constrained break-building line-up routines to highest-break scoring where appropriate.
- Normalized skill maps, transfer tags, target histories, routine archetypes, structure types, and catalogue provenance.

## v5.7.21 — Pack schema alignment audit fix

- Aligned Nolan Benchmark Pack v1 to the same routine DB model used by Curated Library v2.
- Added Nolan target histories, active target profile IDs, recommendation mode, provenance fields, and pack-level skill/target profile maps.
- Set Nolan pack defaults to Club target and Senior stretch target, matching Curated Library v2.
- Updated import preview defaults to keep pack targets unless explicitly overridden.
- Removed misleading wording that treated import provenance as analytics tags.
- Updated stale ES module cache-busting query strings across `app.js` and `modules/app-core.js`.

## v5.7.22 — Legacy routine upgrade layer

- Added a legacy routine audit tool in the Exercise database.
- Added a safe legacy upgrade action that repairs metadata without rewriting historical logs.
- Added archive-and-link migration for routines whose modern scoring archetype differs from legacy logs.
- Added routine migration fields: migration status, replacement link, routine family ID, historical-log preservation marker, and scoring continuity.
- Safe upgrades use bundled Nolan / Curated v2 templates as canonical metadata sources.

## v5.7.23 — Legacy upgrade action fix

- Fixed the legacy upgrade action so it fires through both direct button binding and delegated data-action routing.
- Added fallback metadata generation for legacy routines without a matching bundled template.
- Ensured safe legacy upgrade fills benchmark targets, setup text, scoring rules, coaching purpose, common mistakes, archetype, structure type, target history, and skill map fields.
- Added post-upgrade render/audit refresh so the audit result reflects the applied migration immediately.
- Exposed `window.SnookerLegacyMigration` for emergency manual audit/upgrade diagnostics.

## v5.7.24 — Legacy upgrade execution fix

- Rebuilt the legacy upgrade executor to mutate and persist routines deterministically.
- Fixed audit logic so archived legacy routines no longer appear as still needing migration.
- Added visible progress/error output inside the Legacy Routine Audit panel.
- Added stronger fallback metadata generation for self-repair routines.
- Added log skill-snapshot refresh for upgraded active routines.
- Hardened direct and delegated button execution for the safe legacy upgrade action.

## v5.7.25 — Legacy upgrade finite-number fix

- Fixed runtime failure in legacy upgrade caused by missing `finiteNumber` helper.
- Added compatibility helper used by target-history de-duplication during migration.
- Preserved v5.7.24 migration execution fixes.

## v5.7.26 — Legacy upgrade helper/cache fix

- Fixed stale `app.js` module import cache-busting that still pointed to `app-core.js?v=5.7.21`.
- Removed the legacy upgrade dependency on `finiteNumber()` by using the existing `finiteOr()` helper directly.
- Updated all version/cache markers to v5.7.26.

## v5.7.27 — Smart Session generation fix

- Fixed stale internal ES module cache-busting in `app-core.js` that still pointed to v5.7.21 modules.
- Added robust Smart Session candidate pool fallback after routine migration/archive changes.
- Added focus matching across category, folder, and primary skill instead of category-only matching.
- Added fallback plan generation when advanced Smart Session filters produce no picks.
- Hardened Load into Plan Builder so it can recover from an empty draft when active routines exist.
