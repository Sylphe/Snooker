# Snooker Practice Log — v4.21.11

Built from `v4.21.10-stats-kpi-overview`.

## v4.21.11 — Stats picker stabilization + modular advanced stats

- Fixed the Stats exercise filter state so the visible picker/select value is the source of truth.
- Synced the persisted `statsRoutineFilter` from the active select value to avoid re-render drift back to `All exercises`.
- Kept the v4.21.10 KPI Overview dashboard.
- Implemented Advanced Stats as expandable modules:
  - Logs in scope
  - Volume & exercise mix
  - Core analytics
  - Second-order analytics
  - Performance stability
  - Fatigue slope
  - Difficulty ladder
  - Coaching engine
  - Selected exercise progression when an exercise is filtered
- Ensured table/venue stats are refreshed from the current scoped logs.
- Added mobile-safe width guardrails for the exercise picker and helper pop-ups.
- Updated version/cache markers to `v4.21.11`.
