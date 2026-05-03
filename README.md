# Snooker Practice Log — v3.20

Built from v3.19.3.

## New in v3.20

Training periodization:
- Adds training phase to the Adaptive Training Engine:
  - Auto
  - Skill acquisition
  - Stabilization
  - Performance / competition prep
  - Deload / recovery
- Adds phase horizon and optional competition date.
- Periodization modifies the adaptive session goal and duration logic.

Regret / Counterfactual Engine:
- Compares a chosen routine against an alternative routine.
- Estimates expected score from recent history, PSI, and drift.
- Outputs a simple regret estimate and interpretation.

New helpers:
- Adaptive Engine: Session goal
- Adaptive Engine: Strictness
- Periodization phase
- Regret engine
- Training Orchestrator: Intensity
- Training Orchestrator: Training strategy
- Training Orchestrator: Focus override

Confirm version:
The header should show v3.20.
