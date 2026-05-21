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


## v5.6.17.3 — Hardening fixes

- Capped AI coaching export routine snapshots to reduce export size and memory pressure.
- Clamped recommendation scores to finite values to prevent NaN ranking/UI leakage.
- Deduplicated target profile history during migration/import.
- Added orphan-session cleanup during migration to prevent empty sessions from skewing summaries.
- Preserved active-session table deletion guard and existing storage/import integrity fixes.
