# Snooker Practice PWA

Version: 5.9.5-training-rotation-layer


## v5.9.5 — Training Rotation Layer

Adds proximity-adjusted Bayesian evidence so close same-day sessions are treated as partially dependent observations in current-form, target-range and success-rate Bayesian calculations.


- Adds Smart Builder same-day exposure guard with Allow / Avoid / Do not allow modes.
- Uses all logs from the current training day, not only the active session.
- Avoid mode down-weights exact same routine repeats.
- Block mode excludes exact same routine repeats while preserving alternatives.
- Training Day Context remains visible and feeds the guard.

## v5.9.0 — Training Day Context Layer

- Added Smart Session goal override: Maximize ETU.
- Added Smart Session goal override: Fastest level progression.
- Override goals bypass Smart Builder composition caps except selected time limit.
- Added Focus Mode v2 average-break entry for break target / consistency / break-building drills.
- Focus V2 average break is persisted on logs as averageBreak and averageBreakPerAttempt and mapped to break-target consistency statistics.

## v5.8.2 — Smart Builder ETU / Template Hardening

- Raises Benchmark-prep ETU policy from a very low 4.0 cap to a 60-min-scaled 5.5 ETU cap.
- Raises Benchmark-prep benchmark-density limit from 45% to 60%.
- Rewords ETU bypass mode as audit-only mode: ETU load modifiers are bypassed, but template safety caps remain visible and enforced.
- Adds post-optimization template hard-cap enforcement for pressure count, benchmark density, and final ETU.
- Recomputes ETU budget after composition optimization so the audit reflects the final generated session, not the pre-optimization draft.
- Preserves v5.8.1 metadata repair import/export branch.

# Snooker Practice PWA

Version: 5.7.77U.5-smart-engine-explanation-integrity

## v5.7.77U.5 — Smart Engine Explanation Integrity Patch

- Fixes dark-mode visibility of compact snooker-ball break controls.
- Reorders break controls into a prioritized block: ball increments, Miss/Foul/Clear/Save, then numpad.
- Makes break reset and new-attempt reset reliable so Current Break returns to 0 instead of falling back to the previous saved break.
- Preserves Focus Mode v2 layout correction and original Focus Mode.

## v5.7.77U.2 — Focus Mode v2 Logging Layout Correction

- Restored the compact routine name/folder context card above attempts/time in Focus Mode v2 logging.
- Kept redundant lower logging context removed.
- Recolored compact snooker-ball increment chips with dark-mode-safe true ball colors.
- Compressed Undo / Repeat last / Review into a single utility row.
- Re-aligned Pre-shot and Logging panels to the same width and positioning contract.

## v5.7.77U.1 — Focus Mode v2 HUD Density Refinement

- Compresses semantic colored ball controls into small snooker-ball chips positioned directly above the v2 numpad.
- Makes Current Break selectable/editable through the in-app numpad.
- Removes the ready flashing box from the logging screen.
- Removes redundant logging exercise name/folder context from the logging state.
- Keeps the original Focus Mode untouched and preserves v5.7.77U timer stabilization.

# Snooker Practice PWA

Version: 5.7.77U-focus-mode-v2-stabilization-pass
Build: 2026-05-29 09:23 CEST

## v5.7.77U — Focus Mode v2 Stabilization Pass

- Restores a Focus Mode v2 timer layer connected to the app timer settings: manual or auto-start with delay.
- Adds timer start/pause/reset controls inside Focus Mode v2 and keeps elapsed time refreshed during logging.
- Normalizes pre-shot and logging panel sizing so the cockpit does not jump between screens.
- Fixes semantic colored ball buttons for break-building mode.
- Keeps Focus Mode v2 parallel to the original Focus Mode.

# Snooker Practice PWA

Version: 5.7.77T-focus-mode-v2-pre-shot-compression-review-reduction

## v5.7.77T/R — Focus Mode v2 Pre-Shot Compression + Review Reduction

- Compresses the Focus Mode v2 pre-shot screen into a single-screen setup flow.
- Condenses last / best / target / reach into one compact strip.
- Reduces Review from a normal flow state to an exception state for PB, target or benchmark events, plus manual review.
- Normal saves stay in continuous Logging flow with micro-feedback instead of interrupting practice rhythm.

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


## v5.9.0 — Training Day Context Layer
- Adds separate Smart Builder checkbox: Enforce ETU caps / constraints.
- Default is off: ETU remains visible for audit, but no ETU trimming, rejection, or ETU cap warnings are applied.
- Time/duration limit remains enforced.


## v5.9.3 — Save & Start Smart Session

- Adds routine-family metadata in Routine Console.
- Adds variant role, alternative-for, linked alternatives and progression siblings.
- Same-day exposure guard now blocks exact repeats but boosts linked alternatives when available.
- Preserves v5.9.1 same-day guard behavior for unlinked routines.


## v5.9.3 — Save & Start Smart Session

- Added Smart Builder Save & Start Focus V2 flow.
- Smart sessions are auto-named and saved as plans before launch.
- Saved plan records include smartSessionMeta for source/template/goal context.
- Existing Load into Plan Builder remains available.


## v5.9.5 notes
- Converts ETU from fatigue/cap logic into a training rotation layer.
- Disables ETU caps/trimming/warnings globally; duration remains the hard cap.
- Penalizes exact routine repeats over a 2-3 day freshness window.
- Lightly penalizes same-family/domain repetition and boosts linked alternatives.
