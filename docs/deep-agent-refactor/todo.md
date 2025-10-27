# Deep Agent Refactor TODO

> Track implementation progress across phases. Update status as work advances.

## Phase 0 – Audit & Scaffolding
- [x] Inventory current orchestrator flows, section writers, analyzers, and shared utilities.
  - **Orchestrator:** `packages/prd-agent/agent/src/prd-orchestrator-agent.ts` drives generation/edit flows (`handleFullGeneration`, `handleEditOperation`, `generateSectionsWithProgress`) with streaming progress events and metadata assembly via `buildPRDMetadata`. HTTP surface in `packages/prd-agent/agent/src/http-server.ts` wraps it with env-driven defaults and validation helpers.
  - **Analyzers:** `ContextAnalyzer`, `ClarificationAnalyzer`, and `SectionDetectionAnalyzer` (plus `base-analyzer.ts`) coordinate routing decisions and clarification prompts; each pulls runtime overrides from `agent-metadata`.
  - **Section writers:** Target users, solution, key features, success metrics, and constraints writers inherit `BaseSectionWriter`, using shared prompt builders in `section-writers/*.ts`.
  - **Shared utilities:** `utilities.ts` (HTTP helpers + settings validation), `utils/confidence-assessment.ts`, `utils/post-process-structured-response.ts`, and cross-package modules in `packages/shared/*` (`agent-core`, `model-compatibility`, `types`, `openrouter-client`, `ui-components`).
- [x] Document frontend dependencies and data flows.
  - **Dependencies:** Next.js 14, React 18, Radix UI primitives, Tailwind stack, `framer-motion`, `lucide-react`, `react-markdown`, and local `@product-agents/model-compatibility` types from the monorepo.
  - **API boundaries:** `/api/chat` validates payloads with `zod`, chooses backend endpoints (`/prd`, `/prd/edit`, `/prd/sections`, `/prd/section/:id`) and supports SSE streaming to `PRD_AGENT_URL`. `/api/sections` proxies targeted section operations and surfaces catalogue data, `/api/agent-defaults` bootstraps settings from `/health`, and `/api/models` hydrates model pickers via OpenRouter with capability filtering.
  - **State & data flow:** `app/page.tsx` maintains conversations, progress events, and settings; submission handlers decide between streaming vs. batch fetch. Context providers (`ModelContextProvider`, `ContextSettingsProvider`) expose model catalog + context window limits to components. `lib/*` modules handle PRD schema coercion, confidence display, and local storage for context selection.
- [x] Update Turbo/npm workspace configuration for `packages/product-agent` and `frontend/product-agent`.
  - **Workspace graph:** Added `packages/product-agent` + `frontend/product-agent` to npm workspaces (`package.json`) while keeping tooling npm-only.
  - **Tooling alignment:** Root `tsconfig.json` now exposes `@product-agents/product-agent` path alias; placeholder `frontend/product-agent` package keeps scripts inert until relocation.
  - **Scaffolded package:** Created `packages/product-agent` workspace (package/tsconfig/README) to host core orchestrator code.
- [x] Scaffold `product-agent.config.ts` with defaults, env overrides, and API override schema.
  - **Defaults:** `loadProductAgentConfig` seeds runtime/workspace/skills/telemetry defaults with retry + streaming knobs and filesystem root at `data/runs`.
  - **Overrides:** Env parsing for model, tokens, workspace paths, skill packs, telemetry, plus reusable API override schema and `resolveRunSettings`.
  - **Exports:** Centralized helpers via `packages/product-agent/src/index.ts` for future packages to import.
- [x] Capture interface definitions for controller, planner, skill runner, verifier, workspace DAO, and shared types.
  - **Contracts:** Added `packages/product-agent/src/contracts/*` describing plan graph, controller lifecycle, skill runner streaming, verifier results, and workspace DAO expectations.
  - **Shared types:** Standardized artifact/run metadata, progress events, and effective run context to align with deep agent spec.

## Phase 1 – Product Agent Core (PRD Only)
- [ ] Implement graph controller skeleton (`Plan → Execute → Verify → Deliver`).
- [ ] Port plan/verify/workspace contracts into `packages/product-agent`.
- [ ] Build filesystem-backed workspace DAO honoring configurable root + env overrides.
- [ ] Adapt existing PRD planners/skills to new interfaces via temporary adapters.
- [ ] Implement progress/telemetry event hooks (SSE-compatible) and ensure API parity.
- [ ] Validate parity via backend smoke tests.

## Phase 2 – Skill & Utility Extraction
- [ ] Move stateless skills into `packages/skills/*` modules with shared interface.
- [ ] Introduce single-file manifest (`prdSkillPack.ts`) exporting metadata and registration helpers.
- [ ] Relocate shared helpers (confidence aggregation, schemas, types) into `packages/shared`.
- [ ] Add contract tests validating each skill against planner/verify schemas.
- [ ] Update tooling/build scripts for new skill package structure.

## Phase 3 – Frontend Relocation & Integration
- [ ] Move Next.js app to `frontend/product-agent` and fix import paths.
- [ ] Wire UI data layer to thin API (`startRun`, `getRun`, `streamRun`).
- [ ] Expose configuration toggles for artifact types (PRD default).
- [ ] Verify Turbo `build`, `dev`, and `test` run clean after relocation.
- [ ] Execute end-to-end smoke test through UI.

## Phase 4 – Subagent Enablement
- [ ] Define subagent interfaces (inputs/outputs, lifecycle) reused across persona/research/story mapping.
- [ ] Implement persona builder subagent using existing PRD artifacts.
- [ ] Draft research subagent design doc (tooling, data sources).
- [ ] Prototype user story mapping subagent contract mirroring PRD outputs.
- [ ] Integrate subagents via skill pack configuration behind feature flags.
- [ ] Add tests covering orchestrator + subagent integration flow.

## Phase 5 – Hardening & Cleanup
- [ ] Remove deprecated orchestrator utilities from `packages/prd-agent`.
- [ ] Update documentation and READMEs to reflect new package layout and config.
- [ ] Ensure CI/CD pipelines reference new packages and run relevant tests.
- [ ] Publish migration notes for internal consumers (SDK/API changes).
- [ ] Audit repo for legacy references (imports, paths) and clean up.
- [ ] Final regression pass across backend and frontend.
