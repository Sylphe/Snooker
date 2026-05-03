# Snooker Practice Log — v3.21

Built from v3.20.

## New in v3.21 — Phase 1 statistical insights

Residual analysis:
- Adds expected vs actual performance using exponential moving average.
- Shows recent residuals by routine.
- Positive residuals suggest potential target increase.
- Negative residuals suggest difficulty/fatigue/context issues.

Session peak window:
- Detects the approximate session time range where performance is strongest.
- Helps place difficult drills at the right point in the session.

Contextual factor analysis:
- Shows performance lifters/drags by:
  - table
  - intervention
  - time of day
- Uses simple grouped effect size versus global average.

Venue/table cleanup:
- Removed duplicated table note editing from previous-session log edits.
- Kept one coherent table model:
  - stable table ID
  - table name
  - table info stored in the Tables / venues database
- Logs keep table ID and table-name snapshot for historical continuity.

Confirm version:
The header should show v3.21.
