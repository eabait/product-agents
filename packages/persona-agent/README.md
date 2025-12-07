# @product-agents/persona-agent

LLM-backed persona synthesis package that plugs into the product-agent orchestrator. It exposes a `PersonaAgentRunner` for prompt construction + validation as well as the `createPersonaAgentSubagent` lifecycle that planners register.

## Capabilities

- Builds prompts from PRD context, freeform briefs, and optional supplemental notes.
- Calls OpenRouter models via the shared client and normalizes responses into `PersonaProfile` objects.
- Falls back to the deterministic heuristic personas whenever the LLM fails or when heuristics are explicitly forced.
- Emits telemetry (latency, sanitized prompt/response previews, strategy, and usage) inside the returned artifact metadata so thin APIs/frontends can chart persona performance.

## Configuration

| Setting | Description |
| --- | --- |
| `runtime.defaultModel`, `runtime.defaultTemperature`, `runtime.maxOutputTokens` | Pulled from the global product-agent config and passed to the runner. |

Every persona artifact stores its source metadata plus the runner strategy, usage, and telemetry snapshot under `artifact.metadata.extras`. Downstream consumers (API, frontend) can read `summary.subagents[i].metadata.telemetry` to display latency or flag fallback events.

## Testing

The package ships with `node:test` coverage for:

- Prompt construction (`buildPersonaPrompt`).
- Runner behaviour, including telemetry capture, schema normalization, and the heuristic fallback path.

Run them via:

```bash
npm run test --workspace packages/persona-agent/agent
```

## Integration

The persona subagent registers itself with `personaAgentManifest`. Servers should ensure the manifest is present in the `SubagentRegistry` so planners can schedule personas after a PRD completes. Frontends can hit `/api/subagents/persona` to invoke the runner directly with arbitrary briefs.
