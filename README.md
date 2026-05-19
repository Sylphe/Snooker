
## v5.3.2 — Exact Focus Cockpit Layout

Build: 2026-05-19 10:49 CEST

- Recomputed Focus Mode around a 437px mobile shell and 298px scoring stack.
- Added compact operational header, dominant Current Break card, embedded 3x4 numpad, compressed telemetry strip, quality selector, floating save button, and gesture footer.
- Demoted legacy form fields, side controls, full-width venue/time fields, and sticky save row from the main Focus Mode viewport.
- Preserved existing scoring, session, analytics, hydration, and storage logic.

# Snooker Practice PWA v5.3.1

## v5.3.1 — Dominant Score Cockpit

Built from v5.3.0 Focus Mode Foundation Refactor.

### Changes

- Enlarged the central Focus Mode score cockpit so the current score/break is the dominant visual element.
- Rebalanced the embedded 3x4 numpad to sit directly under the score display with premium dark table-mode tile styling.
- Compressed the telemetry strip beneath the numpad for attempts, time, venue, and setup controls.
- Reduced side-action clutter and visually demoted secondary controls.
- Repositioned the primary Save action as a floating thumb-zone action.
- Added a contextual action footer for undo/reset/repeat gesture hints.
- Tightened Focus Mode spacing and alignment to resemble a performance instrument rather than a form.

### Stability

- No analytics changes.
- No storage changes.
- No hydration changes.
- No session schema changes.
- Existing scoring, numpad, long-press, swipe, and save logic preserved.

### Build

- Version: v5.3.1
- Build timestamp: 2026-05-19 10:31 CEST
