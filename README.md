# Snooker Practice Log — v3.11.1 final

Built from v3.11.

## Fix

v3.11 had a startup error caused by calling the reference-refresh logic before the global app data object was initialized. This stopped JavaScript execution, which meant tabs and buttons did not respond.

v3.11.1 fixes that initialization order.

## Keeps v3.11 features

- Current exercise names resolve dynamically through routineId
- Current daily plan names resolve dynamically through planId
- Snapshot fallback if exercise/plan is deleted
- CSV export includes current and snapshot names
- Existing logs are refreshed safely after data loads

Confirm version:
The header should show v3.11.1.
