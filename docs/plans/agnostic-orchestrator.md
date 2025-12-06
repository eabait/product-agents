# Agnostic Orchestrator Plan

Goal: make the planner/controller intent-driven and artifact-agnostic (no hardcoded PRD assumptions), while keeping existing PRD flows working.

Assumptions
- We keep the intent classifier as the source of the artifact chain; if it cannot classify, we prompt for clarification instead of defaulting to PRD.
- Subagents declare `creates`, `consumes`, and whether they can start from `prompt`.
- PRD core skills stay, but are registered as one core builder among others.

Plan
[x] Intent defaults: remove hardcoded default artifact kind (`prd`) from `IntentResolver` and `IntelligentPlanner`. If classifier returns nothing, create a clarification-needed intent (status/metadata) rather than forcing PRD.
[x] Core builder registry: introduce an interface for “core segment builders” keyed by artifact kind (e.g., PRD core), injected into `IntelligentPlanner`. Core builders return plan segments or `null`.
[x] PRD core builder: wrap existing PRD segment construction (clarification/analyze/write sections/assemble) into a registry entry implementing the new interface.
[x] Planner routing: in `createPlan`, pick core builder only if the intent chain includes that artifact; otherwise skip core and start from the first transition source (`fromArtifact` or `prompt` if a subagent allows it).
[x] Transition seeds: update `resolveInitialArtifactKind` to use the first transition’s `fromArtifact` or `intent.targetArtifact`; fall back to `prompt` only when a subagent consumes it.
[x] Skill wiring: remove explicit `prd.*` skill IDs from planner metadata; derive required skills from the selected core builder. Keep skill sequence metadata builder-specific.
[x] Verification: add a verifier registry by artifact kind; GraphController chooses the verifier for the produced artifact (PRD verifier becomes one entry).
[x] Factories/wiring: update `createPlanner` and controller compositions to pass registries (core builders, verifiers). Keep backward-compatible defaults that install the PRD core and verifier.
[x] Tests: update planner tests for persona-only and story-map chains to ensure no PRD nodes are injected; keep existing PRD chain tests; add verifier selection tests.
[x] Docs: refresh the architecture note and sequence diagram to reflect artifact-agnostic orchestration and the new registries.
