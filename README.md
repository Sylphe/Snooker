# Snooker Practice PWA v4.22.3 — Stats render recovery fix

This release fixes a runtime regression in the Stats Overview renderer that could leave the Stats tab blank after switching internal stats tabs or refreshing.

## Fixes
- Fixed Overview rendering crash caused by drill-scope logic referencing an undefined `rid` inside the coaching engine.
- Added defensive Stats render recovery so a broken stored Stats state cannot blank the page.
- Re-applies active Stats tab visuals after rendering.
- Normalized version/cache markers to v4.22.3.
