# Snooker Practice PWA

Version: 5.7.77E-focus-mode-v2-gesture-interaction-layer

## v5.7.77E — Focus Mode v2 Gesture Interaction Layer

This release uses v5.7.77D as the stable base and extends only the parallel Focus Mode v2 test path. The existing Focus Mode remains untouched.

### Included

- Gesture Interaction Layer inside Focus Mode v2.
- Swipe right: success / save current score and move to next attempt.
- Swipe left: miss / failure / zero-score capture depending on input mode.
- Swipe up: next attempt.
- Double tap: repeat previous saved v2 draft score.
- Long press: undo last v2 draft entry.
- Gesture hint row in the logging screen.
- Button-based quick logging preserved.
- Draft-only v2 history still does not write to main logs.

### Validation

- JavaScript syntax checked with `node --check`.
- Zip integrity tested.
