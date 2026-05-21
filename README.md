# Snooker Practice PWA v5.6.16

## v5.6.16 — Cross-Routine Skill Graph

Built from the working v5.6.15 probabilistic coaching layer.

Adds a latent cross-routine skill dependency layer:

- skill dependency graph across mapped skill domains;
- lagged dependency signals over 7, 14, 21, and 28 day windows;
- bottleneck analysis for upstream skills limiting downstream progression;
- bridge routine generation for connected skill pairs;
- AI coaching export support for dependency graph and bottleneck profiles.

The release is additive: it does not modify startup, storage hydration, tab routing, or logging flows.
