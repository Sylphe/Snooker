# Snooker Practice PWA v4.37.0

## v4.37.0 — Hierarchical Bayesian Skill/Drill Priors

Built from the confirmed working v4.36.1 package. This release upgrades success-rate Bayesian estimates so low-sample drills can inherit information from related skill families instead of starting from a fixed generic baseline.

### Included

- Hierarchical Bayesian prior layer for success-rate routines
- Skill-family prior based on the routine primary skill
- Global user success-rate fallback prior when skill-family evidence is insufficient
- Drill-level posterior still uses the routine's own attempts and successes
- Recommendation reasons now mention the personalized prior source
- True Skill panels now show the prior source
- Personalized priors insight card added
- Smooth evidence weighting from v4.36.1 preserved
- No storage, hydration, or session persistence changes

### Safety notes

- Guarded execution only; no top-level prior calculations during bootstrap
- Falls back to the generic Beta(2,2) prior when related evidence is insufficient
- Existing logs are not rewritten
- Historical skill tags are used when available; routine skill maps are used as fallback

### Build

- Version: v4.37.0
- Build timestamp: 2026-05-18 15:18 CEST
- Cache/module refs: v4.37.0
