# Snooker Practice PWA v4.37.1

## v4.37.1 — Hierarchical Bayesian Skill/Drill Priors Safe

Built from the confirmed working v4.36.1 package. This release adds hierarchical Bayesian priors for success-rate routines while keeping the implementation bootstrap-safe and narrowly scoped.

### Included
- Skill-family prior from primary skill history
- Global user success-rate fallback prior
- Generic Beta(2,2) fallback where evidence is insufficient
- Prior source shown in True Skill validation panels
- Smooth evidence weighting from v4.36.1 preserved
- No storage, hydration, IndexedDB, or session-flow changes

### Safety checks
- Rebuilt from v4.36.1 rather than the failed v4.37.0 output
- No duplicated app-core bottom block
- `let adaptivePlanDraft = []` appears once
- `renderRecommendationDiagnostics()` appears only in app-core.js
- JS syntax checks pass across app and module files

### Build
- Version: v4.37.1
- Build timestamp: 2026-05-18 15:32 CEST
- Cache/module refs: v4.37.1
