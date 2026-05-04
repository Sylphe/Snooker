# Snooker Practice Log — v3.25.8

Built from the uploaded working set and patched directly.

## Fixed

- Interface settings are now present in the Data tab.
- Theme selection persists in `localStorage` and in `data.interfaceSettings`.
- Theme is applied to both `html` and `body` using `data-theme` and `data-theme-mode`.
- Dark and high-contrast styling covers cards, nested boxes, phase cards, diagnostic/second-order analytics, SVG charts, modals, badges, tables, and post-session reflection.
- Focus Mode button can enter and exit the current active session reliably.
- Session completion clears focus mode to avoid blank screens.
- Success-rate drills support score chips and optional one-tap quick-log macros.

## Deployment note

After uploading to GitHub, hard refresh once or clear the installed PWA cache if the old service worker is still serving cached files.
