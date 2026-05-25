# Snooker Practice PWA v5.7.52

## v5.7.52 — Prediction visualization safe rebuild

This release is built from the last stable v5.7.50 package and adds a lightweight visualization layer to the Stats → Predictions tab without changing storage, logs, schema, or hydration order.

### Changes

- Added a compact Prediction visual summary inside the Predictions tab.
- Added milestone probability bars for stable 30+, 50+, 70+, and century-capable profiles.
- Added a benchmark-readiness ladder for Junior, Club, Senior, and Pro thresholds.
- Added a domain progression map for inferred skill domains.
- Added a stable-vs-peak and sustainable-pace visual card.
- Kept the existing numeric forecast tables below the visual summary.
- Prediction visuals are wrapped in a safe renderer; failure of the visual layer cannot block storage, hydration, or the core Stats render.

### Technical notes

- No schema changes.
- No log migration changes.
- No IndexedDB or localStorage structure changes.
- No external charting library added.
- Updated build name, cache versions, module cache-busting references, index build label, service worker cache key, and README metadata to v5.7.52.
