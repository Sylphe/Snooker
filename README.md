# Snooker Practice Log — v3.9.1 final

Built from v3.9.

## Orchestrator upgrade

This version upgrades the Training Orchestrator from simple routine picking to a structured rule-based training engine.

## Added

Weighted selection logic:
- low target hit rate
- negative recent momentum
- undertrained category
- recency since last trained
- consistency / volatility

Block-based session design:
- Block 1: fresh-skill priority
- Block 2: weakness volume
- Block 3: pressure / transfer

Intensity modes:
- Technical
- Balanced
- Pressure

Focus override:
- force the orchestrator to bias toward a selected category

Difficulty calibration:
- >80% hit rate: increase difficulty
- <35% hit rate: simplify drill
- middle zone: repeat and stabilize

Load as draft plan:
- generated session can be transferred directly into the Plans tab

Confirm version:
The header should show v3.9.1.
