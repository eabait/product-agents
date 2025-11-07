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
- [x] Remove deprecated orchestrator utilities from the retired PRD bundle.
  - [x] Inventory every legacy file (`prd-orchestrator-agent.ts`, HTTP utilities, adapters) and map replacements inside `packages/product-agent` + `apps/api`.
  - [x] Delete the legacy code + exports once consumers are updated so only the new controller/skill packs remain.
  - [x] Run targeted TypeScript builds/tests to ensure zero stray imports remain.
- [x] Update documentation and READMEs to reflect new package layout and config.
  - [x] Refresh root README + AGENT.md with the deep agent architecture diagram/text.
  - [x] Update `docs/deep-agent-refactor/*` and package-level READMEs with migration notes + new config knobs.
  - [x] Capture a short changelog blurb for PRD consumers covering API/env deltas.
- [ ] Ensure CI/CD pipelines reference new packages and run relevant tests.
  - [ ] Audit Turbo graph, GitHub Actions (or equivalent), and deployment manifests for old paths (`apps/mcp-server`, legacy frontend).
  - [ ] Add/verify jobs for `run_e2e.sh`, subagent suites, and PRD skill-pack contract tests.
  - [ ] Confirm caches/artifacts track the relocated frontend + `apps/api`.
- [ ] Audit repo for legacy references (imports, paths) and clean up.
  - [ ] Use `rg` (plus codemods when safe) to flag deprecated identifiers/env vars across code + docs.
  - [ ] Add a temporary lint/prohibit rule to prevent reintroduction.
  - [ ] Track findings in a punch list until `rg` shows zero matches.
- [ ] Final regression pass across backend and frontend.
  - [ ] Run unit + contract tests per package, backend smoke via `apps/api`, and UI e2e flow.
  - [ ] Exercise persona/subagent flows introduced in Phase 4.
  - [ ] Archive logs/results for release notes and sign-off.

## Phase 6 – Planner Intelligence & Multi-Artifact Orchestration
- [ ] Replace the hardcoded PRD planner with an intelligent planner that dynamically composes plans from available skills and subagents.
- [ ] Enable plan generation for PRD, persona, and user story mapping artifacts (and transitions between them) based on the user’s prompt intent.
- [ ] Integrate artifact-aware skill/subagent registries so the planner can reason across shared tooling.
- [ ] Add verification to ensure multi-artifact plans produce coherent cross-handovers (e.g., PRD → persona → story map).
- [ ] Expand test coverage for planner reasoning, tool selection, and artifact handoff flows.

## Phase 0 – Audit & Scaffolding (Completed)
- [x] Inventory current orchestrator flows, section writers, analyzers, and shared utilities.
  - **Orchestrator:** `packages/product-agent/src/compositions/prd-controller.ts` composes the planner, skill runner, verifier, subagents, and workspace DAO. The thin HTTP surface in `apps/api/src/index.ts` loads `product-agent.config.ts`, streams progress events, and exposes `/prd` + `/runs` endpoints.
  - **Analyzers:** `packages/skills/prd/src/analyzers/*` (Context, Clarification, Section Detection) reuse the shared analyzer base + OpenRouter client helpers and accept per-worker runtime overrides from config.
  - **Section writers:** `packages/skills/prd/src/section-writers/*` cover target users, solution, key features, success metrics, and constraints with shared prompt builders.
  - **Shared utilities:** `packages/skills/prd/src/utils/*` plus cross-package modules in `packages/shared/*` (`agent-core`, `model-compatibility`, `types`, `openrouter-client`, `ui-components`).
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
