# Snooker Practice Log — v4.22.0

## Pressure Coach UX Layer

Adds discoverability and interpretation for the pressure simulator.

Implemented:
- Pressure help button and bottom-sheet guide.
- Recommended pressure presets:
  - Consistency Builder
  - Match Pressure
  - Clutch Finishing
  - Recovery Stability
  - Confidence Rebuild
  - Tournament Prep
- Inline pressure mode explanation.
- Preset summary guidance.
- Contextual live metric guidance.
- Explanation of sudden death, final rep weighting, escalation step, clutch rate, and fatigue risk.

Design goal:
- keep one-tap pressure logging low friction,
- make the settings understandable,
- avoid adding more data-entry burden.

Preserved:
- v4.21 pressure escalation features,
- v4.20 pressure foundation,
- v4.19 predictor contribution model,
- storage/render stability path.

Testing checklist:
1. Open Pressure simulation.
2. Tap the ? helper button.
3. Test each preset and confirm settings update.
4. Start pressure drill and confirm metric guidance updates.
5. Finish & Save a pressure log.
6. Confirm tabs, routines, and Data storage dashboard still work.
