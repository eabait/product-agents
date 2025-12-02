# @product-agents/product-agent

Deep agent orchestrator core for multi-artifact runs. It owns the graph controller, config plumbing, workspace DAO, and shared subagent contracts used by downstream packages such as `@product-agents/prd-agent`.

## Key modules
- `src/config/product-agent.config.ts` – strongly typed defaults + env parsing + API override schema.
- `src/controller/graph-controller.ts` – `Plan → Execute → Verify → Deliver` loop with progress event streaming.
- `src/workspace/filesystem-workspace-dao.ts` – filesystem-backed artifact storage.
- `src/subagents/*` – built-in persona/story-map subagents that slot into orchestrated runs.

## Configuration
```ts
import { loadProductAgentConfig } from '@product-agents/product-agent'
import { createPrdController } from '@product-agents/prd-agent'

const config = loadProductAgentConfig()
const controller = createPrdController({ config })
```

`loadProductAgentConfig()` reads defaults and merges env overrides:

| Scope | Environment variables |
| --- | --- |
| Runtime | `PRODUCT_AGENT_MODEL`, `PRODUCT_AGENT_TEMPERATURE`, `PRODUCT_AGENT_MAX_OUTPUT_TOKENS`, `PRODUCT_AGENT_ALLOW_STREAMING`, `PRODUCT_AGENT_FALLBACK_MODEL`, `PRODUCT_AGENT_RETRY_ATTEMPTS`, `PRODUCT_AGENT_RETRY_BACKOFF_MS` |
| Workspace | `PRODUCT_AGENT_WORKSPACE_ROOT`, `PRODUCT_AGENT_WORKSPACE_PERSIST`, `PRODUCT_AGENT_WORKSPACE_RETENTION_DAYS`, `PRODUCT_AGENT_WORKSPACE_TEMP_SUBDIR` |
| Skills | `PRODUCT_AGENT_SKILL_PACKS`, `PRODUCT_AGENT_ALLOW_DYNAMIC_SKILLS` |
| Telemetry | `PRODUCT_AGENT_TELEMETRY_STREAM`, `PRODUCT_AGENT_TELEMETRY_METRICS`, `PRODUCT_AGENT_TELEMETRY_LOG_LEVEL`, `PRODUCT_AGENT_TELEMETRY_THROTTLE_MS` |

Per-run overrides (validated by `ProductAgentApiOverrideSchema`) accept: `model`, `temperature`, `maxOutputTokens`, `skillPackId`, `additionalSkillPacks`, `workspaceRoot`, `logLevel`.

## Scripts
- `npm run build` – compile TypeScript (shared output for apps/api importers)
- `npm run test` – run the controller/subagent unit tests (Node test runner)
- `npm run lint` – lint `src/**/*.ts(x)`
- `npm run clean` – remove `dist`

## Migration notes
- PRD-specific planners, skill runners, and controller factories now live in `@product-agents/prd-agent`. Import orchestrator primitives (GraphController, config types, workspace DAO, subagent contracts) from this package, and wire artifact-specific logic via the new subagent.
- See `docs/deep-agent-refactor/phase5-changelog.md` for API/env rename details.
