# Snooker Practice Log — v3.13 final

Built from v3.12.

## New in v3.13

Target / difficulty versioning:

- Each exercise now has a target profile history
- When target, stretch target, total units, attempts, or scoring type changes, the app asks:
  - OK = create a new target version from today
  - Cancel = correct the existing active target profile
- Logs store:
  - targetProfileId
  - targetAtLog
  - stretchTargetAtLog
  - totalUnitsAtLog
  - attemptsPerSessionAtLog
  - difficultyLabelAtLog
- Historical performance remains evaluated against the target that was active when the log was created
- Current-target performance can also be calculated separately
- Stats show target-version summaries where multiple versions exist
- CSV export includes target-at-log and current-target performance

## Why this matters

If you raise a target after performing well, old logs remain fairly classified against the old target, while new logs are evaluated against the new difficulty level.

Confirm version:
The header should show v3.13.
