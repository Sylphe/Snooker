# Snooker Practice Log — v3.1 final

This is the corrected v3 package.

## Confirm you installed the right version

After deploying, the header should say:

`v3.1 — folders, free sessions, daily view, date stats, randomizer, reliable timer.`

If you do not see this text, GitHub Pages or your phone is still serving the old cached version.

## Included changes

- Fixed timer logic using timestamp-based timing.
- New snooker-specific SVG icon.
- Free training mode:
  - choose any exercise
  - save it
  - choose another exercise or end training
- Today view:
  - number of exercises done today
  - exercise types
  - total training time
  - session-by-session breakdown
- Stats:
  - date view for all exercises done on a selected day
  - routine progression view
  - progression chart by date/score
- Exercise database:
  - edit existing exercises
  - duplicate exercises
  - delete exercises
  - folders and subfolders
  - existing category or create new category
  - filter by type/folder/search
- Daily plans:
  - filter exercise picker by type/folder
  - randomizer that selects X exercises
  - replace or append random exercises
- Data:
  - CSV export
  - JSON backup/export/import

## Deployment

Replace the files in the root of the GitHub repository with these files:

- index.html
- styles.css
- app.js
- manifest.json
- service-worker.js
- icon.svg
- README.md

Then commit and push.

## Cache warning

If the old version still appears:

1. Go to `https://Sylphe.github.io/Snooker/index.html?v=3.1`
2. Refresh several times.
3. Remove the old installed app from Android home screen.
4. Clear Chrome site data for the GitHub Pages URL if needed.
5. Add to home screen again.

Existing data should migrate automatically from v1/v2 localStorage if the URL/domain is unchanged.
