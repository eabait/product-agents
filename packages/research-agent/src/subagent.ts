import { randomUUID } from 'node:crypto'
import type {
  Artifact,
  ProgressEvent,
  SubagentLifecycle,
  SubagentManifest,
  SubagentRequest,
  SubagentResult
} from '@product-agents/product-agent'
import type { AgentSettings } from '@product-agents/agent-core'

import type { ResearchArtifactData } from './contracts/research-artifact'
import type { ResearchPlan } from './contracts/research-plan'
import type { ResearchBuilderParams, ResearchBuilderParamsWithPlan } from './contracts/research-params'
import { ResearchPlanner, type PlanResult } from './planner/research-planner'
import { ResearchExecutor, type ResearchExecutionResult } from './executor/research-executor'
import { ResearchSynthesizer } from './synthesizer/research-synthesizer'
import { TavilySearchAdapter } from './executor/tavily-search-adapter'
import { RESEARCH_AGENT_VERSION } from './version'

export const researchAgentManifest: SubagentManifest = {
  id: 'research.core.agent',
  package: '@product-agents/research-agent',
  version: RESEARCH_AGENT_VERSION,
  label: 'Research Agent',
  description:
    'Conducts market research, competitor analysis, and contextual intelligence gathering with web search capabilities.',
  creates: 'research',
  consumes: ['prompt', 'prd', 'brief'],
  capabilities: ['plan', 'search', 'synthesize', 'clarify'],
  entry: '@product-agents/research-agent',
  exportName: 'createResearchAgentSubagent',
  tags: ['research', 'market-intelligence', 'web-search']
}

const STATUS_AWAITING_PLAN_CONFIRMATION = 'awaiting-plan-confirmation'
const STATUS_AWAITING_CLARIFICATION = 'awaiting-clarification'

export interface CreateResearchAgentOptions {
  settings?: AgentSettings
  tavilyApiKey?: string
  clock?: () => Date
  idFactory?: () => string
}

function createProgressEvent(
  type: string,
  runId: string,
  payload: Record<string, unknown>,
  message?: string
): ProgressEvent {
  return {
    type: type as ProgressEvent['type'],
    timestamp: new Date().toISOString(),
    runId,
    payload,
    message
  }
}

function extractQueryFromRequest(request: SubagentRequest<ResearchBuilderParams>): string {
  if (request.params?.query) {
    return request.params.query
  }

  const input = request.run.request.input as { message?: string } | undefined
  if (input?.message) {
    return input.message
  }

  if (request.sourceArtifact?.data) {
    const data = request.sourceArtifact.data as Record<string, unknown>
    if (typeof data.summary === 'string') {
      return `Research for: ${data.summary}`
    }
    if (typeof data.title === 'string') {
      return `Research for: ${data.title}`
    }
  }

  return 'General market research'
}

function extractContextFromRequest(request: SubagentRequest<ResearchBuilderParams>): string | undefined {
  const parts: string[] = []

  if (request.params?.description) {
    parts.push(request.params.description)
  }

  if (request.sourceArtifact?.data) {
    const data = request.sourceArtifact.data as Record<string, unknown>
    if (typeof data.executiveSummary === 'string') {
      parts.push(`Source artifact summary: ${data.executiveSummary}`)
    }
  }

  if (request.params?.contextPayload) {
    const ctx = request.params.contextPayload as Record<string, unknown>
    if (typeof ctx.selectedMessages === 'object' && Array.isArray(ctx.selectedMessages)) {
      const messages = ctx.selectedMessages
        .filter((m: any) => typeof m?.content === 'string')
        .map((m: any) => m.content)
        .join('\n')
      if (messages) {
        parts.push(`Conversation context:\n${messages}`)
      }
    }
  }

  return parts.length > 0 ? parts.join('\n\n') : undefined
}

function createPendingArtifact(
  id: string,
  createdAt: Date,
  topic: string,
  status: string,
  plan?: ResearchPlan
): Artifact<Partial<ResearchArtifactData>> {
  return {
    id,
    kind: 'research',
    version: '1.0.0',
    label: `Research: ${topic}`,
    data: {
      topic,
      scope: plan?.scope ?? 'Pending clarification',
      executiveSummary: '',
      findings: [],
      recommendations: [],
      limitations: [],
      methodology: {
        searchQueries: [],
        sourcesConsulted: 0,
        sourcesUsed: 0,
        synthesisModel: '',
        searchProvider: 'tavily'
      },
      generatedAt: createdAt.toISOString()
    },
    metadata: {
      createdAt: createdAt.toISOString(),
      tags: ['research', 'pending'],
      extras: {
        status,
        plan
      }
    }
  }
}

export const createResearchAgentSubagent = (
  options?: CreateResearchAgentOptions
): SubagentLifecycle<ResearchBuilderParams, unknown, ResearchArtifactData> => {
  const clock = options?.clock ?? (() => new Date())
  const idFactory = options?.idFactory ?? (() => randomUUID())

  const defaultSettings: AgentSettings = {
    model: process.env.DEFAULT_MODEL ?? 'openai/gpt-4o-mini',
    temperature: 0.2,
    maxTokens: 4000
  }

  const settings = options?.settings ?? defaultSettings
  const tavilyApiKey = options?.tavilyApiKey ?? process.env.TAVILY_API_KEY
  if (!tavilyApiKey) {
    console.warn('[research-agent] TAVILY_API_KEY not set - web search will fail')
  }

  const planner = new ResearchPlanner({
    settings,
    clock,
    idFactory: () => `plan-${idFactory()}`
  })

  const webSearchAdapter = new TavilySearchAdapter({
    apiKey: tavilyApiKey ?? ''
  })

  const executor = new ResearchExecutor({
    webSearchAdapter
  })

  const synthesizer = new ResearchSynthesizer({
    settings
  })

  return {
    metadata: {
      id: researchAgentManifest.id,
      label: researchAgentManifest.label,
      version: researchAgentManifest.version,
      artifactKind: researchAgentManifest.creates,
      sourceKinds: researchAgentManifest.consumes,
      description: researchAgentManifest.description,
      tags: researchAgentManifest.capabilities
    },

    async execute(
      request: SubagentRequest<ResearchBuilderParams>
    ): Promise<SubagentResult<ResearchArtifactData>> {
      const params = request.params ?? ({} as ResearchBuilderParams)
      const emit = request.emit ?? (() => {})
      const runId = request.run.runId

      const query = extractQueryFromRequest(request)
      const existingContext = extractContextFromRequest(request)

      emit(
        createProgressEvent(
          'research.planning.started',
          runId,
          { query },
          'Analyzing research request and creating plan...'
        )
      )

      const planResult: PlanResult = await planner.createPlan({
        query,
        industry: params.industry,
        region: params.region,
        timeframe: params.timeframe,
        focusAreas: params.focusAreas,
        depth: params.depth ?? 'standard',
        existingContext,
        clarificationAnswers: params.clarificationAnswers
      })

      if (planResult.needsClarification && planResult.clarificationQuestions?.length) {
        emit(
          createProgressEvent(
            'research.clarification.needed',
            runId,
            {
              status: STATUS_AWAITING_CLARIFICATION,
              clarification: {
                questions: planResult.clarificationQuestions,
                context: planResult.clarificationContext
              },
              plan: planResult.plan
            },
            'Clarification needed before proceeding'
          )
        )

        return {
          artifact: createPendingArtifact(
            `research-${idFactory()}`,
            clock(),
            planResult.plan.topic,
            STATUS_AWAITING_CLARIFICATION,
            planResult.plan
          ) as Artifact<ResearchArtifactData>,
          metadata: {
            status: STATUS_AWAITING_CLARIFICATION,
            clarificationQuestions: planResult.clarificationQuestions,
            plan: planResult.plan
          }
        }
      }

      const requirePlanConfirmation = params.requirePlanConfirmation ?? true
      const approvedPlan = (params as ResearchBuilderParamsWithPlan).approvedPlan

      if (requirePlanConfirmation && !approvedPlan) {
        emit(
          createProgressEvent(
            'research.plan.created',
            runId,
            {
              status: STATUS_AWAITING_PLAN_CONFIRMATION,
              plan: planResult.plan
            },
            'Research plan ready for review'
          )
        )

        return {
          artifact: createPendingArtifact(
            `research-${idFactory()}`,
            clock(),
            planResult.plan.topic,
            STATUS_AWAITING_PLAN_CONFIRMATION,
            planResult.plan
          ) as Artifact<ResearchArtifactData>,
          metadata: {
            status: STATUS_AWAITING_PLAN_CONFIRMATION,
            plan: planResult.plan
          }
        }
      }

      const plan: ResearchPlan = approvedPlan ?? planResult.plan

      emit(
        createProgressEvent(
          'research.execution.started',
          runId,
          {
            planId: plan.id,
            stepsCount: plan.steps.length,
            estimatedSources: plan.estimatedSources
          },
          `Executing research plan with ${plan.steps.length} steps...`
        )
      )

      const executionResults: ResearchExecutionResult = await executor.execute(plan, {
        maxTotalSources: params.maxSources ?? 20,
        onStepStarted: step => {
          emit(
            createProgressEvent(
              'research.step.started',
              runId,
              {
                stepId: step.id,
                stepLabel: step.label,
                stepType: step.type
              },
              `Starting: ${step.label}`
            )
          )
        },
        onStepProgress: (step, progress, sourcesFound) => {
          emit(
            createProgressEvent(
              'research.step.progress',
              runId,
              {
                stepId: step.id,
                progress,
                sourcesFound
              },
              `${step.label}: ${progress}% complete (${sourcesFound} sources)`
            )
          )
        },
        onStepCompleted: (step, result) => {
          emit(
            createProgressEvent(
              'research.step.completed',
              runId,
              {
                stepId: step.id,
                sourcesFound: result.sources.length,
                executionTimeMs: result.executionTimeMs
              },
              `Completed: ${step.label} (${result.sources.length} sources)`
            )
          )
        }
      })

      emit(
        createProgressEvent(
          'research.synthesis.started',
          runId,
          {
            totalSources: executionResults.uniqueSourcesCount,
            executionTimeMs: executionResults.totalExecutionTimeMs
          },
          'Synthesizing research findings...'
        )
      )

      const synthesizedData = await synthesizer.synthesize({
        plan,
        executionResults,
        params
      })

      const artifactId = `research-${idFactory()}`
      const generatedAt = clock().toISOString()

      const artifact: Artifact<ResearchArtifactData> = {
        id: artifactId,
        kind: 'research',
        version: '1.0.0',
        label: `Research: ${plan.topic}`,
        data: {
          topic: synthesizedData.topic,
          scope: synthesizedData.scope,
          executiveSummary: synthesizedData.executiveSummary,
          findings: synthesizedData.findings,
          competitors: synthesizedData.competitors,
          marketInsights: synthesizedData.marketInsights,
          recommendations: synthesizedData.recommendations,
          limitations: synthesizedData.limitations,
          methodology: synthesizedData.methodology,
          generatedAt
        },
        metadata: {
          createdAt: generatedAt,
          createdBy: request.run.request.createdBy,
          tags: ['research', 'synthesized'],
          confidence: synthesizedData.overallConfidence,
          extras: {
            status: 'completed',
            sourceArtifactId: request.sourceArtifact?.id,
            planId: plan.id,
            sourcesConsulted: synthesizedData.methodology.sourcesConsulted,
            findingsCount: synthesizedData.findings.length
          }
        }
      }

      emit(
        createProgressEvent(
          'research.completed',
          runId,
          {
            artifactId,
            findingsCount: synthesizedData.findings.length,
            sourcesUsed: synthesizedData.methodology.sourcesUsed,
            confidence: synthesizedData.overallConfidence
          },
          `Research completed with ${synthesizedData.findings.length} findings from ${synthesizedData.methodology.sourcesUsed} sources`
        )
      )

      return {
        artifact,
        metadata: {
          status: 'completed',
          planId: plan.id,
          sourcesConsulted: synthesizedData.methodology.sourcesConsulted,
          findingsCount: synthesizedData.findings.length,
          confidence: synthesizedData.overallConfidence
        }
      }
    }
  }
}
