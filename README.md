# Snooker Practice Log — v4.21.7

Built from `v4.21.3-left-right-score-fix`.

## v4.21.7 — Stats filter and modal width fix

- Stats exercise filter now uses one centralized scope function across overview, advanced stats, and phase-one insights.
- Added visible active-scope banner so filter/date/period changes are immediately auditable.
- Exercise picker and helper modals are constrained to viewport width on mobile.

## v4.21.4 — Left / Right attempt-mode architecture

This release adds explicit attempt-mode handling for Left / Right drills while preserving legacy compatibility.

### Changes

- Added `attemptMode` for side-split routines and logs.
- Legacy side-split routines/logs default to `shared` mode.
- Added routine setup selector: `Shared total attempts` vs `Attempts per side`.
- Added log edit selector so legacy logs can be converted later.
- Success-rate normalization now uses effective attempts:
  - `shared`: attempts = the total entered in the Attempts field.
  - `per_side`: effective attempts = Attempts × 2.
- Left / Right display now shows the attempt basis, e.g. `10/side (20 total)`.
- Bayesian confidence aggregation now uses effective attempts for side-split logs.
- CSV export now includes `attemptMode`, `effectiveAttempts`, `leftSideScore`, and `rightSideScore`.

### Example

For a Left / Right drill with Attempts = 10 and score Left = 3, Right = 4:

- Shared mode: 7 / 10 = 70%.
- Per-side mode: 7 / 20 = 35%.

## Baseline retained

- Resume-session hotfix retained.
- Left / Right score editing retained.
- IndexedDB storage architecture retained.
- ES module architecture retained.