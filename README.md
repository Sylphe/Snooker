# Snooker Practice PWA v5.5.19

## v5.5.19 — Defaults / Forecast Hardening

This release keeps the v5.5.14 security baseline and adds targeted performance improvements: routine log grouping, capped heavy analytics windows, capped history-table rendering, and debounced filter inputs.

Built from the working v5.4.2 insight language pass.

Included:
- Friendly / Analytical wording applied to Smart Session Builder terminology.
- Cognitive load, fatigue load, confidence risk, and switching labels now adapt to the selected Insight Language.
- Session block names now use coaching language in Friendly mode while preserving analytical names in Analytical mode.
- Recommendation mode and feedback tracking copy simplified in Friendly mode.
- No analytics, storage, hydration, or session schema changes.

## v5.4.2 — Friendly / Analytical Recommendation Copy

Built from the working v5.4.2 UI language foundation.

### Changes
- Recommendation explanations now adapt to Insight Language mode.
- Friendly mode uses action-first coaching copy for recommendation reasons.
- Analytical mode preserves technical recommendation terminology.
- Smart recommendation panel now translates mode, evidence, volatility, transfer, and learning labels.
- Recommendation logic panel now uses coaching phrasing in Friendly mode.
- Coaching insight cards use simpler action-oriented wording in Friendly mode.
- Technical model terminology remains available in Analytical mode.

### Integrity
- Version: v5.5.19
- Build timestamp: 2026-05-19 12:22 CEST
- No analytics engine changes.
- No storage schema changes.
- No hydration/session changes.
- JS syntax checks passed.
- Duplicate declaration checks passed.
- Zip integrity checked.


## v5.4.2 — Insight Cards & Stats Language Pass
Build: 2026-05-19 12:22 CEST

- Applies Friendly / Analytical wording to insight cards and stats module titles.
- Converts evidence terminology into coaching-style signal badges in Friendly mode.
- Simplifies empty-state and warning copy.
- Preserves technical wording in Analytical mode.
- No analytics, storage, hydration, or session schema changes.


## v5.5.19 — Security Baseline

This release reorganizes the Stats tab into a progressive workflow: Core, Advanced, and Research. It adds scope chips, a section-purpose header, collapsible advanced filters, collapsed diagnostics in the overview, and mobile-first stats grouping to reduce analytics overload while preserving the full analytical stack.


### v5.5.19 maintenance correction
- Removed the redundant Core / Advanced / Research explanatory strip below the Stats navigation. The Stats tab now has one navigation hierarchy only, followed by active scope chips, filters, and the selected analytics content.

### v5.5.19 storage/runtime hardening
- Fixed cross-tab storage sync ping-pong risk by making storage-event hydration read-only.
- Added service-worker version guard and dynamic cache versioning.
- Closed active IndexedDB handles before database deletion/recovery.
- Added backup import file size/type guard before reading into memory.
- Added storage exhaustion read-only/export fallback to avoid bootstrap save loops.