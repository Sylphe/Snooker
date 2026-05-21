# Snooker Practice PWA v5.6.14

## v5.6.14 — Match Simulation Layer

Built from the stable v5.6.13 Session Architecture Engine release. This release is additive and preserves the existing Stats, Skill Radar, Dynamic Routine Difficulty, and Session Architecture rendering paths.

### Added

- Match Simulation Layer panel in Stats.
- Frame-like scenario mapping for:
  - frame-ball pot;
  - last red + colour;
  - safety exchange;
  - snooker escape;
  - colours clearance;
  - decider reset.
- Scenario readiness scoring.
- Pressure and tactical readiness indicators.
- Suggested short match-simulation block.
- Routine-to-scenario bridge drill recommendations.
- AI coaching export integration through `matchSimulationProfile`.

### Preserved

- Existing Stats hierarchy.
- Existing Skill Radar.
- Dynamic Routine Difficulty Model.
- Session Architecture Engine.
- IndexedDB schema and persistence behavior.

### Notes

The Match Simulation Layer does not simulate full frame outcomes yet. It maps existing routines into practical match scenarios so the app can decide whether a player is ready for frame-ball, safety-exchange, clearance, escape, or decider-style practice.
