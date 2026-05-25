# Snooker Practice PWA v5.7.57

## v5.7.57 — ETU history and load management

This release extends the v5.7.56 ETU calibration layer into a practical training-load view inside the Stats > Predictions tab.

### Added

- ETU load-management panel inside Predictions.
- 7-day, 14-day and 28-day ETU load views.
- Acute-vs-baseline ETU ratio.
- Load status bands: low load, productive load, high load, overload risk.
- Load consistency score based on recent ETU volatility.
- Next-load guidance for recovery, consolidation, normal training or acquisition.
- Continued ETU session timeline, cumulative ETU path, quality mix and component breakdown.

### Preserved

- Raw ETU vs effective ETU.
- Diminishing returns after roughly 90 minutes.
- Existing prediction visuals and forecast guardrails.
- Existing storage schema, logs, sessions, routines and IndexedDB/localStorage behavior.

### Technical notes

- No schema migration required.
- No log mutation performed.
- Prediction and ETU rendering remain guarded so UI errors cannot block bootstrap or storage hydration.
- Build label, cache version, module cache-busting references, index build text and README metadata updated to v5.7.57.
