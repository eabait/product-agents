# AI SDK Integration TODO

Track the work to evolve the orchestrator to an AI SDK–driven tool loop (OpenRouter provider, skills/subagents as tools, simplified progress UI).

Docs: https://ai-sdk.dev/llms.txt

## Tasks

- [x] Provider: add OpenRouter provider factory via AI SDK transport using existing runtime config.
- [x] Tool adapters: expose PRD skills and subagents as AI SDK tools (shared registry).
- [x] Orchestrator loop: replace deterministic plan exec with AI SDK loop that calls tools until completion, preserving progress events.
- [x] Verification: keep current verifier as post-loop check; propagate artifacts via WorkspaceDAO.
- [x] Frontend/API: ensure SSE progress payloads stay compatible; simplify IndicatorProgress for non-PRD artifacts (persona, etc.) and validate rendering.
- [x] Testing: lint + targeted e2e covering PRD run and persona-only run with filtered indicator.

## Notes

- Keep OpenRouter (no AI Gateway); no feature flags.
- Intent resolver still gates which tools are exposed per artifact kind.
