# Snooker Practice PWA v5.1.1

## v5.1.1 — Theme Control Consistency Fix

Built from the v5.0.3 mobile navigation redesign branch. This release intentionally postpones the Practice command-center tile redesign and focuses on low-risk visual cleanup across the existing UI.

### Included
- Reduced nested-card border fatigue with softer grouped surfaces.
- Calmer card hierarchy using subtle background surfaces and lighter shadows.
- Simplified routine cards with one-line metadata instead of multiple visible badges.
- Preserved only high-signal routine badges such as Anchor or inactive recommendation status.
- Added more whitespace and cleaner mobile routine-card stacking.
- No analytics, storage, hydration, recommendation, or session-schema changes.

### Build
- Version: v5.1.1
- Build timestamp: 2026-05-19 08:20 CEST
- Source base: v5.0.3 mobile navigation redesign part 3

### Validation
- JavaScript syntax checks passed.
- Duplicate declaration checks passed.
- Zip integrity check passed.

### v5.1.1 patch
- Normalized dark-mode styling for tab buttons, sub-navigation buttons, forms, selects, file buttons, action controls, and chip controls.
- Prevented browser-default white backgrounds from leaking into dark/contrast modes.
- No analytics, storage, hydration, or session logic changes.
