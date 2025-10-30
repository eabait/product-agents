import type { SkillRunner, SkillRequest, SkillResult } from '../../contracts/skill-runner'
import type { Artifact } from '../../contracts/core'
import type { PrdPlanTask } from './planner'
import type { SectionRoutingRequest, SectionRoutingResponse, ConfidenceAssessment } from '@product-agents/prd-agent'
import type { AgentSettings } from '@product-agents/agent-core'

interface LegacyOrchestrator {
  generateSectionsWithProgress(
    request: SectionRoutingRequest,
    onProgress?: (event: unknown) => void
  ): Promise<SectionRoutingResponse>
}

type OrchestratorFactory = (settings: Partial<AgentSettings>) => Promise<LegacyOrchestrator>

interface PrdSkillRunnerOptions {
  createAgent?: OrchestratorFactory
  fallbackModel?: string | null
  clock?: () => Date
}

type PrdSkillRequest = SkillRequest<PrdPlanTask, SectionRoutingResponse>

const confidenceLevelToScore = (assessment?: ConfidenceAssessment): number | undefined => {
  if (!assessment) {
    return undefined
  }

  switch (assessment.level) {
    case 'high':
      return 0.9
    case 'medium':
      return 0.6
    case 'low':
      return 0.3
    default:
      return undefined
  }
}

const buildArtifact = (
  runId: string,
  artifactKind: string,
  response: SectionRoutingResponse,
  createdBy: string,
  clock: () => Date
): Artifact<SectionRoutingResponse> => ({
  id: `artifact-${runId}`,
  kind: artifactKind,
  version: response.metadata?.overall_confidence ? '2.0' : '1.0',
  label: 'Product Requirements Document',
  data: response,
  metadata: {
    createdAt: clock().toISOString(),
    createdBy,
    tags: response.metadata?.sections_updated ?? [],
    confidence: confidenceLevelToScore(response.metadata?.overall_confidence),
    usage: response.metadata?.usage ? { ...response.metadata.usage } : undefined,
    extras: {
      validation: response.validation,
      confidenceAssessments: response.metadata?.confidence_assessments,
      shouldRegenerate: response.metadata?.should_regenerate_prd,
      processingTimeMs: response.metadata?.processing_time_ms
    }
  }
})

export class PrdSkillRunner implements SkillRunner<PrdPlanTask, SectionRoutingResponse> {
  private readonly createAgent: OrchestratorFactory
  private readonly fallbackModel?: string | null
  private readonly clock: () => Date

  constructor(options?: PrdSkillRunnerOptions) {
    this.createAgent =
      options?.createAgent ??
      (async settings => {
        let module: any
        try {
          module = await import('../../../../prd-agent/agent/dist/index.js')
        } catch (error) {
          module = await import('../../../../prd-agent/agent/src/index.ts')
        }
        const Orchestrator = module.PRDOrchestratorAgent as unknown as new (
          settings?: Partial<AgentSettings>
        ) => LegacyOrchestrator
        return new Orchestrator(settings)
      })
    this.fallbackModel = options?.fallbackModel ?? null
    this.clock = options?.clock ?? (() => new Date())
  }

  async invoke(request: PrdSkillRequest): Promise<SkillResult<SectionRoutingResponse>> {
    const task = request.planNode.task as PrdPlanTask

    if (task.kind !== 'legacy-prd-run') {
      throw new Error(`Unsupported PRD task kind: ${task.kind}`)
    }

    const runInput = request.context.run.request.input as SectionRoutingRequest | undefined
    if (!runInput) {
      throw new Error('PRD run input is required to invoke the legacy orchestrator')
    }

    const apiKey =
      (request.context.run.request.attributes?.apiKey as string | undefined) ??
      process.env.OPENROUTER_API_KEY

    const orchestrator = await this.createAgent({
      model: request.context.run.settings.model,
      temperature: request.context.run.settings.temperature,
      maxTokens: request.context.run.settings.maxOutputTokens,
      apiKey,
      advanced: this.fallbackModel ? { fallbackModel: this.fallbackModel } : undefined
    })

    const response = await orchestrator.generateSectionsWithProgress(runInput)
    const artifact = buildArtifact(
      request.context.run.runId,
      request.context.run.request.artifactKind,
      response,
      request.context.run.request.createdBy,
      this.clock
    )

    return {
      output: response,
      metadata: {
        artifact
      },
      confidence: confidenceLevelToScore(response.metadata?.overall_confidence),
      usage: response.metadata?.usage ? { ...response.metadata.usage } : undefined
    }
  }
}

export const createPrdSkillRunner = (options?: PrdSkillRunnerOptions): PrdSkillRunner =>
  new PrdSkillRunner(options)
