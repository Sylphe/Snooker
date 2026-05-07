# Snooker Practice Log — v4.19.0

## Predictor contribution model

Adds a transparent Lasso-style scoring proxy.

The model explains which signals push a routine up or down in recommendation priority:
- target hit rate,
- Bayesian confidence,
- plateau / fatigue state,
- category allocation balance,
- recency,
- recent session rating / fatigue proxy.

This is intentionally not a black-box model. It is a contribution model designed to make recommendations explainable before any heavier optimization layer is introduced.

## Testing checklist

1. Open Stats.
2. Open Bayesian analytics validation.
3. Confirm Predictor contribution model appears.
4. Check that each card shows driver rows and contribution values.
5. Confirm normal tabs, routines, and storage still work.
