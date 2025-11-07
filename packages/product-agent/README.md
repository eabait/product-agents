# @product-agents/product-agent

Deep agent orchestrator core for PRD (and future artifact) runs. It assembles the graph controller, planner, skill runner, verifier, workspace DAO, and optional subagents, and exposes helpers for the thin API (`apps/api`) and other surfaces.

## Key modules
- `src/config/product-agent.config.ts` – strongly typed defaults + env parsing + API override schema.
- `src/controller/graph-controller.ts` – `Plan → Execute → Verify → Deliver` loop with progress event streaming.
- `src/adapters/prd/*` – planner, skill runner, verifier glue for the PRD skill pack.
- `src/compositions/prd-controller.ts` – factory that wires the controller, workspace DAO, and current subagents.
- `src/workspace/filesystem-workspace-dao.ts` – filesystem-backed artifact storage.

## Configuration
```ts
import { createPrdController, loadProductAgentConfig } from '@product-agents/product-agent'

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
- The historical `@product-agents/prd-agent` workspace has been removed; dependents should import the controller from this package and schemas from `@product-agents/prd-shared`.
- See `docs/deep-agent-refactor/phase5-changelog.md` for API/env rename details.
