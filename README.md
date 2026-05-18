# Snooker Practice PWA v4.26.0

Build timestamp: 2026-05-18 08:00 GMT+1

## Release focus

v4.26.0 adds the Reflection & Skill Map Foundation. The objective is to create the semantic layer required for better recommendations: routines are now mapped to underlying skills, reflections capture structured subjective signals, and recommendation reasons can reference skill focus and transfer value instead of remaining purely drill-centric.

## Added

- Reflection intelligence: post-session reflection now supports structured 1–5 ratings for focus, confidence, fatigue, cueing quality, and mental sharpness.
- Performance/reflection divergence detection: the analytics layer can classify good-score/bad-feel and bad-score/good-feel sessions.
- Fatigue and confidence signals: high fatigue and low confidence are converted into lightweight contextual signals for recommendation logic.
- Skill taxonomy: canonical technical, break-building, safety/tactical, mental, and physical skill tags are now available.
- Routine skill mapping: each routine has a primary skill, secondary skill tags, and transfer tags.
- Auto-suggested skill maps: existing routines are mapped from name, folder, category, subfolder, and description during migration.
- Manual override: advanced exercise editing now exposes primary skill, secondary tags, and transfer tags.
- Skill-aware recommendation reasons: recommendation output can now explain the underlying skill focus and transfer logic.
- Skill-map insight card: stats insights can show the current practice mix by primary skill.

## Updated

- App version and cache-busting references updated to v4.26.0.
- Build metadata updated in `modules/version.js` and the home screen.
- Service worker cache name updated for the new release.

## Notes

This release is an infrastructure release. It intentionally keeps the UI light while establishing the data model for v4.27 Smart Session Builder v2, v4.28 context-aware recommendations, and v4.29 transfer modelling.
