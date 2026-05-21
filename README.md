# Snooker Practice PWA v5.6.12

## v5.6.12 — Dynamic Routine Difficulty Model

Built from the stable v5.6.12 inferred skill level system. This release is additive and intentionally preserves the existing Stats and Skill Radar rendering paths.

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

