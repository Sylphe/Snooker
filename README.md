# Snooker Practice Log — v3.11 final

Built from v3.10.1.

## New in v3.11

Consistent historical references:

- Logs now resolve the current exercise name dynamically through `routineId`
- Logs keep `routineNameSnapshot` only as a fallback if the exercise is deleted
- Logs now resolve the current daily plan name dynamically through `planId`
- Logs keep `planNameSnapshot` only as a fallback if the plan is deleted
- Sessions also preserve plan IDs and plan snapshots
- CSV export now includes:
  - current routine name
  - routine snapshot name
  - current plan name
  - plan snapshot name

## Why this matters

If you rename an exercise or daily plan later, historical records stay analytically continuous and display the updated name.

If you delete an exercise or plan, the snapshot name remains available as fallback.

Confirm version:
The header should show v3.11.
