# Snooker Practice PWA

Version: 5.7.75C-semantic-completeness-scoring-v2
Build: 2026-05-28 16:10 CEST

## v5.7.75C

Adds Semantic Completeness Scoring v2 to the Routine Console. This release separates classic schema completeness from semantic readiness, with distinct governance scores for taxonomy, ETU quality, benchmark quality, transfer/dependency quality, metadata confidence and provenance.

### Included

- Portfolio-level Semantic Completeness dashboard in Routine Studio / Desktop Console.
- Per-routine semantic completeness score in the spreadsheet grid.
- Component scores for taxonomy, ETU, benchmark, transfer/dependency, confidence and provenance.
- Selected-routine editor now shows a semantic completeness diagnostic box.
- Validation view extended with semantic readiness columns.
- README, cache, version module and visible build panel updated to v5.7.75C.

---

# Snooker Practice PWA

Version: 5.7.75B-dependency-chain-engine

## v5.7.75B

Adds the Dependency Chain Engine and changes the Routine Console layout so the selected routine editor renders below the routine grid in both mobile and desktop contexts, rather than in a narrow right-side inspector. Dependency metadata models prerequisites, downstream/enabled skills, blocked-by constraints, progression lane and chain strength. The feature is available in the mobile Routine Studio and full-screen desktop Routine Console.

### Included

- Dependency Chain Engine for routine metadata.
- Prerequisite / enables / blocked-by links.
- Progression lane and chain strength fields.
- Dependency summary column in the spreadsheet grid.
- Full-width routine editor below the routine list/grid.
- Mobile and desktop editor support.
- Build identity panel, version module, cache keys and README updated to v5.7.75B.

---

# Snooker Practice PWA

Version: 5.7.75A.1-desktop-layout-optimization
Build: 2026-05-28 15:28 CEST

## v5.7.75A.1

Desktop Routine Console layout optimization patch.

- Preserves Visual Transfer Graph Editor functionality in both mobile and desktop contexts.
- Improves full-screen desktop Routine Console viewport usage.
- Enlarges the desktop inspector panel and prevents transfer graph controls from bunching on the right edge.
- Increases spreadsheet workspace height and tightens top governance controls.
- Updates build identity panel, cache keys, version module and README.

---

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
