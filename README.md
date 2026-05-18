# Snooker Practice PWA v4.42.0

## v4.42.0 — Adaptive Session Periodization

Built from v4.41.0 Skill Decay & Maintenance Scheduler.

### Added
- Adaptive Session Periodization v1.
- Week-level balance across acquisition, consolidation, pressure, recovery, and maintenance.
- Detects underweighted weekly training blocks from recent logged exposure.
- Adds a weekly theme / next-session bias.
- Adds periodization-aware recommendation reasons and ranking adjustments.
- Adds an Adaptive Periodization insight card.

### Guardrails
- No storage schema changes.
- No hydration or session-flow changes.
- No historical score rewriting.
- Periodization calculations are guarded and fallback-safe.

### Build
- Version: v4.42.0
- Build timestamp: 2026-05-18 17:38 CEST
- Cache/module refs: v4.42.0
