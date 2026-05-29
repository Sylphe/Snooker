# Snooker Practice PWA

Version: 5.7.77O.1-focus-mode-v2-density-gear-numpad-entry-fix

## v5.7.77O.1 — Focus Mode v2 Density Gear + Numpad Entry Fix

This release refines Focus Mode v2 after the telemetry compression and smart HUD pass. Focus density is no longer shown on the pre-shot screen; it now lives behind a small gear icon inside Focus Mode v2. Analytical and Coaching density modes avoid duplicated Last / Best / Target / Reach blocks, and Attempt / Time use the in-app numpad rather than native phone keyboard inputs.

### Included

- Focus density moved from pre-shot into a gear settings panel.
- Pre-shot screen simplified to routine context, Last / Best / Target / Reach, table and Start Logging.
- Analytical / Coaching duplicate telemetry blocks reduced.
- Attempt and Time are selectable numpad fields, not native phone inputs.
- Score, side-split fields, Attempt and Time share the same Focus Mode v2 numpad entry system.
- Dark-mode-safe styling for gear, settings, entry boxes and telemetry.
- Existing Focus Mode remains untouched.

# Snooker Practice PWA

Version: 5.7.77O-focus-mode-v2-telemetry-compression-smart-hud

## v5.7.77O — Focus Mode v2 Telemetry Compression + Smart HUD Simplification

This release keeps the original Focus Mode untouched and updates only the parallel Focus Mode v2 test path. It adds a continuous execution loop so practice can flow from log to next attempt without modal interruptions or dead-end review states.

### Included

- Continuous Focus Mode v2 flow strip showing last score, next attempt, saved count and elapsed time.
- Save + next now keeps the user in Logging state by default.
- Micro-feedback remains visible while the next attempt is already ready.
- Review remains available as an optional state, not a forced interruption.
- Repeat attempt, repeat last, undo, gestures, adaptive HUDs, persistent session memory and focus intensity modes preserved.
- Original Focus Mode remains untouched.

### Validation

- ES module syntax checked.
- Zip integrity tested.


## v5.7.77O — Focus Mode v2 Telemetry Compression + Smart HUD Simplification

Focus Mode v2 now prioritizes a single dominant score surface in the logging state. Duplicate break/HUD cards are suppressed, live telemetry is compressed, and the logging hierarchy is simplified around current score → input controls → save/next. Existing Focus Mode remains untouched.
