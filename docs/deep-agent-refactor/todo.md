# Deep Agent Refactor TODO

> Track implementation progress across phases. Update status as work advances.

## Phase 3 – Frontend Relocation & Integration
- [x] Move Next.js app to `frontend/product-agent` and fix import paths.
- [x] Wire UI data layer to thin API (`startRun`, `getRun`, `streamRun`).
- [x] Expose configuration toggles for artifact types (PRD default).
- [x] Verify Turbo `build`, `dev`, and `test` run clean after relocation.
- [x] Execute end-to-end smoke test through UI.
- [x] Relocate the thin API from `apps/mcp-server` to `apps/api` (or equivalent) so it is domain-agnostic.
- [x] Update workspace config, scripts, and deployment manifests to point at the new `apps/api` location.
- [x] Remove remaining MCP-specific references from docs and tooling to reflect the shared API surface.

### Execution Gameplan
1. Relocate the app shell into `frontend/product-agent` and adjust path aliases/imports.
2. Refactor hooks and API utilities to rely on the thin data layer (`startRun`, `getRun`, `streamRun`).
3. Surface artifact toggles in settings/components with PRD as the default selection.
4. Run Turbo `build`, `dev`, and `test` to confirm workspace wiring survives the move.
5. Perform a UI smoke pass to validate streaming, toggles, and legacy flows.

### Prep Checklist
- [x] Confirm root `tsconfig.json` and workspace aliases cover the new `frontend/product-agent` path.
- [x] Double-check `package.json` scripts reference the relocated frontend.
- [x] Note any implicit dependencies from the current frontend directory before moving files.

## Phase 2 – Skill & Utility Extraction (Completed)
- [x] Move stateless skills into `packages/skills/*` modules with shared interface.
- [x] Introduce single-file manifest (`prdSkillPack.ts`) exporting metadata and registration helpers.
- [x] Relocate shared helpers (confidence aggregation, schemas, types) into `packages/shared`.
- [x] Add contract tests validating each skill against planner/verify schemas.
- [x] Update tooling/build scripts for new skill package structure.

## Phase 4 – Subagent Enablement
- [x] Expose subagent routes through the shared thin API and validate end-to-end access via `apps/api`.
- [x] Document API contract updates so frontend and SDK consumers can call subagent endpoints.
- [x] Define subagent interfaces (inputs/outputs, lifecycle) reused across persona/research/story mapping.
- [x] Implement persona builder subagent using existing PRD artifacts.
- [x] Draft research subagent design doc (tooling, data sources).
- [x] Prototype user story mapping subagent contract mirroring PRD outputs.
- [x] Integrate subagents via skill pack configuration.
- [x] Add tests covering orchestrator + subagent integration flow.

## Phase 5 – Hardening & Cleanup
- [ ] Remove deprecated orchestrator utilities from `packages/prd-agent`.
- [ ] Update documentation and READMEs to reflect new package layout and config.
- [ ] Ensure CI/CD pipelines reference new packages and run relevant tests.
- [ ] Publish migration notes for internal consumers (SDK/API changes).
- [ ] Audit repo for legacy references (imports, paths) and clean up.
- [ ] Final regression pass across backend and frontend.

## Phase 6 – Planner Intelligence & Multi-Artifact Orchestration
- [ ] Replace the hardcoded PRD planner with an intelligent planner that dynamically composes plans from available skills and subagents.
- [ ] Enable plan generation for PRD, persona, and user story mapping artifacts (and transitions between them) based on the user’s prompt intent.
- [ ] Integrate artifact-aware skill/subagent registries so the planner can reason across shared tooling.
- [ ] Add verification to ensure multi-artifact plans produce coherent cross-handovers (e.g., PRD → persona → story map).
- [ ] Expand test coverage for planner reasoning, tool selection, and artifact handoff flows.

## Phase 0 – Audit & Scaffolding (Completed)
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

## Phase 1 – Product Agent Core (PRD Only) (Completed)
- [x] Implement graph controller skeleton (`Plan → Execute → Verify → Deliver`).
- [x] Port plan/verify/workspace contracts into `packages/product-agent`.
- [x] Build filesystem-backed workspace DAO honoring configurable root + env overrides.
- [x] Adapt existing PRD planners/skills to new interfaces via temporary adapters.
- [x] Implement progress/telemetry event hooks (SSE-compatible) and ensure API parity.
- [x] Validate parity via backend smoke tests.
