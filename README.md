# Snooker Practice Log — v3.19.3

Built from v3.19.2.

## Critical startup fix

v3.19.2 accidentally introduced a recursive UUID fallback:

```js
if (crypto && crypto.randomUUID) return uuid();
```

That could break startup before tabs and routine selectors became usable.

v3.19.3 fixes it to:

```js
return crypto.randomUUID();
```

Also updated:
- app version markers
- service worker cache version
- startup localStorage save now uses safeStorageSet

Confirm version:
The header should show v3.19.3.
