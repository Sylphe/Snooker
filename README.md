# Snooker Practice PWA — v5.7.62 Smart Builder ETU wiring fix

Build: 2026-05-25 18:05 CEST

## What changed

- Fixed the Smart Builder ETU context so it reads calibrated ETU rows from the Predictions ETU engine instead of relying on missing legacy fields.
- Corrected recent ETU, latest-session ETU, acute/baseline ratio and undertrained-domain display in Smart Builder rationale.
- Fixed the static top-bar build label in `index.html`, which was still showing v5.7.59 despite newer module/cache versions.
- Preserved v5.7.60 domain ETU ledger and v5.7.61 Smart Builder ETU scoring adjustments.

## Technical notes

- No storage schema changes.
- No log migration required.
- Build/cache/module query strings updated to v5.7.62.
- Service-worker cache renamed to `5.7.62-smart-builder-etu-wiring-fix`.
