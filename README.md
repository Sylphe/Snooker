# Snooker Practice Log — v4.15.0

Built from the confirmed working v4.14.2 recovery line.

## Current release: v4.15.0

Bayesian recommendation action policy for success-rate drills.

## v4.15.0 changes

- Added explicit Bayesian coaching actions:
  - Repeat drill when uncertainty is high.
  - Increase difficulty when posterior ability is confidently above target.
  - Keep target when the credible interval overlaps target.
  - Deload / rebuild when the credible interval is below target.
- Bayesian validation cards now show the recommended action, instruction, and coaching note.
- Smart Recommendation now displays the Bayesian action policy when the selected routine is a success-rate drill.
- Recommendation priority reasons now include the Bayesian action label.
- Preserved v4.14.2 recovery fixes and v4.7.3 storage safety.

## Stability checkpoints

- `saveCoreData()` and `serializeCoreData()` are present.
- IndexedDB logs/sessions storage remains active.
- `renderToday()` and `renderStats()` remain in `app-core.js`.
- `render.js` remains limited to the validated low-risk Phase 1 extraction.
- Service worker cache marker is `snooker-practice-log-v4-15-0-final`.

## Testing checklist

1. Open the app and confirm tabs switch normally.
2. Confirm routines/exercises populate.
3. Check Data → storage dashboard.
4. Open Stats → Bayesian analytics validation.
5. Select a success-rate drill and confirm one of Repeat / Progress / Hold / Rebuild appears.
6. Confirm Smart Recommendation displays Bayesian action when applicable.
7. Export a full backup.
