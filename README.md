# Snooker Practice Log — v3.12 final

Built from v3.11.1.

## New in v3.12

Constraint-aware exercises:

- Added exercise-level Target Colour field
- Supported colours:
  - red
  - yellow
  - green
  - brown
  - blue
  - pink
  - black
  - custom / other
- Existing `blacks_only` target mode automatically maps to target colour = black
- Progressive completion logs now store target colour
- Display and CSV export include target colour
- Added contextual help for Target Colour

## Why this matters

A blue-only break-building drill and a black-only line-up drill have different technical constraints. Tracking the colour at exercise level keeps the data useful without adding ball-by-ball logging friction.

Confirm version:
The header should show v3.12.
