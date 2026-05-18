# Snooker Practice PWA v4.26.3

Build timestamp: 2026-05-18 09:35 CEST

## Release focus

v4.26.3 refines the Reflection & Skill Map Foundation. The objective is to create the semantic layer required for better recommendations: routines are now mapped to underlying skills, reflections capture structured subjective signals, and recommendation reasons can reference skill focus and transfer value instead of remaining purely drill-centric.

## Added

- Historical log skill sync: when an existing exercise is edited and skill tags are selected or changed, all past logs for that exercise receive the current canonical primary, secondary, and transfer tags, so skill analytics update immediately without re-logging old sessions.
- Reflection intelligence: post-session reflection now supports touch-only 1–5 rating tiles for focus, confidence, fatigue, cueing quality, and mental sharpness.
- Performance/reflection divergence detection: the analytics layer can classify good-score/bad-feel and bad-score/good-feel sessions.
- Fatigue and confidence signals: high fatigue and low confidence are converted into lightweight contextual signals for recommendation logic.
- Skill taxonomy: canonical technical, break-building, safety/tactical, mental, and physical skill tags are now available.
- Routine skill mapping: each routine has a primary skill, secondary skill tags, and transfer tags.
- Auto-suggested skill maps: existing routines are mapped from name, folder, category, subfolder, and description during migration.
- Manual override: advanced exercise editing now exposes primary skill plus controlled secondary and transfer tag selectors.
- Canonical skill tag chips: secondary and transfer tags now use selectable chips backed by normalized skill IDs instead of free-text entry.
- Duplicate-tag protection: common aliases such as cue ball speed / cueball speed / cue-ball speed normalize to the same internal ID.
- Skill-aware recommendation reasons: recommendation output can now explain the underlying skill focus and transfer logic.
- Skill-map insight card: stats insights can show the current practice mix by primary skill.

## Updated

- Post-session reflection ratings changed from numeric input boxes to tappable 1–5 tiles, matching the Focus Mode session-quality UX.
- Exercise creator skill fields changed from manual free-text boxes to controlled multi-select chips for secondary and transfer tags.
- Build timestamps are now expressed in Europe/Paris local time with CET/CEST notation to avoid GMT-offset ambiguity.
- App version and cache-busting references updated to v4.26.3.
- Build metadata updated in `modules/version.js` and the home screen.
- Service worker cache name updated for the new release.

## Notes

This release is an infrastructure release. It intentionally keeps the UI light while establishing the data model for v4.27 Smart Session Builder v2, v4.28 context-aware recommendations, and v4.29 transfer modelling.
