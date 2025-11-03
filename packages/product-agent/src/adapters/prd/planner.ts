import type { Planner, PlanDraft, PlanRefinementInput } from '../../contracts/planner'
import type { PlanGraph } from '../../contracts/core'
import type { RunContext } from '../../contracts/core'
import type { SectionRoutingRequest, SectionName } from '@product-agents/prd-shared'
import { ALL_SECTION_NAMES } from '@product-agents/prd-shared'

export type PrdPlanTask =
  | {
      kind: 'clarification-check'
    }
  | {
      kind: 'analyze-context'
    }
  | {
      kind: 'write-section'
      section: SectionName
    }
  | {
      kind: 'assemble-prd'
    }

type PrdRunContext = RunContext<SectionRoutingRequest>

const PLAN_VERSION = '2.1.0'

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
    const runInput = context.request.input

    const isSectionName = (value: string): value is SectionName =>
      (ALL_SECTION_NAMES as readonly string[]).includes(value)
    const validSections = ALL_SECTION_NAMES as readonly SectionName[]
    const requestedSections =
      runInput?.targetSections && runInput.targetSections.length > 0
        ? runInput.targetSections.filter(isSectionName)
        : [...validSections]

    const sectionNodes: Record<string, ReturnType<PrdPlanner['createSectionNode']>> = {}
    const sectionIds: string[] = []

    requestedSections.forEach((section: SectionName) => {
      const nodeId = `write-${section}`
      sectionIds.push(nodeId)
      sectionNodes[nodeId] = this.createSectionNode(section)
    })

    const plan: PlanGraph<PrdPlanTask> = {
      id: `plan-${context.runId}`,
      artifactKind: context.request.artifactKind,
      entryId: 'clarification-check',
      createdAt,
      version: PLAN_VERSION,
      nodes: {
        'clarification-check': {
          id: 'clarification-check',
          label: 'Check prompt for clarification needs',
          task: { kind: 'clarification-check' },
          status: 'pending',
          dependsOn: [],
          metadata: {
            skillId: 'prd.check-clarification'
          }
        },
        'analyze-context': {
          id: 'analyze-context',
          label: 'Analyze product context',
          task: { kind: 'analyze-context' },
          status: 'pending',
          dependsOn: ['clarification-check'],
          metadata: {
            skillId: 'prd.analyze-context'
          }
        },
        ...sectionIds.reduce<Record<string, typeof sectionNodes[string]>>((acc, nodeId) => {
          acc[nodeId] = {
            ...sectionNodes[nodeId],
            dependsOn: ['analyze-context']
          }
          return acc
        }, {}),
        'assemble-prd': {
          id: 'assemble-prd',
          label: 'Assemble Product Requirements Document',
          task: { kind: 'assemble-prd' },
          status: 'pending',
          dependsOn:
            sectionIds.length > 0
              ? sectionIds
              : ['analyze-context'],
          metadata: {
            skillId: 'prd.assemble-prd'
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

  private createSectionNode(section: SectionName) {
    return {
      id: `write-${section}`,
      label: `Write ${section} section`,
      task: {
        kind: 'write-section',
        section
      } as PrdPlanTask,
      status: 'pending' as const,
      dependsOn: [] as string[],
      metadata: {
        skillId: `prd.write-${section}`
      }
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
