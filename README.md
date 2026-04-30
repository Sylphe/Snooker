# Snooker Practice Log — PWA

A small installable Android-compatible web app for logging snooker practice routines.

## Features

Version 2 additions:

- More snooker-specific app icon
- Free training mode: choose any routine, log it, continue with another routine or end training
- Progression graph by routine/date in the stats screen


- Save/load custom routine templates
- Build daily training plans from saved routines
- Practice screen with timer
- Score entry and automatic move to next routine
- Standardized scoring types:
  - Raw score
  - Success rate
  - Highest break
  - Points system
  - Score per minute
- Performance dashboard by routine
- Moving average / trend signal
- CSV export for Excel / Power BI
- JSON backup import/export
- Offline support after first load

## How to use locally

Open `index.html` in a browser.

For full PWA install behavior, host the folder with any static hosting service, e.g. GitHub Pages, Netlify, or Vercel.

## Android installation

1. Open the hosted link in Chrome on Android.
2. Tap the menu button.
3. Tap "Add to Home screen" or "Install app".
4. Launch it like a normal app.

## Data storage

The app stores data in browser localStorage. Export JSON backups regularly if you care about preserving history.
