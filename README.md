# Snooker Practice Log — v3.18.3

Built from v3.18.2.

## New backup features

Backup Pack ZIP:
- One-click export of a ZIP file containing:
  - json-backup.json
  - debug-info.json
  - raw-local-data.json

Backup reminder:
- Reminder now triggers after:
  - 7 days since last backup, or
  - 10 new logs since last backup
- Reminder button exports the Backup Pack ZIP directly.

Why:
- A browser/PWA generally cannot silently create a phone folder and auto-save files.
- The backup pack is the safest practical approach on Android.

Confirm version:
The header should show v3.18.3.
