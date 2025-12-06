import type {
  ProductAgentConfig,
  SubagentLifecycle,
  SubagentRegistry,
  Planner,
  CorePlanBuilder
} from '@product-agents/product-agent'
import {
  getDefaultProductAgentConfig,
  createPlanner as createProductPlanner,
  LegacyPrdPlanner as PrdPlanner,
  type PrdPlanTask
} from '@product-agents/product-agent'

interface CreatePrdPlannerOptions {
  config?: ProductAgentConfig
  clock?: () => Date
  subagentRegistry?: SubagentRegistry
  subagents?: SubagentLifecycle[]
  coreBuilders?: CorePlanBuilder[]
}

export { PrdPlanner }
export type { PrdPlanTask }

export const createPrdPlanner = (options?: CreatePrdPlannerOptions): Planner =>
  createProductPlanner({
    config: options?.config ?? getDefaultProductAgentConfig(),
    clock: options?.clock,
    subagentRegistry: options?.subagentRegistry,
    subagents: options?.subagents ?? [],
    coreBuilders: options?.coreBuilders
  })
