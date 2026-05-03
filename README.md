# Snooker Practice Log — v3.24

Built from v3.23.

## Fixes

- Fixed the duplicated Venue / table field in previous-session log editing.
- The edit form now keeps only one Venue / table selector.

## New UX

- Added global Side split at exercise setup level: None or Left / Right.
- Logging screen shows Left side score and Right side score when side split is enabled.
- Attempts and total units are taken from the exercise setup, not re-entered during logging.
- One log is saved per drill. Combined score is the average of left and right.
- Side-level data is stored internally for future analysis.
- Added left/right analytics and helper explanations.
- Added swipeable drill history cards for mobile-friendly Stats review.
- Each card shows:
  - routine name
  - date/time
  - score
  - duration
  - table
  - performance label
  - mini sparkline of recent scores for that routine
  - edit/delete actions

The table view remains available for dense review.

Confirm version:
The header should show v3.24.
