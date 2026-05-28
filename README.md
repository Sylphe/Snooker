# Snooker Practice PWA

Version: 5.7.75F-knowledge-graph-integrity-engine
Build: 2026-05-28 16:45 CEST

## v5.7.75F

This release adds the Knowledge Graph Integrity Engine to the Routine Management Console.

### Included

- Knowledge Graph Integrity Engine.
- Graph-level checks for transfer and dependency cycles.
- Orphan routine detection.
- Weak dependency support detection.
- Benchmark ladder gap detection.
- Semantic contradiction checks, including interference versus prerequisite conflicts and recovery versus pressure conflicts.
- Portfolio-level integrity score and graph metrics.
- Routine Console dashboard panel for knowledge-graph findings and suggested fixes.
- Existing Semantic Completeness Scoring v2 retained.
- Mobile Routine Studio and desktop Routine Console compatibility retained.
- Build number, visible panel, cache and version module updated to v5.7.75F.

### Validation

- `node --check` passed for `modules/app-core.js` and `app.js`.
- Zip integrity test passed.
