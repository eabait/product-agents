import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { withSpan } from '@product-agents/observability'
import type { AgentSettings } from '@product-agents/agent-core'
import type {
  ResearchPlan,
  ResearchStep,
  ResearchStepType,
  ClarificationQuestion
} from '../contracts/research-plan'
import type { ResearchFocusArea, ResearchDepth } from '../contracts/research-params'
import {
  createAnalyzeRequestPrompt,
  createGeneratePlanPrompt,
  type PlanningPromptInput
} from '../prompts/research-planning'

export interface PlannerInput {
  query: string
  industry?: string
  region?: string
  timeframe?: string
  focusAreas?: ResearchFocusArea[]
  depth: ResearchDepth
  existingContext?: string
  clarificationAnswers?: Record<string, string>
  /** Runtime settings override - if provided, used instead of construction-time settings */
  settings?: AgentSettings
}

export interface PlanResult {
  plan: ResearchPlan
  needsClarification: boolean
  clarificationQuestions?: ClarificationQuestion[]
  clarificationContext?: string
}

const AnalysisResultSchema = z.object({
  topic: z.string(),
  scope: z.string(),
  needsClarification: z.boolean(),
  clarificationQuestions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string(),
        context: z.string().optional(),
        required: z.boolean().default(false),
        options: z.array(z.string()).optional()
      })
    )
    .optional(),
  clarificationContext: z.string().optional(),
  suggestedObjectives: z.array(z.string()),
  suggestedStepTypes: z.array(z.string()),
  estimatedComplexity: z.enum(['simple', 'moderate', 'complex'])
})

const GeneratedPlanSchema = z.object({
  steps: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      label: z.string(),
      description: z.string(),
      queries: z.array(z.string()),
      estimatedSources: z.number().optional(),
      dependsOn: z.array(z.string()).default([])
    })
  )
})

export interface ResearchPlannerOptions {
  settings: AgentSettings
  clock?: () => Date
  idFactory?: () => string
}

export class ResearchPlanner {
  private readonly client: OpenRouterClient
  private readonly settings: AgentSettings
  private readonly clock: () => Date
  private readonly idFactory: () => string

  constructor(options: ResearchPlannerOptions) {
    this.settings = options.settings
    this.client = new OpenRouterClient(options.settings.apiKey)
    this.clock = options.clock ?? (() => new Date())
    this.idFactory = options.idFactory ?? (() => `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  }

  async createPlan(input: PlannerInput): Promise<PlanResult> {
    // Use runtime settings if provided, otherwise fall back to construction-time settings
    const effectiveSettings = input.settings ?? this.settings
    const promptInput = this.buildPromptInput(input)

    const analysis = await this.analyzeRequest(promptInput, effectiveSettings)

    if (analysis.needsClarification && !input.clarificationAnswers) {
      return {
        plan: this.createDraftPlan(input, analysis),
        needsClarification: true,
        clarificationQuestions: analysis.clarificationQuestions,
        clarificationContext: analysis.clarificationContext
      }
    }

    const plan = await this.generateFullPlan(input, analysis, effectiveSettings)

    return {
      plan,
      needsClarification: false
    }
  }

  private buildPromptInput(input: PlannerInput): PlanningPromptInput {
    let existingContext = input.existingContext ?? ''

    if (input.clarificationAnswers && Object.keys(input.clarificationAnswers).length > 0) {
      const answersText = Object.entries(input.clarificationAnswers)
        .map(([q, a]) => `Q: ${q}\nA: ${a}`)
        .join('\n\n')
      existingContext = existingContext
        ? `${existingContext}\n\nClarification answers:\n${answersText}`
        : `Clarification answers:\n${answersText}`
    }

    return {
      query: input.query,
      industry: input.industry,
      region: input.region,
      timeframe: input.timeframe,
      focusAreas: input.focusAreas,
      depth: input.depth,
      existingContext: existingContext || undefined
    }
  }

  private async analyzeRequest(
    input: PlanningPromptInput,
    settings: AgentSettings
  ): Promise<z.infer<typeof AnalysisResultSchema>> {
    return withSpan(
      {
        name: 'analyze-request',
        type: 'plan',
        input: { query: input.query, depth: input.depth },
        metadata: { model: settings.model }
      },
      async () => {
        const prompt = createAnalyzeRequestPrompt(input)

        const result = await this.client.generateStructured({
          model: settings.model,
          schema: AnalysisResultSchema,
          prompt,
          temperature: settings.temperature ?? 0.3,
          maxTokens: settings.maxTokens ?? 4000
        })

        return result
      }
    )
  }

  private createDraftPlan(
    input: PlannerInput,
    analysis: z.infer<typeof AnalysisResultSchema>
  ): ResearchPlan {
    return {
      id: this.idFactory(),
      topic: analysis.topic,
      scope: analysis.scope,
      objectives: analysis.suggestedObjectives,
      steps: [],
      clarificationQuestions: analysis.clarificationQuestions,
      status: 'awaiting-clarification',
      createdAt: this.clock().toISOString()
    }
  }

  private async generateFullPlan(
    input: PlannerInput,
    analysis: z.infer<typeof AnalysisResultSchema>,
    settings: AgentSettings
  ): Promise<ResearchPlan> {
    return withSpan(
      {
        name: 'generate-plan',
        type: 'plan',
        input: { topic: analysis.topic, depth: input.depth },
        metadata: { model: settings.model }
      },
      async () => {
        const promptInput = this.buildPromptInput(input)
        const prompt = createGeneratePlanPrompt(promptInput, {
          topic: analysis.topic,
          scope: analysis.scope,
          suggestedObjectives: analysis.suggestedObjectives,
          suggestedStepTypes: analysis.suggestedStepTypes
        })

        const generatedPlan = await this.client.generateStructured({
          model: settings.model,
          schema: GeneratedPlanSchema,
          prompt,
          temperature: settings.temperature ?? 0.3,
          maxTokens: settings.maxTokens ?? 6000
        })

        const steps = this.normalizeSteps(generatedPlan.steps)
        const estimatedSources = steps.reduce((sum, s) => sum + (s.estimatedSources ?? 8), 0)
        const estimatedDuration = this.estimateDuration(steps.length, input.depth)

        return {
          id: this.idFactory(),
          topic: analysis.topic,
          scope: analysis.scope,
          objectives: analysis.suggestedObjectives,
          steps,
          estimatedDuration,
          estimatedSources,
          status: 'draft',
          createdAt: this.clock().toISOString()
        }
      }
    )
  }

  private normalizeSteps(
    rawSteps: z.infer<typeof GeneratedPlanSchema>['steps']
  ): ResearchStep[] {
    const validTypes: ResearchStepType[] = [
      'web-search',
      'competitor-analysis',
      'market-sizing',
      'trend-analysis',
      'user-research-synthesis',
      'regulatory-scan',
      'opportunity-analysis'
    ]

    const normalizedSteps = rawSteps.map((step, index) => {
      const normalizedType = validTypes.includes(step.type as ResearchStepType)
        ? (step.type as ResearchStepType)
        : 'web-search'

      return {
        id: step.id || `step-${index + 1}`,
        type: normalizedType,
        label: step.label,
        description: step.description,
        queries: step.queries.slice(0, 5),
        estimatedSources: step.estimatedSources ?? 8,
        dependsOn: step.dependsOn
      }
    })

    return this.optimizeDependencies(normalizedSteps)
  }

  /**
   * Optimize step dependencies for parallel execution.
   * Removes unnecessary dependencies between steps that can safely run in parallel.
   */
  private optimizeDependencies(steps: ResearchStep[]): ResearchStep[] {
    // Step types that can typically run in parallel (independent research)
    const parallelizableTypes = new Set<ResearchStepType>([
      'market-sizing',
      'competitor-analysis',
      'trend-analysis',
      'regulatory-scan',
      'web-search'
    ])

    // Step types that typically need prior findings (synthesis/analysis steps)
    const synthesisDependentTypes = new Set<ResearchStepType>([
      'opportunity-analysis',
      'user-research-synthesis'
    ])

    const stepMap = new Map(steps.map(s => [s.id, s]))

    return steps.map(step => {
      // Synthesis steps keep their dependencies - they need prior findings
      if (synthesisDependentTypes.has(step.type)) {
        return step
      }

      // For parallelizable steps, remove dependencies on other parallelizable steps
      if (parallelizableTypes.has(step.type)) {
        const optimizedDeps = step.dependsOn.filter(depId => {
          const depStep = stepMap.get(depId)
          if (!depStep) return false

          // Keep dependency if the dependent step is a synthesis step
          // (parallelizable step might depend on a synthesis step's output)
          return synthesisDependentTypes.has(depStep.type)
        })

        if (optimizedDeps.length !== step.dependsOn.length) {
          return { ...step, dependsOn: optimizedDeps }
        }
      }

      return step
    })
  }

  private estimateDuration(stepsCount: number, depth: ResearchDepth): string {
    const baseMinutes = {
      quick: 1,
      standard: 2,
      deep: 3
    }

    const totalMinutes = stepsCount * baseMinutes[depth]

    if (totalMinutes < 2) {
      return '1-2 minutes'
    } else if (totalMinutes <= 5) {
      return `${totalMinutes - 1}-${totalMinutes + 1} minutes`
    } else {
      return `${totalMinutes - 2}-${totalMinutes + 2} minutes`
    }
  }
}
