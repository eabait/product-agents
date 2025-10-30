import type { Planner, PlanDraft, PlanRefinementInput } from '../../contracts/planner'
import type { PlanGraph } from '../../contracts/core'
import type { RunContext } from '../../contracts/core'

export interface PrdPlanTask {
  kind: 'legacy-prd-run'
  description: string
}

type PrdRunContext = RunContext

const PLAN_VERSION = '1.0.0'

interface PrdPlannerOptions {
  clock?: () => Date
}

export class PrdPlanner implements Planner<PrdPlanTask> {
  private readonly clock: () => Date

  constructor(options?: PrdPlannerOptions) {
    this.clock = options?.clock ?? (() => new Date())
  }

  async createPlan(context: PrdRunContext): Promise<PlanDraft<PrdPlanTask>> {
    const createdAt = this.clock()
    const plan: PlanGraph<PrdPlanTask> = {
      id: `plan-${context.runId}`,
      artifactKind: context.request.artifactKind,
      entryId: 'legacy-prd-run',
      createdAt,
      version: PLAN_VERSION,
      nodes: {
        'legacy-prd-run': {
          id: 'legacy-prd-run',
          label: 'Generate PRD using legacy orchestrator',
          task: {
            kind: 'legacy-prd-run',
            description: 'Invokes the existing PRD orchestrator to build sections'
          },
          status: 'pending',
          dependsOn: [],
          metadata: {
            skillId: 'prd.legacy-orchestrator'
          }
        }
      },
      metadata: {
        source: 'prd-adapter'
      }
    }

    return {
      plan,
      context
    }
  }

  async refinePlan(
    input: PlanRefinementInput<PrdPlanTask>
  ): Promise<PlanDraft<PrdPlanTask>> {
    return {
      plan: input.currentPlan,
      context: input.context
    }
  }
}

export const createPrdPlanner = (options?: PrdPlannerOptions): PrdPlanner =>
  new PrdPlanner(options)
