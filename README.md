# Snooker Practice PWA — v5.7.67.5.2 Audit Renderer Stabilization

## v5.7.67.5.2 changes

Corrective release on top of v5.7.67.5.1.

- Fixed the Smart Builder recommendation audit renderer so contribution bars render instead of falling back to the safe error message.
- Replaced the undefined audit clamp call with the existing app-safe `clampNumber` helper.
- Removed the production-facing "Audit render failed safely" message; invalid audit payloads now fail silently rather than polluting the coaching UI.
- Preserved the raw audit values inside the advanced details block.
- Preserved the recovery-template taxonomy fixes and ETU wording separation introduced in v5.7.67.5.1.
- Updated app header, build timestamp, module cache-busting refs, service worker cache name, and README.

No storage, log schema, or IndexedDB migration changes.
