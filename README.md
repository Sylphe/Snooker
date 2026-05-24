# Snooker Practice PWA v5.7.38

## v5.7.38 — Sticky Stats scope bar

This release implements Phase 2 of the Stats UX cleanup while keeping Graphs inside the Stats tab rather than adding Graphs to the main app navigation.

Changes:
- Added a sticky, collapsible Analytics Scope bar inside Stats.
- Consolidated shared filters for Stats view, reference date, exercise, and detail level.
- Kept Graphs as a Stats sub-section with Overview / Insights / Trends / Graphs / Routines / Pressure / Research navigation unchanged.
- Removed the repeated active-scope banner from Stats output because the scope is now always visible in the control bar.
- Reduced filter copy and vertical weight for mobile use.
- Preserved all existing stats, graph, research, and recommendation logic.

All build labels, module cache-busting references, service-worker cache version, and README metadata updated to v5.7.38.
