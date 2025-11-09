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
| Legacy PRD bundle (removed) | **Legacy Domain Bundle** | PRD-specific plan templates, skill wiring, prompts, config | Removed during Phase 5; domain wiring now lives in `packages/product-agent` + `packages/skills/prd`. |
| `packages/skills/*` | **Skill Modules** | Stateless skills (section writers, analyzers, validators, formatters) | Namespaced per capability; shipped as tree-shakeable imports. |
| `packages/prd-agent` | **PRD Agent Subpackage** | Subagent lifecycle implementation, PRD skill-pack binding, manifest export | First-class `SubagentLifecycle` that can run standalone or under the product-agent orchestrator. |
| `packages/subagents/*` | **Stateful Subagents** | Persona builder, research synthesizer, story mapper, etc. | Promoted when internal planning/iteration justified; each ships its own manifest. |
| `packages/shared/*` | **Shared Utilities** | Common types, schema defs, confidence utilities, client SDK | Prune/relocate code from `prd-agent` as needed. |
| `apps/api` (replaces legacy `apps/mcp-server`) | **Thin API Surface** | HTTP/SSE endpoints, auth, rate limiting | Wraps orchestrator core via `@product-agents/product-agent`; shared across artifact types. |

## System Boundaries & API Decisions
- **Thin API:** Serve requests through the shared `apps/api` package, backed by `@product-agents/product-agent`, so other surfaces (CLI, UI, integrations) reuse the same orchestration contract.
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
- **Environment variable guide:**
  - Runtime: `PRODUCT_AGENT_MODEL`, `PRODUCT_AGENT_TEMPERATURE`, `PRODUCT_AGENT_MAX_OUTPUT_TOKENS`, `PRODUCT_AGENT_ALLOW_STREAMING`, `PRODUCT_AGENT_FALLBACK_MODEL`, `PRODUCT_AGENT_RETRY_ATTEMPTS`, `PRODUCT_AGENT_RETRY_BACKOFF_MS`
  - Workspace: `PRODUCT_AGENT_WORKSPACE_ROOT`, `PRODUCT_AGENT_WORKSPACE_PERSIST`, `PRODUCT_AGENT_WORKSPACE_RETENTION_DAYS`, `PRODUCT_AGENT_WORKSPACE_TEMP_SUBDIR`
  - Skills: `PRODUCT_AGENT_SKILL_PACKS`, `PRODUCT_AGENT_ALLOW_DYNAMIC_SKILLS`
  - Telemetry: `PRODUCT_AGENT_TELEMETRY_STREAM`, `PRODUCT_AGENT_TELEMETRY_METRICS`, `PRODUCT_AGENT_TELEMETRY_LOG_LEVEL`, `PRODUCT_AGENT_TELEMETRY_THROTTLE_MS`
  - Subagents: `PRODUCT_AGENT_SUBAGENTS` (JSON array of `SubagentManifest` objects)
- **Consumption:** The orchestrator imports the config at start, injects it into the workspace DAO and planner/skill runner factories, and exposes a typed helper for reading effective config per run.
- **Hot Reload:** Keep initial implementation static (config read on process boot); document future extension if live reload becomes necessary.

### Subagent Registry & Discovery (Phase 6.2)
- **Manifest contract:** `SubagentManifest` (id, package, version, label, description, `creates`, `consumes`, `capabilities`, `tags`, `entry`, optional `exportName`) lives in `@product-agents/product-agent`. Each agent package exports both the manifest and its `createXSubagent` lifecycle factory (`prdAgentManifest` + `createPrdAgentSubagent` is the baseline).
- **Configuration:** `product-agent.config.ts` now exposes `subagents.manifests`. Teams can extend it in code or via `PRODUCT_AGENT_SUBAGENTS`, which expects the manifest array as JSON for quick ops overrides.
- **Registry service:** `SubagentRegistry` provides `register`, `list`, `get`, `filterByArtifact`, and `createLifecycle`. It lazily imports modules declared in the manifest (`entry`/`exportName`), caches instantiated lifecycles, and raises telemetry/workspace events when a load fails.
- **Controller integration:** `GraphController` receives the registry (in addition to any statically provided subagents) and, after producing an artifact, asks for compatible manifests based on the artifact kind. Loaded subagents inherit the same progress/workspace instrumentation as built-ins.
- **Discovery surfaces:** `apps/api` builds a registry from config, exposes manifest metadata via `/health`, and the frontend `/api/agent-defaults` route mirrors that data so UI toggles can reflect the real artifact catalogue.

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

### Subagent Registry & Planner Blueprint
- **Per-package manifests:** Every agent-grade package (`packages/prd-agent`, persona, research, story-mapper) exports `SubagentManifestEntry = { id, package, creates, consumes[], capabilities[], version, plannerHints? }` plus a factory that returns a `SubagentLifecycle`.
- **Registry service:** `packages/product-agent` owns a `SubagentRegistry` that loads manifests (from config or dynamic imports), caches metadata, exposes `list/filter/get`, and lazily instantiates implementations when the controller needs them.
- **Planner integration:** Extend the plan graph DSL with `kind: 'skill' | 'subagent'`, `agentId`, and optional `inputs.fromArtifact`. The intelligent planner queries the registry (e.g., `filterBy({ sourceKind: 'prd', targetKind: 'persona' })`) when composing multi-artifact plans and injects the chosen subagent node(s) into the graph.
- **API/telemetry:** Surface registry metadata via `/health` so the frontend and SDKs know which artifact types and agent IDs are available; log registry versions for debugging.
- **Prompt footprint:** Only inject the small subset of manifest data relevant to a given planning decision to avoid unnecessary context-window overhead.

## Phase Plan

### Phase 0 – Audit & Scaffolding
- Inventory current orchestrator flows, section writers, analyzers, shared utils, and frontend dependencies.
- Update Turbo/npm workspaces and dependency graphs for the new `product-agent` package and frontend relocation.
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
- Wire optional subagents into orchestrator via skill-pack configuration.
- Exit Criteria: Persona subagent functional behind flag; roadmap and contracts in place for research & story mapping.

### Phase 5 – Hardening & Cleanup
- Remove any remaining deprecated orchestrator utilities tied to the legacy PRD-specific package.
- Update tests, fixtures, and docs to reference new package structure.
- Add migration notes for consumers (SDK/API changes, environment variables).
- Exit Criteria: Repo lint/tests green; documentation updated; no unused legacy code remains.

### Client Artifact Persistence (Interim)
- Until backend persistence spans every artifact type, keep leveraging the frontend run store/local storage to cache derived artifacts (PRD, persona, story map).
- Require clients to pass serialized upstream artifacts when invoking downstream subagents so the orchestrator can hydrate `sourceArtifact` even if the backend hasn’t stored it yet.
- Attach cached artifacts back onto run summaries when responses return, keeping UI state aligned without blocking registry/subagent work.

## Testing & Tooling Strategy
- Unit tests for core orchestrator state machine, planner adapters, skill runner, and verifier.
- Contract tests ensuring skill outputs satisfy planner/verify schemas.
- End-to-end smoke tests via API + UI covering PRD generation and persona subagent flow (when available).
- Measure run telemetry parity before/after refactor using existing logging.

## Migration & Backwards Compatibility
- Provide interim adapters so existing consumers of the legacy PRD bundle continue to function until final cleanup.
- Align environment variables/config files between backend and UI; update deployment manifests incrementally.
- Document any new CLI commands or SDK entry points early to avoid breaking automation.

## Risks & Mitigations
- **Coupling between packages:** Mitigate with explicit interfaces and shared types; enforce via lint rules.
- **Build complexity:** Avoid new build targets; reuse Turbo pipelines and existing npm workspace configuration.
- **Feature regression:** Stage refactor with incremental toggles and run dual-mode testing during Phase 1–3.
- **Research subagent unknowns:** Capture design spikes before implementation; may require additional infrastructure (RAG, search).
