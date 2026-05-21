## v5.7.2 — Focus Mode Polish

Small corrective polish release on top of v5.7.0. Stabilizes the live performance card, restores inline +/- steppers when legacy CSS hides them, improves side-split layout on compact phones, prevents timer overflow, and adds a single-button sticky action fallback. No scoring, storage, or analytics logic changed.

## v5.7.2 — Focus Mode UX Reset

Focus Mode has been rebuilt as a stable, mobile-first cockpit layout. This release consolidates the regular drill and side-split drill screens, makes the numpad the primary scoring interaction, anchors Save/Skip actions at the bottom of the screen, and overrides legacy conflicting focus-mode CSS without changing scoring, storage, session, or analytics logic.

Validation performed: JavaScript syntax checks, JSON checks, and zip integrity check.

## v5.7.2 — Selective library import and import-source tagging

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


## v5.7.2
- Added selective routine-pack import preview with checkboxes, search, select all/none, and import-selected flow.
- Imported routines are tagged with source, version, batch, and timestamp metadata.
- Exercise database can filter by import source and shows imported-from badges on imported routines.
