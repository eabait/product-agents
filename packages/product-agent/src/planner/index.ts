import type { Planner } from '../contracts/planner'
import type { ProductAgentConfig } from '../config/product-agent.config'
import type { SubagentLifecycle } from '../contracts/subagent'
import type { SubagentRegistry } from '../subagents/subagent-registry'

import { LegacyPrdPlanner, createLegacyPrdPlanner, type PrdPlanTask } from './legacy-prd-planner'
import { SkillCatalog } from './skill-catalog'
import { IntelligentPlanner, type IntelligentPlannerTask } from './intelligent-planner'

export { LegacyPrdPlanner, createLegacyPrdPlanner, SkillCatalog }
export type { PrdPlanTask, IntelligentPlannerTask }

export interface PlannerFactoryOptions {
  config: ProductAgentConfig
  clock?: () => Date
  subagentRegistry?: SubagentRegistry
  subagents?: SubagentLifecycle[]
}

export const createPlanner = (options: PlannerFactoryOptions): Planner => {
  const strategy = options.config.planner.strategy
  if (strategy === 'legacy-prd') {
    return createLegacyPrdPlanner({ clock: options.clock })
  }

  return new IntelligentPlanner({
    config: options.config,
    clock: options.clock,
    subagentRegistry: options.subagentRegistry,
    registeredSubagents: options.subagents ?? []
  })
}

export { IntelligentPlanner }
