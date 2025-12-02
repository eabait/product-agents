import {
  ClarificationAnalyzer,
  ContextAnalyzer,
  TargetUsersSectionWriter,
  SolutionSectionWriter,
  KeyFeaturesSectionWriter,
  SuccessMetricsSectionWriter,
  ConstraintsSectionWriter
} from '@product-agents/skills-prd'
import {
  type SectionRoutingRequest,
  type SectionRoutingResponse,
  type ConfidenceAssessment,
  combineConfidenceAssessments,
  SECTION_NAMES,
  type SectionName,
  DEFAULT_TEMPERATURE,
  type ClarificationResult
} from '@product-agents/prd-shared'
import type {
  SkillRunner,
  SkillRequest,
  SkillResult,
  Artifact,
  EffectiveRunSettings
} from '@product-agents/product-agent'
import type { PrdPlanTask } from './planner'
import type { AgentSettings } from '@product-agents/agent-core'

interface RunState {
  analysisResults: Map<string, any>
  sections: Record<string, any>
  confidenceAssessments: Record<string, ConfidenceAssessment>
  validationIssues: Record<string, string[]>
  startedAt: number
  clarification?: ClarificationResult
  haltReason?: string
}

interface PrdSkillRunnerOptions {
  clock?: () => Date
  fallbackModel?: string | null
  factories?: {
    createContextAnalyzer?: (settings: AgentSettings) => ContextAnalyzer
    createClarificationAnalyzer?: (settings: AgentSettings) => ClarificationAnalyzer
    createSectionWriter?: (section: SectionName, settings: AgentSettings) => {
      writeSection: TargetUsersSectionWriter['writeSection']
    }
  }
}

type PrdSkillRequest = SkillRequest<PrdPlanTask, unknown>

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

const defaultConfidence = (): ConfidenceAssessment => ({
  level: 'medium',
  reasons: ['Default confidence — no section-specific assessment available']
})

const toValidationIssues = (metadata?: Record<string, unknown>): string[] => {
  if (!metadata) {
    return []
  }
  const candidate = metadata.validation_issues
  if (Array.isArray(candidate)) {
    return candidate.filter((issue): issue is string => typeof issue === 'string')
  }
  return []
}

export class PrdSkillRunner implements SkillRunner<PrdPlanTask, unknown> {
  private readonly clock: () => Date
  private readonly fallbackModel?: string | null
  private readonly runStates = new Map<string, RunState>()
  private readonly factories: PrdSkillRunnerOptions['factories']

  constructor(options?: PrdSkillRunnerOptions) {
    this.clock = options?.clock ?? (() => new Date())
    this.fallbackModel = options?.fallbackModel ?? null
    this.factories = options?.factories
  }

  async invoke(request: PrdSkillRequest): Promise<SkillResult<unknown>> {
    const task = request.planNode.task as PrdPlanTask

    const runInput = request.context.run.request.input as SectionRoutingRequest | undefined
    if (!runInput) {
      throw new Error('PRD run input is required to execute skills')
    }

    const state = this.ensureState(request.context.run.runId)

    switch (task.kind) {
      case 'clarification-check':
        return this.runClarificationCheck(request, runInput, state)
      case 'analyze-context':
        return this.runContextAnalysis(request, runInput, state)
      case 'write-section':
        return this.runSectionWriter(request, runInput, state, task.section)
      case 'assemble-prd':
        return this.runAssembly(request, runInput, state)
      default:
        throw new Error(`Unsupported PRD task kind: ${String((task as any)?.kind)}`)
    }
  }

  private async runClarificationCheck(
    request: PrdSkillRequest,
    runInput: SectionRoutingRequest,
    state: RunState
  ): Promise<SkillResult<unknown>> {
    const analyzerFactory =
      this.factories?.createClarificationAnalyzer ??
      ((settings: AgentSettings) => new ClarificationAnalyzer(settings))
    const analyzer = analyzerFactory(this.createAgentSettings(request, runInput))
    const result = await analyzer.analyze({
      message: runInput.message,
      context: {
        contextPayload: runInput.context?.contextPayload,
        existingPRD: runInput.context?.existingPRD
      }
    })

    state.analysisResults.set(result.name, result)
    state.clarification = result.data

    const metadata: Record<string, unknown> = {
      ...(result.metadata ?? {}),
      clarification: result.data
    }

    if (result.data.needsClarification) {
      state.haltReason = 'clarification-required'
      metadata.runStatus = 'awaiting-input'
      metadata.haltReason = state.haltReason
    }

    return {
      output: result,
      confidence: confidenceLevelToScore(result.confidence),
      metadata
    }
  }

  private ensureState(runId: string): RunState {
    let state = this.runStates.get(runId)
    if (!state) {
      state = {
        analysisResults: new Map(),
        sections: {},
        confidenceAssessments: {},
        validationIssues: {},
        startedAt: this.clock().getTime()
      }
      this.runStates.set(runId, state)
    }
    return state
  }

  private createAgentSettings(
    request: PrdSkillRequest,
    runInput: SectionRoutingRequest
  ): AgentSettings {
    const runSettings = request.context.run.settings as EffectiveRunSettings
    const apiKey =
      (request.context.run.request.attributes?.apiKey as string | undefined) ??
      runInput.settings?.apiKey ??
      process.env.OPENROUTER_API_KEY

    return {
      model: runSettings.model,
      temperature: runSettings.temperature ?? DEFAULT_TEMPERATURE,
      maxTokens: runSettings.maxOutputTokens,
      apiKey,
      advanced: this.fallbackModel ? { fallbackModel: this.fallbackModel } : undefined
    }
  }

  private async runContextAnalysis(
    request: PrdSkillRequest,
    runInput: SectionRoutingRequest,
    state: RunState
  ): Promise<SkillResult<unknown>> {
    const analyzerFactory =
      this.factories?.createContextAnalyzer ??
      ((settings: AgentSettings) => new ContextAnalyzer(settings))
    const analyzer = analyzerFactory(this.createAgentSettings(request, runInput))
    const result = await analyzer.analyze({
      message: runInput.message,
      context: {
        contextPayload: runInput.context?.contextPayload,
        existingPRD: runInput.context?.existingPRD
      }
    })

    state.analysisResults.set(result.name, result)

    return {
      output: result,
      confidence: confidenceLevelToScore(result.confidence),
      metadata: result.metadata
    }
  }

  private getExistingSection(
    runInput: SectionRoutingRequest,
    section: SectionName
  ): unknown {
    const existing = runInput.context?.existingPRD
    if (!existing) {
      return undefined
    }

    if (existing.sections && typeof existing.sections === 'object') {
      const candidate = (existing.sections as Record<string, unknown>)[section]
      if (candidate !== undefined) {
        return candidate
      }
    }

    return (existing as Record<string, unknown>)[section]
  }

  private createSectionWriter(section: SectionName, settings: AgentSettings) {
    if (this.factories?.createSectionWriter) {
      const custom = this.factories.createSectionWriter(section, settings)
      if (custom) {
        return custom
      }
    }

    switch (section) {
      case SECTION_NAMES.TARGET_USERS:
        return new TargetUsersSectionWriter(settings)
      case SECTION_NAMES.SOLUTION:
        return new SolutionSectionWriter(settings)
      case SECTION_NAMES.KEY_FEATURES:
        return new KeyFeaturesSectionWriter(settings)
      case SECTION_NAMES.SUCCESS_METRICS:
        return new SuccessMetricsSectionWriter(settings)
      case SECTION_NAMES.CONSTRAINTS:
        return new ConstraintsSectionWriter(settings)
      default:
        throw new Error(`Unknown section '${section}'`)
    }
  }

  private async runSectionWriter(
    request: PrdSkillRequest,
    runInput: SectionRoutingRequest,
    state: RunState,
    section: SectionName
  ): Promise<SkillResult<unknown>> {
    const writer = this.createSectionWriter(section, this.createAgentSettings(request, runInput))

    const sharedResults = new Map<string, any>()
    state.analysisResults.forEach((value, key) => {
      sharedResults.set(key, value)
    })

    const existingSection = this.getExistingSection(runInput, section)

    const result = await writer.writeSection({
      message: runInput.message,
      context: {
        contextPayload: runInput.context?.contextPayload,
        existingPRD: runInput.context?.existingPRD,
        existingSection,
        targetSection: section,
        sharedAnalysisResults: sharedResults
      }
    })

    state.sections[section] = result.content
    if (result.confidence) {
      state.confidenceAssessments[section] = result.confidence
    }
    const issues = toValidationIssues(result.metadata)
    if (issues.length > 0) {
      state.validationIssues[section] = issues
    }

    return {
      output: result,
      confidence: confidenceLevelToScore(result.confidence),
      metadata: result.metadata
    }
  }

  private async runAssembly(
    request: PrdSkillRequest,
    runInput: SectionRoutingRequest,
    state: RunState
  ): Promise<SkillResult<unknown>> {
    const sectionsUpdated = Object.keys(state.sections)
    const elapsedMs = this.clock().getTime() - state.startedAt

    const confidenceAssessments = Object.keys(state.confidenceAssessments).length
      ? state.confidenceAssessments
      : sectionsUpdated.reduce<Record<string, ConfidenceAssessment>>((acc, section) => {
          acc[section] = defaultConfidence()
          return acc
        }, {})

    const overallConfidence = Object.keys(confidenceAssessments).length
      ? combineConfidenceAssessments(confidenceAssessments)
      : defaultConfidence()

    const allIssues = Object.values(state.validationIssues).flat()
    const baseSections =
      runInput.context?.existingPRD?.sections &&
      typeof runInput.context.existingPRD.sections === 'object'
        ? { ...(runInput.context.existingPRD.sections as Record<string, unknown>) }
        : {}

    const responseSections = { ...baseSections, ...state.sections }

    const response: SectionRoutingResponse = {
      sections: responseSections,
      metadata: {
        sections_updated: sectionsUpdated,
        confidence_assessments: confidenceAssessments,
        overall_confidence: overallConfidence,
        processing_time_ms: elapsedMs,
        should_regenerate_prd: true
      },
      validation: {
        is_valid: allIssues.length === 0,
        issues: allIssues,
        warnings: []
      }
    }

    const artifact = this.buildArtifact(
      request.context.run.runId,
      request.context.run.request.artifactKind,
      response,
      request.context.run.request.createdBy
    )

    // Cleanup run state after assembling the artifact
    this.runStates.delete(request.context.run.runId)

    return {
      output: response,
      confidence: confidenceLevelToScore(overallConfidence),
      metadata: {
        artifact
      }
    }
  }

  private buildArtifact(
    runId: string,
    artifactKind: string,
    response: SectionRoutingResponse,
    createdBy: string
  ): Artifact<SectionRoutingResponse> {
    return {
      id: `artifact-${runId}`,
      kind: artifactKind,
      version: response.metadata?.overall_confidence ? '2.0' : '1.0',
      label: 'Product Requirements Document',
      data: response,
      metadata: {
        createdAt: this.clock().toISOString(),
        createdBy,
        tags: response.metadata?.sections_updated ?? [],
        confidence: confidenceLevelToScore(response.metadata?.overall_confidence),
        extras: {
          validation: response.validation,
          confidenceAssessments: response.metadata?.confidence_assessments,
          shouldRegenerate: response.metadata?.should_regenerate_prd,
          processingTimeMs: response.metadata?.processing_time_ms
        }
      }
    }
  }
}

export const createPrdSkillRunner = (options?: PrdSkillRunnerOptions): PrdSkillRunner =>
  new PrdSkillRunner(options)
