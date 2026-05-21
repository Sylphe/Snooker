# Snooker Practice PWA v5.6.15

## v5.6.15 — Probabilistic Coaching Layer

Built from the stable v5.6.14 Match Simulation Layer release. This release is additive and does not modify startup, IndexedDB hydration, tab loading, or core storage behavior.

### Added

- Probabilistic Coaching Layer card in Insights.
- 70% confidence ranges for routine-level true performance.
- Skill-level uncertainty bands layered on the inferred skill system.
- Plateau / breakthrough / regression / variance separation.
- Guarded recommendation language so random spikes are not treated as confirmed improvement.
- AI coaching export schema support for probabilistic coaching outputs.

### Preserved

- Existing Stats hierarchy.
- Existing Skill Radar and inferred skill-level system.
- Dynamic Routine Difficulty Model.
- Session Architecture Engine.
- Match Simulation Layer.
- IndexedDB schema and persistence behavior.

### Notes

The probabilistic layer is deliberately conservative. It uses shrinkage and evidence weighting so low-sample routines show directional ranges without over-driving target changes.
