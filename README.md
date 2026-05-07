# Snooker Practice Log — v4.20.0

## Pressure overlay foundation

Adds a low-friction pressure simulation layer that overlays existing routines.

Implemented:
- new `modules/pressure.js`,
- pressure routine selector,
- pressure modes:
  - Streak ladder,
  - Limited lives,
  - Recovery after miss,
- one-tap pressure logging:
  - Made,
  - Miss,
  - Recovery OK,
  - Recovery Fail,
- live pressure metrics:
  - attempts,
  - makes,
  - misses,
  - current streak,
  - best streak,
  - lives,
  - recovery rate,
  - pressure level,
  - pressure score,
- one summarized pressure log saved at finish,
- pressure metadata added to logs.

Design principle:
- no detailed post-shot forms,
- minimal one-tap event logging,
- rich pressure analytics inferred automatically.

Preserved:
- v4.19 predictor contribution model,
- v4.18 tournament planner,
- v4.17 allocation optimization,
- v4.16 plateau diagnostics,
- v4.15 Bayesian action policy,
- v4.14.2 recovery stability path,
- IndexedDB storage and render rollback safety.

Testing checklist:
1. Open the app and confirm routines populate.
2. Select an exercise in Pressure simulation.
3. Start Streak ladder and tap Made / Miss.
4. Finish & Save.
5. Confirm a pressure log appears in Today/Stats.
6. Repeat with Limited lives and Recovery modes.
7. Confirm tabs and Data storage dashboard still work.
