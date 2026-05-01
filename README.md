# Snooker Practice Log — v3.16 final

Built from v3.15.

## New in v3.16 — Analytics Refinement

Performance Stability Index (PSI):
- Combines coefficient of variation and hit-rate volatility
- Classifies performance as Stable / Watch / Unstable

A/B period comparison:
- Compare last 4 weeks vs previous 4 weeks
- Compare last 2 weeks vs previous 2 weeks
- Custom period A vs period B
- Shows deltas for logs, training time, average performance, hit rate, PSI, and best score

Fatigue slope:
- Estimates performance slope versus accumulated session time
- Detects fatigue drag or slow-start pattern more precisely than simple first-third vs last-third comparison

Difficulty ladder:
- Recommends whether to increase, reduce, stabilize, or maintain difficulty
- Uses hit rate, skill gap, performance drift, and PSI

Confirm version:
The header should show v3.16.
