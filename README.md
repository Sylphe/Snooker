# Snooker Practice PWA v5.6.8

## v5.6.8 — Transfer-Readiness Coaching Layer

Built from the working v5.6.7 Context-Aware Calibration branch.

This release adds a first explicit transfer-readiness layer on top of the existing adaptive target and AI coaching export system. The goal is to separate pure acquisition drills from drills that are mature enough to act as bridge routines into pressure practice, frame-like play, or match transfer.

### Main changes

- Adds routine-level transfer-readiness scoring in the AI coaching snapshot.
- Classifies routines as:
  - ready_to_transfer;
  - build_transfer_base;
  - not_ready_yet.
- Uses log count, recent normalized performance, target-hit rate, target health, and linked destination routines to estimate whether a routine can currently drive carryover.
- Adds linked destination detection from transfer tags and adjacent routine skill tags.
- Adds metadata warnings for missing transfer tags, routines with no linked destination, low evidence, and targets that are too hard to support transfer.
- Adds a top-level transferReadinessProfile to the AI coaching export with counts, top bridge routines, and metadata gaps.
- Extends AI export instructions so external AI analysis can distinguish acquisition drills, bridge drills, and match-transfer candidates.
- Updates cache/version markers to v5.6.8-transfer-readiness-coaching.

### Design intent

The engine now distinguishes between:

- a routine that is useful for isolated technical acquisition;
- a routine that should be paired with adjacent drills before expecting match transfer;
- a routine mature enough to feed pressure blocks or frame-like work;
- a routine whose metadata is too weak for transfer claims.

This is an intermediate coaching layer before a heavier Transfer-Aware Coaching Engine. It does not yet run a full transfer optimization model; it makes transfer readiness explicit and exportable.
