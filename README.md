# Snooker Practice PWA — v5.6.13.1 Insights Restoration Fix

Built from the working v5.6.12 dynamic routine difficulty package.

## Fixed in v5.6.13.1
- Restored the Stats > Insights page by making the Phase 1 / intelligence insight renderer fault-tolerant.
- One failed advanced card can no longer blank the full insights panel.
- Corrected mislabeled Dynamic Routine Difficulty and Inferred Skill cards.

## Added in v5.6.13.1

- Session Architecture Engine with warm-up, peak, and cooldown energy curves.
- Fatigue sequencing to reduce consecutive high-focus drills and avoid overloading precision systems.
- Transfer sequencing logic, including patterns such as long potting → cue-ball transition → break-building.
- Smart block generation for 60-minute, 90-minute, and 3-hour practice structures.
- Session architecture summary in the Smart Session Builder: phase time, total load, and overload warnings.
- Routine-row explanations now include phase load and high-focus flags.

## Validation

- JavaScript syntax check passed.
- JSON files parsed successfully.
- Package generated as v5.6.13.1 insights restoration fix.
