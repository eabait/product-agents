# Deep Agent Refactor Implementation Plan

## Objectives
- Transform the current PRD-specific orchestrator into a reusable **deep product agent** capable of producing PRDs first, with extensibility for personas, research syntheses, user story maps, and other product artifacts.
- Modularize code into clear package boundaries (orchestrator, frontend, subagents/skills, shared utilities) aligned with the deep agent spec contracts (Plan, Artifact, VerifyResult).
- Preserve developer productivity by keeping a thin API layer and minimizing build-system churn while preparing for future subagent expansion.
- Maintain service continuity during the refactor by sequencing work into incremental, testable phases.

## Target Package Graph

| Package/Directory | Role | Key Contents | Notes |
| --- | --- | --- | --- |
| `packages/product-agent` | **Deep Orchestrator Core** | Graph controller, planner, skill runner, verifier adapter, workspace DAO, run types | Primary runtime API; PRD is the first specialization. |
| `frontend/product-agent` | **Product Agent Frontend** | Next.js UI for interacting with the deep product agent | Rehomes existing PRD frontend; future-proof for multi-artifact workflows. |
| `packages/prd-agent` | **Domain Bundle** | PRD-specific plan templates, skill wiring, prompts, config | Becomes a composition layer that consumes `product-agent`. |
| `packages/skills/*` | **Skill Modules** | Stateless skills (section writers, analyzers, validators, formatters) | Namespaced per capability; shipped as tree-shakeable imports. |
| `packages/subagents/*` | **Stateful Subagents** | Persona builder, research synthesizer, story mapper, etc. | Promoted when internal planning/iteration justified. |
| `packages/shared/*` | **Shared Utilities** | Common types, schema defs, confidence utilities, client SDK | Prune/relocate code from `prd-agent` as needed. |
| `apps/mcp-server` (existing) | **Thin API Surface** | HTTP/SSE endpoints, auth, rate limiting | Wraps orchestrator core; keeps IO/APIs isolated. |

## System Boundaries & API Decisions
- **Thin API:** Retain the existing MCP/API server as the external interface. Refactor it to depend on `packages/product-agent` so other surfaces (CLI, UI, integrations) reuse the same orchestration contract.
- **Contract-first:** Export a stable TypeScript SDK (`@product-agents/product-agent`) exposing: `startRun`, `getRun`, `streamRun`, plan/verify schemas, and skill registration helpers.
- **Artifact Persistence:** Implement a filesystem-backed workspace DAO inside `packages/product-agent`, defaulting to a configurable root path from the central config file with optional environment-variable overrides; keep the storage interface abstract to support future database swaps.
- **Configuration:** Use single-file manifest-based skill packs (e.g., `prdSkillPack`) published as monorepo references that register skills/subagents with the orchestrator; avoid build-time configuration magic.
- **Streaming:** Maintain the existing minimal SSE-style progress streaming; defer additional integration work until requirements surface.

### Configuration Blueprint (`product-agent.config.ts`)
- **Shape:** Export a strongly typed object (and corresponding `zod` schema) with nested sections for `runtime`, `workspace`, `skills`, and `telemetry`.
- **Defaults:** Provide opinionated defaults for model selection, retry budgets, workspace root (e.g., `./data/runs`), and enabled skill packs.
- **Overrides:** 
  - Environment variables (`PRODUCT_AGENT_MODEL`, `PRODUCT_AGENT_WORKSPACE_ROOT`, etc.) override defaults at load time.
  - API-level overrides accept a subset of user-facing fields (e.g., model, skill pack selection) and merge per-run with safeguards (validation + max limits).
- **Consumption:** The orchestrator imports the config at start, injects it into the workspace DAO and planner/skill runner factories, and exposes a typed helper for reading effective config per run.
- **Hot Reload:** Keep initial implementation static (config read on process boot); document future extension if live reload becomes necessary.

### Skill Pack Manifest Blueprint
- **Location:** Each pack exports a single TypeScript file (e.g., `packages/skills/prd/skillPack.ts`) re-exported via that package’s `index.ts`.
- **Interface:**
  ```ts
  interface SkillPackManifest {
    id: string;
    version: string;
    label: string;
    description?: string;
    skills: SkillRegistration[];
    subagents?: SubagentRegistration[];
    config?: {
      defaults: Record<string, unknown>;
      inputsSchema?: z.ZodTypeAny;
    };
  }
  ```
- **Registrations:** Each `SkillRegistration` references a factory that receives the orchestrator’s dependency container (logger, config, DAO) and returns a `Skill`.
- **Metadata:** `version` tracks pack evolution without publishing to npm; consumers specify pack + version in config/API.
- **Testing:** Provide manifest-level tests ensuring every registered skill satisfies the expected contract and exports metadata (name, inputs, outputs).
- **Future-proofing:** Allow optional `subagents` arrays but keep implementation minimal until new subagents land.

## Phase Plan

### Phase 0 – Audit & Scaffolding
- Inventory current orchestrator flows, section writers, analyzers, shared utils, and frontend dependencies.
- Update Turbo/pnpm workspaces and dependency graphs for the new `product-agent` package and frontend relocation.
- Define initial TypeScript interfaces in `packages/product-agent` aligning with `deep_agent_spec`.
- Add a central `product-agent.config.ts` (or equivalent) capturing non-sensitive defaults, supporting environment-variable overrides, and exposing user-facing knobs for API overrides.
- Exit Criteria: Documentation for interfaces, workspace configuration updated, no behavior change.

### Phase 1 – Product Agent Core (PRD Only)
- Implement graph controller skeleton with planning → execute → verify → deliver loop.
- Port plan/verify/workspace contracts into the new package; wire existing PRD planners/skills temporarily via adapters.
- Implement event emission hooks (progress, logging) consistent with current streaming behavior.
- Build the filesystem-backed workspace DAO honoring the configurable root path and env overrides defined in the central config.
- Exit Criteria: Existing PRD backend (API + tests) runs via new orchestrator package; parity verified with smoke tests.

### Phase 2 – Skill & Utility Extraction
- Move stateless components into `packages/skills` modules (e.g., `skills/clarification`, `skills/sections/success-metrics`).
- Standardize skill interface adapters to plug into the skill runner; add shared validation utilities.
- Introduce single-file skill pack manifests (e.g., `prdSkillPack.ts`) exporting metadata and registration helpers, published as monorepo references.
- Relocate cross-cutting helpers (confidence aggregation, schema definitions) into `packages/shared`.
- Exit Criteria: PRD workflow composes skills from new packages; tests cover each skill contract.

### Phase 3 – Frontend Relocation & Integration
- Move the existing Next.js app to `frontend/product-agent`; adjust imports and build scripts.
- Update UI data layer to call the thin API (no direct orchestrator imports) and support multiple artifact modes (start with PRD toggled).
- Validate Turbo pipelines (`build`, `dev`, `test`) after relocation; ensure no extra build complexity (reuse existing scripts).
- Exit Criteria: Frontend builds and runs from new location; end-to-end PRD flow works through UI.

### Phase 4 – Subagent Enablement (Personas, Research, Story Mapping)
- Design interfaces for stateful subagents (planning loops, retries); house in `packages/subagents`.
- Implement persona builder subagent first, using PRD outputs as inputs.
- Draft architecture for research subagent (needs external data retrieval); capture open design tasks.
- Wire optional subagents into orchestrator via skill-pack configuration (feature flags).
- Exit Criteria: Persona subagent functional behind flag; roadmap and contracts in place for research & story mapping.

### Phase 5 – Hardening & Cleanup
- Remove deprecated orchestrator utilities from `packages/prd-agent`.
- Update tests, fixtures, and docs to reference new package structure.
- Add migration notes for consumers (SDK/API changes, environment variables).
- Exit Criteria: Repo lint/tests green; documentation updated; no unused legacy code remains.

## Testing & Tooling Strategy
- Unit tests for core orchestrator state machine, planner adapters, skill runner, and verifier.
- Contract tests ensuring skill outputs satisfy planner/verify schemas.
- End-to-end smoke tests via API + UI covering PRD generation and persona subagent flow (when available).
- Measure run telemetry parity before/after refactor using existing logging.

## Migration & Backwards Compatibility
- Provide interim adapters so existing consumers of `packages/prd-agent` continue to function until final cleanup.
- Align environment variables/config files between backend and UI; update deployment manifests incrementally.
- Document any new CLI commands or SDK entry points early to avoid breaking automation.

## Risks & Mitigations
- **Coupling between packages:** Mitigate with explicit interfaces and shared types; enforce via lint rules.
- **Build complexity:** Avoid new build targets; reuse Turbo pipelines and pnpm workspace configuration.
- **Feature regression:** Stage refactor behind feature flags and run dual-mode testing during Phase 1–3.
- **Research subagent unknowns:** Capture design spikes before implementation; may require additional infrastructure (RAG, search).
