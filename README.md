# Snooker Practice PWA

Version: 5.7.75A-visual-transfer-graph-editor

## v5.7.75A

This build adds the Visual Transfer Graph Editor to both the mobile Routine Studio workflow and the full-screen desktop Routine Console. Transfer metadata can now be edited as typed graph edges instead of only comma-separated transfer tags.

Included:

- Visual Transfer Graph Editor in the routine side panel
- Direct, supporting, weak and interference edge types
- Edge weights stored in `transferProfile.edgeWeights`
- Backward compatibility with existing `transferTags` fields
- Transfer graph summary column in the spreadsheet grid
- Add/remove edge actions available in mobile and desktop console modes
- Build identity panel, version module, cache keys and README updated to v5.7.75A

Build: 2026-05-28 14:57 CEST

Previous README content preserved below for historical context.

---

# Snooker Practice PWA

Version: 5.7.75A-routine-archetype-framework

## v5.7.75A

Adds the Routine Archetype Framework to the Routine Management Console. Archetypes classify routines as acquisition, stabilization, pressure, benchmark, recovery, transfer or diagnostic work, then inherit coherent defaults for ETU subtype weights, benchmark semantics, volatility, recovery suitability and pressure suitability. The framework is exposed in both the mobile-safe Routine Studio and the full-screen desktop Routine Console.

### Included

- Shared routine archetype engine
- Archetype controls in mobile Routine Studio and desktop console
- Apply and infer archetype workflows for selected routines
- Archetype columns in the spreadsheet grid
- Archetype support in the side-panel routine editor
- Fill mode to complete missing/auto semantic fields without overwriting curated values
- Overwrite mode for deliberate semantic refresh
- Metadata provenance and confidence tracking for archetype inheritance
- Existing semantic presets and derived metadata preserved
- Build identity panel, version module, cache keys and README updated to v5.7.75A

### Base

Built from v5.7.74F derived metadata engine.
