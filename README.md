# Snooker Practice Log — v4.21.1

## Left / Right Side Split Restoration

Built from v4.21.

Restores the left/right side split that existed in earlier v3.24 builds.

Implemented:
- Side split selector in the exercise setup form:
  - None
  - Left / Right
- Left and right score inputs during logging when enabled.
- One combined log is saved.
- Combined score = average of left and right side score.
- Side-level metadata saved on the log:
  - sideMode
  - sideSplitEnabled
  - leftSideScore
  - rightSideScore
  - sideScores
- Exercise database shows a Left / Right badge.
- Quick-score macros are disabled for side-split drills to avoid corrupting side-specific input.

Preserved:
- v4.21 pressure escalation features.
- v4.20 pressure foundation.
- IndexedDB/storage safety path.
- renderToday/renderStats rollback safety.

Testing checklist:
1. Create or edit an exercise.
2. Set Side split = Left / Right.
3. Start that exercise.
4. Confirm Left side score and Right side score appear.
5. Enter both values and save.
6. Confirm one log is created with combined score.
7. Confirm normal non-side-split exercises still work.
