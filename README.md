# Snooker Practice PWA v4.41.0

## v4.41.0 — Skill Decay & Maintenance Scheduler

Built from v4.40.0 Bayesian Change-Point Detection.

### Added
- Skill Decay & Maintenance Scheduler v1.
- Detects undertrained skills using recent exposure by canonical skill tag.
- Detects fading skills using recent-vs-prior skill performance movement.
- Adds maintenance need scores with evidence weighting.
- Adds suggested maintenance blocks based on routine skill coverage.
- Adds maintenance-aware recommendation reasons and scoring.
- Adds a Maintenance Scheduler insight card.

### Guardrails
- No storage schema changes.
- No hydration or session-flow changes.
- No historical score rewriting.
- All maintenance calculations are guarded and fallback-safe.

### Build
- Version: v4.41.0
- Build timestamp: 2026-05-18 17:24 CEST
- Cache/module refs: v4.41.0
