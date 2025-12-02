# Persona Agent Refactor TODO

> Track progress as persona generation becomes an LLM-backed agent/skill.

- [x] **Contracts & Manifest**
  - [x] Add `PersonaAgentManifest` plus `createPersonaAgentSubagent()` export under `packages/persona-agent/agent/src`.
  - [x] Define shared request/response schema (context payload, optional source artifact, persona bundle output) so orchestrator + frontend speak the same contract.
- [x] **Prompt + Runner**
  - [x] Author an LLM prompt template that ingests arbitrary context (PRD sections, user notes) and asks for structured persona JSON.
  - [x] Implement `PersonaAgentRunner` that binds model settings, calls the LLM via `@product-agents/openrouter-client`, validates/normalizes output, and falls back to heuristics on failure.
- [x] **Orchestrator Wiring**
  - [x] Update `packages/prd-agent/src/compositions/prd-controller.ts` (and other server callers) to import the new persona agent package instead of the inline helper.
  - [x] Ensure `SubagentRegistry` can load/register the persona agent manifest so planners discover it automatically.
- [x] **API + Frontend**
  - [x] Extend `/api/subagents/persona` to forward richer context (PRD artifact, freeform brief, selected conversation snippets) to the LLM agent and handle validation errors.
  - [x] Build a persona-specific form/editor in the UI so users can provide/edit persona context instead of raw JSON output.
- [x] **Testing & Telemetry**
  - [x] Add unit tests for the prompt builder + runner (mock LLM responses) and expand integration tests to cover LLM personas end-to-end.
  - [x] Capture prompt/response metadata (sanitized) and latency metrics so persona agent performance is observable.
- [x] **Fallback & Docs**
  - [x] Keep the deterministic heuristic as a fallback path (flag or retry) during rollout.
  - [x] Document configuration knobs (model, temperature, context size) and the new input contract in `AGENT.md` + persona package README.
