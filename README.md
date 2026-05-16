# Snooker Practice Log — v4.22.0

## v4.22.0 — Adaptive session duration, PB hook, and KPI tooltip restoration

Built from v4.21.18 audit polish.

### Changes
- Reworked adaptive session generation so selected duration is respected more closely. Longer sessions now repeat/fill priority drills until the estimated loaded session length is close to the requested time.
- Adaptive output now shows target duration, estimated loaded duration, and drill block count.
- Loading an adaptive session into the plan builder now preserves the generated drill sequence rather than collapsing it back to a short unique list.
- Added a prominent Personal Best field in the Live Performance card when starting/logging a drill.
- Restored the Overview KPI dashboard path and added help tooltips to KPI cards.
- Updated version/build timestamp to v4.22.0.

### Validation
- JS syntax checks passed for all JavaScript files.
