# Snooker Practice PWA v5.6.13

## v5.6.13 — Dynamic Routine Difficulty Model

Built from the stable v5.6.13 inferred skill level system. This release is additive and intentionally preserves the existing Stats and Skill Radar rendering paths.

### Added

- Dynamic Routine Difficulty Model panel in Stats.
- Per-routine difficulty estimate using recent score, target hit-rate, volatility, latent difficulty and category context.
- Difficulty bands: easy, light, productive, hard, overload.
- Category-relative normalization so a hard long-potting drill is not judged like a safety or maintenance drill.
- Action guidance for each routine: maintain, progress, simplify, use as stretch/acquisition.
- AI coaching export now includes `dynamicRoutineDifficultyProfile`.

### Guardrails

- No replacement of the inferred skill radar.
- No changes to the radar SVG rendering path.
- No changes to IndexedDB schema.
- No changes to routine/log persistence.

### Validation

- JavaScript syntax check.
- Manifest JSON validation.
- Routine-pack JSON validation.
- Zip integrity check.



## v5.6.13 — Session Architecture Engine

Adds an additive session-sequencing layer on top of the stable v5.6.13 stats/radar system.

Implemented:
- warm-up / acquisition / transfer / pressure / recovery block architecture;
- routine sequencing using fatigue cost, latent difficulty, pressure value, tactical value, transfer score and readiness;
- 90-minute model session profile in Stats;
- session architecture profile in AI coaching export;
- sequencing warnings for high energy load or immature pressure blocks.

This release does not replace the existing Stats flow, Dynamic Routine Difficulty Model, or Inferred Skill Radar.
