# Snooker Practice PWA v5.6.11

## v5.6.11 — Inferred Skill Level System

This release adds the first true skill-specific latent level layer. The app no longer treats the player as one global level only; it now estimates separate inferred levels for long potting, cue-ball control, safety, pressure, break-building, rest play, and tactical play.

### Added

- Skill inference engine using calibrated targets, routine difficulty, volatility, target-health signals, transfer-weighted evidence, and consistency.
- Per-domain skill levels from L1 to L7 with evidence counts, confidence labels, and score bands.
- Skill radar visualization inside the advanced insights flow.
- Weakest-link detection, including bottleneck messages such as cue-ball transition instability suppressing break-building progression.
- Recommendation integration: routines now receive a skill-level fit score and reason, allowing advice such as “train recovery angles to unlock higher break-building consistency” instead of generic break-building prompts.
- AI coaching export now includes `inferredSkillLevelProfile` and `weakestLinkProfile`.

### Preserved from v5.6.10

- Routine similarity graph.
- Latent routine difficulty estimates.
- Cross-user calibration descriptors for future support.
- Dynamic target generation.
- Automated routine balancing.

### Technical notes

- Cache, service worker, app shell, schema, and version markers updated to `5.6.11-inferred-skill-level-system`.
- The new layer is additive and does not change the IndexedDB/localStorage storage model.
- Existing target calibration, transfer-aware coaching, routine intelligence, and recommendation learning logic remain intact.
