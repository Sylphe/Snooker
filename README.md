# Snooker Practice Log

Version: 5.7.75G.1-semantic-chip-bootstrap-fix

## v5.7.75G.1 — Semantic Chip Bootstrap Fix

This release adds a semantic chip layer to the Routine Management Console while preserving the Contextual Validation Dock and Quick Edit Mode.

### Included

- semantic chips for archetype, preset, benchmark, recovery, pressure, transfer, validation and ETU source;
- chip rendering in the spreadsheet grid for read-only semantic fields;
- chip-styled select controls for editable semantic fields;
- selected-routine semantic chip rail below the contextual validation/derived metadata summary;
- derived metadata chips for recovery, confidence risk, cognitive load, benchmark density and transfer intensity;
- validation severity chips in the contextual validation dock;
- build identity, version module, cache keys and visible app panel updated to v5.7.75G.1.

No compilation is required. Deploy the static files to GitHub Pages as before.


## Bootstrap fix
- Fixed ES module parse failure from nullish-coalescing/operator precedence in semantic chip validity chips.
- Fixed malformed newline/tab literals in the spreadsheet paste handler.
