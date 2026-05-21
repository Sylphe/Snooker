## v5.6.19 — Player rating and scoring-change safety

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
