# Phase 5 – PRD Consumer Changelog

> Concise reference for anyone integrating with the PRD workflow after the deep-agent hardening pass.

## Breaking / notable changes
- **Package boundary:** `@product-agents/prd-agent` has been retired. Use `@product-agents/product-agent` (controller) + `@product-agents/skills-prd` (skill pack) + `@product-agents/prd-shared` (schemas). Frontend/API integrations should only call the thin API.
- **Backend host:** All HTTP traffic now goes through `apps/api` (`npm run dev --workspace=apps/api`). Legacy `packages/prd-agent/agent` scripts have been removed.
- **Config source:** Runtime/workspace/skill/telemetry defaults live in `packages/product-agent/src/config/product-agent.config.ts`. Load this once per process and pass the resulting config to `createPrdController`.

## Environment variable updates
| Subsystem | Old | New |
| --- | --- | --- |
| Backend host | `PRD_AGENT_HTTP_HOST`, `PRD_AGENT_HTTP_PORT` | `PRODUCT_AGENT_API_HOST`, `PRODUCT_AGENT_API_PORT` |
| Runtime defaults | `PRD_AGENT_MODEL`, `PRD_AGENT_TEMPERATURE`, `PRD_AGENT_MAX_TOKENS`, etc. | `PRODUCT_AGENT_MODEL`, `PRODUCT_AGENT_TEMPERATURE`, `PRODUCT_AGENT_MAX_OUTPUT_TOKENS`, `PRODUCT_AGENT_ALLOW_STREAMING`, `PRODUCT_AGENT_FALLBACK_MODEL`, `PRODUCT_AGENT_RETRY_ATTEMPTS`, `PRODUCT_AGENT_RETRY_BACKOFF_MS` |
| Workspace | `PRD_AGENT_STORAGE_ROOT` | `PRODUCT_AGENT_WORKSPACE_ROOT`, `PRODUCT_AGENT_WORKSPACE_PERSIST`, `PRODUCT_AGENT_WORKSPACE_RETENTION_DAYS`, `PRODUCT_AGENT_WORKSPACE_TEMP_SUBDIR` |
| Skill configuration | implicit | `PRODUCT_AGENT_SKILL_PACKS`, `PRODUCT_AGENT_ALLOW_DYNAMIC_SKILLS` |
| Telemetry | implicit | `PRODUCT_AGENT_TELEMETRY_STREAM`, `PRODUCT_AGENT_TELEMETRY_METRICS`, `PRODUCT_AGENT_TELEMETRY_LOG_LEVEL`, `PRODUCT_AGENT_TELEMETRY_THROTTLE_MS` |

> `OPENROUTER_API_KEY` remains unchanged and is still required in `apps/api/.env`.

## API surface
- `/runs` and `/prd` endpoints are unchanged, but all routes now emit controller metadata that matches the new `ProductAgentApiOverrides` contract. See `README.md` for the full architecture map.
- Per-run overrides accept `model`, `temperature`, `maxOutputTokens`, `skillPackId`, `additionalSkillPacks`, `workspaceRoot`, `logLevel`.

## Validation checklist for downstream teams
1. Update imports to `@product-agents/product-agent` (controller APIs) or `@product-agents/prd-shared` (schemas).
2. Ensure deployment manifests set the new `PRODUCT_AGENT_*` env vars instead of the old `PRD_AGENT_*` names.
3. Point all UI/SDK traffic at the `apps/api` service and remove any references to `packages/prd-agent/agent`.
4. Re-run smoke tests (startRun → streamRun) to confirm that progress events and artifacts resolve through the new pipeline.
