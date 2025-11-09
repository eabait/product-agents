# @product-agents/prd-agent

PRD-focused subagent package that hosts the planner, skill runner, verifier, and controller factory used by the deep product agent orchestrator. It consumes the shared config/runtime primitives from `@product-agents/product-agent` and the skill pack from `@product-agents/skills-prd`.

## Exports
- `createPrdController` / `getDefaultPrdController` – thin wrappers that compose the planner, skill runner, verifier, workspace DAO, and current persona subagent.
- `createPrdPlanner`, `createPrdSkillRunner`, `createPrdVerifier` – lower-level factory helpers for custom orchestration pipelines.
- `prdAgentManifest` – metadata describing the PRD agent’s capabilities (consumes, creates, version) for registry/discovery flows.
- `createPrdAgentSubagent` – returns a `SubagentLifecycle` that executes the PRD controller and emits workspace-friendly progress events.
- `PRD_AGENT_VERSION` – semantic version marker for registry/telemetry.

## Usage
```ts
import { loadProductAgentConfig } from '@product-agents/product-agent'
import { createPrdController } from '@product-agents/prd-agent'

const config = loadProductAgentConfig()
const controller = createPrdController({ config })

const summary = await controller.start({
  request: {
    artifactKind: 'prd',
    input: {
      message: 'Draft a PRD for a lightweight budgeting assistant',
      context: {}
    },
    createdBy: 'cli'
  }
})

// Subagent usage (register with a multi-artifact orchestrator)
import { createPrdAgentSubagent } from '@product-agents/prd-agent'

const prdSubagent = createPrdAgentSubagent()
const { artifact } = await prdSubagent.execute({
  params: {
    input: {
      message: 'Create a PRD for a collaborative whiteboard tool',
      context: {}
    }
  },
  run: orchestratorRunContext
})
```

## Scripts
- `npm run build` – compile the package (depends on `@product-agents/product-agent` build output for types).
- `npm run test` – run planner/skill/controller tests via the Node test runner.
- `npm run lint` – lint `src/**/*.ts`.
- `npm run clean` – remove `dist`.
