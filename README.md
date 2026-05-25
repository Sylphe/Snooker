# Snooker Practice PWA — v5.7.63 Session-end review dashboard

Built from v5.7.62.

## Changes
- Added additive Session-End Review Dashboard after the existing post-session reflection/evaluation flow.
- Existing post-session evaluation remains first and unchanged.
- Session review snapshot persists on the session record without changing historical log requirements.
- Today view can reopen each completed session review.
- Predictions tab includes a Last Session Impact module.
- Review summarizes ETU, hit rate, main focus, positive signal, main constraint, readiness impact, and next-session guidance.
- Updated build/cache/module query strings to v5.7.63.

## Compatibility
No required schema migration. Existing logs and sessions remain valid; review snapshots are generated lazily for older sessions when viewed.
