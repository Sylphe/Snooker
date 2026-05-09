# Snooker Practice Log — v4.21.2

## Resume Session Hotfix

Built from v4.21.1 left/right hotfix.

Fixes:
- Resume Session now restores the persisted active session more robustly.
- Resume from either Practice tab or Today tab uses the same normalized session draft.
- Resume now switches back to the Practice tab automatically.
- Resume no longer overwrites saved timer/session state while restoring.
- Discard now refreshes both resume cards.
- Invalid stale session drafts are cleared safely.

Preserved:
- v4.21.1 Left / Right side split restoration.
- v4.21 pressure escalation features.
- v4.20 pressure foundation.
- IndexedDB/storage safety path.
- renderToday/renderStats rollback safety.

Testing checklist:
1. Start a plan or free training session.
2. Leave before finishing.
3. Reopen app.
4. Tap Resume Session from Practice.
5. Confirm the current exercise screen appears.
6. Repeat from Today tab.
7. Confirm timer/session state does not reset unexpectedly.
8. Confirm Left / Right drills still show left/right inputs.
