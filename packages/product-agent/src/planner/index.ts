import type { Planner } from '../contracts/planner'
import type { ProductAgentConfig } from '../config/product-agent.config'

import { LegacyPrdPlanner, createLegacyPrdPlanner, type PrdPlanTask } from './legacy-prd-planner'
import { SkillCatalog } from './skill-catalog'

export { LegacyPrdPlanner, createLegacyPrdPlanner, SkillCatalog }
export type { PrdPlanTask }

/**
 * @deprecated Use the Orchestrator for planning instead.
 * This factory now only supports the legacy-prd strategy.
 * For intelligent planning, use `createLLMOrchestrator` from the orchestrator module.
 */
export interface PlannerFactoryOptions {
  config: ProductAgentConfig
  clock?: () => Date
}

/**
 * @deprecated Use the Orchestrator for planning instead.
 * This factory now only supports the legacy-prd strategy.
 */
export const createPlanner = (options: PlannerFactoryOptions): Planner => {
  return createLegacyPrdPlanner({ clock: options.clock })
}
