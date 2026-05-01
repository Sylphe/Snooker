# Snooker Practice Log — v3.4 final

Built from the stable v3.2 structure and includes v3.3 training logic plus the advanced analytics layer.

## New in v3.4

Advanced analytics:
- Rolling average trend detection
- Momentum status
- Correlation analysis:
  - duration vs performance
  - session rating vs performance
- Personal benchmark:
  - latest score vs configurable baseline window
- Streak tracking:
  - current training streak
  - best training streak
- Target hit rate
- Progressive overload suggestion
- Ceiling vs baseline gap
- Consistency score / volatility
- Rolling average chart

Log management:
- Edit session logs directly from Today and Stats
- Edit:
  - date/time
  - score
  - attempts
  - time
  - rating
  - tags
  - notes
- Delete individual session logs

Existing data:
- Existing logs should migrate automatically if the app URL/domain is unchanged.
- Export a JSON backup before deploying if you want a safety copy.

Confirm version:
The header should show v3.4.
