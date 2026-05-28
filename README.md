# Snooker Practice PWA

Version: 5.7.77A-focus-mode-v2-state-architecture

## v5.7.77A — Focus Mode v2 State Architecture

This release introduces Focus Mode v2 in parallel with the existing Focus Mode. The current logging flow is preserved. A new Practice-tab button opens a test cockpit with three isolated states: Pre-shot, Logging and Review.

### Included

- Practice tab button: Focus Mode v2 Test.
- Focus Mode v2 modal shell.
- State architecture: Pre-shot, Logging, Review.
- Large score-entry cockpit for the v2 test flow.
- Isolated v2 draft state; it does not overwrite the current Focus Mode or main logging flow.
- Existing v5.7.76H.3 Routine Console containment fixes preserved.

### Validation

- ES module syntax check passed.
- ZIP integrity test passed.
