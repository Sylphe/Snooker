# Snooker Practice Log — v3.2 final

Built from the working v3.1 package.

## New in v3.2

- Exercise folder selector:
  - select existing folder
  - or create a new folder
- Exercise subfolder selector:
  - select existing subfolder
  - or create a new subfolder
- Stats view selector:
  - daily
  - weekly
  - monthly
  - yearly
  - overall
  - per exercise
- Charts:
  - Stats tab: volume chart and exercise-mix chart
  - Stats per exercise: progression curve
  - Today tab: exercise-mix chart

## Confirm version after deployment

The app header should say:

`v3.2 — folder pickers, period stats, exercise views, and charts.`

If it does not, your phone or GitHub Pages is still serving the old cached app.

## Deployment

Replace these root files in GitHub:

- index.html
- styles.css
- app.js
- manifest.json
- service-worker.js
- icon.svg
- README.md

Then commit and push.

## Cache note

Open:

`https://Sylphe.github.io/Snooker/index.html?v=3.2`

Refresh. If needed, remove the Android installed app and reinstall from Chrome.

Existing records remain in localStorage and migrate automatically as long as the GitHub Pages URL is unchanged.
