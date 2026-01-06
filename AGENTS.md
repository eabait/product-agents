# Product Agents - Agent Memory File

## Project Overview
Product Agents is a monorepo for generating product artifacts (PRD, persona, research) with a graph-based orchestrator. It uses Turborepo + npm workspaces, a Next.js frontend, a thin HTTP/SSE API, and subagent packages for artifact generation.

## Repository Layout (code-based)
- apps/api: thin HTTP/SSE API that wraps the orchestrator.
- frontend/product-agent: Next.js UI and API routes.
- packages/product-agent: core orchestrator (planner, graph controller, subagent registry, contracts, config).
- packages/prd-agent: PRD subagent wrapper around the controller.
- packages/persona-agent/agent: persona subagent.
- packages/research-agent: research subagent.
- packages/skills/intent: intent classifier skill.
- packages/skills/prd: PRD skill pack and section writers.
- packages/shared/*: shared libs (agent-core, model-compatibility, openrouter-client, prd-shared, ui-components).

## Runtime Architecture

### Run request flow
1. UI calls /api/runs (streaming) or /api/chat (legacy PRD endpoints).
2. apps/api /runs validates StartRunPayload and normalizes to SectionRoutingRequest (message, contextPayload, existingPRD, conversationHistory, settings, targetSections).
3. GraphController builds a plan, executes skill nodes + subagent nodes, verifies if configured, writes artifacts to the workspace, and emits progress events.

### Intent planning (Phase 5/6)
- IntentResolver uses IntentClassifierSkill to create ArtifactIntent from conversation text, existing artifacts, and available artifacts from the registry.
- The intent plan is cached on RunContext.intentPlan and RunContext.metadata.intent.
- IntelligentPlanner builds a PRD core segment when needed and appends subagent transition nodes for requested artifacts.
- Plan metadata includes requestedArtifacts, requestedArtifactKind, intentConfidence, transitionPath, subagents, skillPacks, and optional skills sequence.

### Subagent registry and lifecycle
- SubagentManifest fields: id, package, version, label, creates, consumes, capabilities, description, entry, exportName, tags.
- SubagentRegistry registers manifests and lazily loads modules via dynamic import of entry. exportName defaults to createSubagent or default.
- apps/api registers manifests from config and PRODUCT_AGENT_SUBAGENTS, and ensures persona + research are registered. Research uses a custom loader to inject TAVILY_API_KEY.
- GraphController resolves subagents by artifact kind. Subagents can run as plan nodes or as post-run "auto" subagents based on requested artifacts.

### Artifacts and context
- Artifact kinds include prd, persona, research, story-map (plus custom strings).
- Existing artifacts can be supplied via SectionRoutingRequest.context: existingPRD, existingPersonas, existingStoryMap, existingResearch.
- GraphController tracks artifacts by step and kind and can synthesize a prompt artifact when a subagent consumes prompt.
- Persona subagent stores strategy/usage/telemetry in artifact metadata extras.

### Events and SSE
- Progress events include: plan.created, plan.updated, step.started/completed/failed, verification.started/completed/issue, artifact.delivered, run.status, subagent.started/progress/completed/failed.
- For subagent nodes, artifact.delivered payload includes transition info (from/to artifact kinds, promotion flag, intent target, transitionPath).
- apps/api streams SSE from /runs/:runId/stream and keeps an in-memory event buffer; frontend run-store caches progress and subagent artifacts.

## API Surface

### Thin API (apps/api)
- GET /health: defaults, planner name, skill packs, subagent metadata.
- POST /runs: start a streaming run (settings.streaming must not be false).
- GET /runs/:runId: run record with events and summary.
- GET /runs/:runId/stream: SSE stream of progress/completion/clarification.

StartRunPayload (apps/api):
```
{
  "artifactType": "prd",
  "messages": [{ "id": "...", "role": "user", "content": "..." }],
  "settings": {
    "model": "...",
    "temperature": 0.2,
    "maxTokens": 8000,
    "apiKey": "...",
    "streaming": true
  },
  "contextPayload": { "...": "..." },
  "targetSections": ["targetUsers", "solution"]
}
```
Note: Subagent model overrides are configured via environment variables, not per-request.

### Frontend API routes (frontend/product-agent/app/api)
- POST /api/runs: proxy to /runs.
- GET /api/runs/:runId: local run store, refreshes from backend when needed.
- GET /api/runs/:runId/stream: SSE passthrough, updates run store.
- GET /api/agent-defaults: proxy to /health.
- GET /api/models: OpenRouter models filtered by required capabilities.
- POST /api/chat: legacy PRD endpoints on PRD_AGENT_URL (/prd, /prd/edit, /prd/section/:name, /prd/sections).
- POST /api/sections: proxy to /prd/sections or /prd/section/:name.
- POST /api/subagents/persona: direct persona subagent runner (can start from runId, artifact, or prompt).

## Configuration and Overrides

### Centralized Configuration (env.example)
All configuration is centralized in a single `.env` file at the project root. See `env.example` for the full template.

**Core env vars:**
- API Keys: `OPENROUTER_API_KEY`, `TAVILY_API_KEY`
- Orchestrator: `ORCHESTRATOR_MODEL`, `ORCHESTRATOR_TEMPERATURE`, `ORCHESTRATOR_MAX_TOKENS`
- Skills model override: `SKILLS_MODEL` (optional - uses ORCHESTRATOR_MODEL if empty)
- Subagent models: `PERSONA_AGENT_MODEL`, `RESEARCH_AGENT_MODEL` (optional - inherit from orchestrator if empty)
- Runtime: `STREAMING_ENABLED`, `LOG_LEVEL`
- Backend URL: `PRD_AGENT_URL` (for frontend)

### Legacy config (packages/product-agent)
- Default config: packages/product-agent/src/config/product-agent.config.ts.
- Planner strategy: intelligent (default) or legacy-prd.
- Additional env overrides:
  - Runtime: PRODUCT_AGENT_MODEL, PRODUCT_AGENT_TEMPERATURE, PRODUCT_AGENT_MAX_OUTPUT_TOKENS, PRODUCT_AGENT_ALLOW_STREAMING, PRODUCT_AGENT_FALLBACK_MODEL, PRODUCT_AGENT_RETRY_ATTEMPTS, PRODUCT_AGENT_RETRY_BACKOFF_MS
  - Workspace: PRODUCT_AGENT_WORKSPACE_ROOT, PRODUCT_AGENT_WORKSPACE_PERSIST, PRODUCT_AGENT_WORKSPACE_RETENTION_DAYS, PRODUCT_AGENT_WORKSPACE_TEMP_SUBDIR
  - Skills: PRODUCT_AGENT_SKILL_PACKS, PRODUCT_AGENT_ALLOW_DYNAMIC_SKILLS
  - Telemetry: PRODUCT_AGENT_TELEMETRY_STREAM, PRODUCT_AGENT_TELEMETRY_METRICS, PRODUCT_AGENT_TELEMETRY_LOG_LEVEL, PRODUCT_AGENT_TELEMETRY_THROTTLE_MS
  - Subagents: PRODUCT_AGENT_SUBAGENTS (JSON array of SubagentManifest entries)
  - Planner: PRODUCT_AGENT_PLANNER_STRATEGY

### Shared config schemas
Centralized validation schemas are in `packages/shared/config-schemas/`. This package exports:
- `SettingsSchema`, `MessageSchema`, `StartRunSchema` - API request validation
- `EnvConfigSchema`, `parseEnvConfig`, `getResolvedConfig` - Environment parsing
- Constants: `TEMPERATURE_MIN/MAX`, `MAX_TOKENS_MIN/MAX`, default values

### Per-run overrides (API payload)
model, temperature, maxOutputTokens, skillPackId, additionalSkillPacks, workspaceRoot, logLevel.

## Dev environment tips (commands)
- Install dependencies: npm install
- Run all dev tasks (turbo): npm run dev
- Run only the API: npm run dev -w apps/api
- Run only the frontend: npm run dev -w frontend/product-agent
- Build all packages: npm run build
- Clean build artifacts: npm run clean
- Lint all packages: npm run lint
- Fix lint issues: npm run lint:fix
- Frontend expects PRD_AGENT_URL to point at the thin API or PRD backend.

## Testing instructions
- Run all tests: npm test (turbo run test)
- Product-agent unit tests: npm run test -w packages/product-agent
- PRD agent tests: npm run test -w packages/prd-agent
- Research agent tests: npm run test -w packages/research-agent
- Persona agent tests: npm run test -w packages/persona-agent/agent
- Frontend E2E (Playwright): npm run test -w frontend/product-agent
- Frontend E2E live: npm run test:e2e:live -w frontend/product-agent
- PRD E2E script: ./run_e2e.sh (requires apps/api/.env with OPENROUTER_API_KEY)

## Code Quality rules
- ESLint config is in .eslintrc.json (root).
- Base rules: prefer-const, no-var, eqeqeq (always), no-unused-vars (argsIgnorePattern "^_").
- TypeScript override: no-unused-vars is disabled for TS files.
- no-console is allowed; formatting is not enforced by ESLint.
- Lint commands: npm run lint and npm run lint:fix; frontend uses next lint.
