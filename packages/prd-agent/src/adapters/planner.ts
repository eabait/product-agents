import type {
  ProductAgentConfig,
  Planner
} from '@product-agents/product-agent'
import {
  getDefaultProductAgentConfig,
  createPlanner as createProductPlanner,
  LegacyPrdPlanner as PrdPlanner,
  type PrdPlanTask
} from '@product-agents/product-agent'

/**
 * @deprecated Use the Orchestrator for planning instead.
 * This factory now only creates legacy PRD planners.
 */
interface CreatePrdPlannerOptions {
  config?: ProductAgentConfig
  clock?: () => Date
}

export { PrdPlanner }
export type { PrdPlanTask }

/**
 * @deprecated Use the Orchestrator for planning instead.
 * For intelligent planning, use `createLLMOrchestrator` from @product-agents/product-agent.
 */
export const createPrdPlanner = (options?: CreatePrdPlannerOptions): Planner =>
  createProductPlanner({
    config: options?.config ?? getDefaultProductAgentConfig(),
    clock: options?.clock
  })
