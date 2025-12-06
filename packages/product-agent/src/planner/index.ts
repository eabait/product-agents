import type { Planner } from '../contracts/planner'
import type { ProductAgentConfig } from '../config/product-agent.config'
import type { SubagentLifecycle } from '../contracts/subagent'
import { SubagentRegistry } from '../subagents/subagent-registry'

import { LegacyPrdPlanner, createLegacyPrdPlanner, type PrdPlanTask } from './legacy-prd-planner'
import { SkillCatalog } from './skill-catalog'
import { IntelligentPlanner, type IntelligentPlannerTask, type CorePlanBuilder } from './intelligent-planner'
import { IntentResolver } from './intent-resolver'
import { IntentClassifierSkill } from '@product-agents/skills-intent'

export { LegacyPrdPlanner, createLegacyPrdPlanner, SkillCatalog }
export type { PrdPlanTask, IntelligentPlannerTask, CorePlanBuilder }

export interface PlannerFactoryOptions {
  config: ProductAgentConfig
  clock?: () => Date
  subagentRegistry?: SubagentRegistry
  subagents?: SubagentLifecycle[]
  coreBuilders?: CorePlanBuilder[]
}

export const createPlanner = (options: PlannerFactoryOptions): Planner => {
  const strategy = options.config.planner.strategy
  if (strategy === 'legacy-prd') {
    return createLegacyPrdPlanner({ clock: options.clock })
  }

  const subagentRegistry =
    options.subagentRegistry ??
    new SubagentRegistry(
      (options.config.subagents.manifests ?? []).map(manifest => ({
        manifest
      }))
    )

  const intentResolver = new IntentResolver({
    classifier: new IntentClassifierSkill({
      settings: {
        model: options.config.runtime.defaultModel,
        temperature: options.config.runtime.defaultTemperature,
        maxTokens: options.config.runtime.maxOutputTokens
      }
    }),
    subagentRegistry
  })

  return new IntelligentPlanner({
    config: options.config,
    clock: options.clock,
    subagentRegistry,
    registeredSubagents: options.subagents ?? [],
    intentResolver,
    coreBuilders: options.coreBuilders
  })
}

export { IntelligentPlanner, IntentResolver }
