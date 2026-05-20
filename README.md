# Snooker Practice PWA v5.6.5

## v5.6.5 — Adaptive Target Engine v1

Built from the working v5.6.4 curated routine library baseline.

This release adds the first in-app Adaptive Target Engine. The goal is to make target recalibration practical and statistically safer: the app now identifies mature routines whose targets look too hard, too easy, or outside the productive snooker training band, then places them in a target optimization queue. Accepting a suggestion creates a new target profile version instead of overwriting historical targets.

### Added

- Adaptive Target Engine panel in the Stats view.
- Target health scoring per routine: too hard, stretching, productive, getting easy, too easy, volatile, or insufficient data.
- Productive-band logic by snooker routine type.
- Minimum sample-size and volatility gates before target changes are suggested.
- One-step target recalibration to avoid aggressive downgrades.
- Suggested normal target and stretch target.
- Confidence labels based on sample size and volatility.
- Accept / Snooze / Reject actions for each recommendation.
- New target-profile versioning when applying a suggestion.
- Persistent recommendation action history for accepted, rejected, and snoozed suggestions.
- Mobile-friendly target optimization queue layout.

### Preserved

- Curated Routine Library v1 from v5.6.4.
- Routine pack import/export.
- AI coaching export.
- Existing target history and log target snapshots.
- Existing storage, IndexedDB, and performance hardening.

### Design rule

Adaptive target changes are never applied silently. The user must explicitly accept a recommendation, and the app records the change as a new target profile so older logs remain historically comparable.



## v5.6.5 fixed — Adaptive Target Engine render hook

Patch note: wired `renderAdaptiveTargetEngine()` into `renderStatsBundleIfVisible()` so the Adaptive Target Engine panel populates when opening the Stats tab via normal tab navigation.
