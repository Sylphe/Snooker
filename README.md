# Snooker Practice Log — v3.5 final

Built from v3.4.

## New in v3.5

General app improvements:
- Lightweight session data layer:
  - sessions are tracked separately from logs
  - legacy sessions are rebuilt from existing logs during migration
- Versioned backups:
  - JSON backup filename now includes app version and export date
  - backup JSON includes backupVersion and exportedAt

Smart defaults / recommendations:
- Practice tab now shows a smart recommendation
- Recommendation prioritizes:
  - low target hit rate
  - recent underperformance
  - undertrained categories

Constraint-based session templates:
- Generate a draft training session from:
  - total minutes
  - main focus
  - number of exercises
  - allocation percentages by category

Graph / UI tweaks:
- Charts are more compact and thinner
- Tables are denser
- Analytics cards are more compact

Log editing:
- Edit log category from existing categories
- Useful for recategorizing uncategorized historical logs

Confirm version:
The header should show v3.5.
