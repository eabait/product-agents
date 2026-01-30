import { randomUUID } from 'node:crypto'
import { generateText } from 'ai'
import {
  withSpan,
  createStepSpan,
  createSubagentSpan,
  createPlanSpan,
  createApprovalSpan,
  getObservabilityTransport,
  isObservabilityEnabled,
  recordGeneration,
  getActiveTraceId,
  getActiveSpanId
} from '@product-agents/observability'

import type {
  AgentController,
  ControllerComposition,
  ControllerRunSummary,
  ControllerStartOptions,
  ControllerStartRequest
} from '../contracts/controller'
import type { ProgressEvent, RunContext, PlanGraph, RunStatus } from '../contracts/core'
import type { SkillResult, SkillRunner } from '../contracts/skill-runner'
import type { VerificationResult, Verifier } from '../contracts/verifier'
import type { ProductAgentConfig, ProductAgentApiOverrides } from '../config/product-agent.config'
import { resolveRunSettings } from '../config/product-agent.config'
import type { Artifact, ArtifactKind, PlanNode, StepId } from '../contracts/core'
import type { ArtifactIntent } from '../contracts/intent'
import type { WorkspaceDAO, WorkspaceEvent, WorkspaceHandle } from '../contracts/workspace'
import type { Planner } from '../contracts/planner'
import type { ClarificationResult, SectionRoutingRequest } from '@product-agents/prd-shared'
import type { SubagentLifecycle, SubagentRunSummary } from '../contracts/subagent'
import type { SubagentRegistry } from '../subagents/subagent-registry'
import { createOpenRouterProvider, resolveOpenRouterModel } from '../providers/openrouter-provider'
import { createSkillTool, createSubagentTool, type ToolExecutionResult } from '../ai/tool-adapters'
import { extractExistingArtifactsFromContext } from '../planner/existing-artifacts'

type Clock = () => Date

interface GraphControllerOptions {
  clock?: Clock
  idFactory?: () => string
  workspaceOverrides?: {
    persistArtifacts?: boolean
    tempSubdir?: string
  }
  subagentRegistry?: SubagentRegistry
  providerFactory?: (apiKey?: string) => ReturnType<typeof createOpenRouterProvider>
  toolInvoker?: typeof generateText
}

interface ExecutionContext {
  runContext: RunContext<unknown, WorkspaceHandle>
  plan: PlanGraph
  skillResults: SkillResult[]
  artifact?: Artifact
  verification?: VerificationResult
  status: RunStatus
  clarification?: ClarificationResult
  subagentResults: SubagentRunSummary[]
  artifactsByStep: Map<StepId, Artifact>
  artifactsByKind: Map<ArtifactKind, Artifact[]>
}

const STATUS_RUNNING: RunStatus = 'running'
const STATUS_FAILED: RunStatus = 'failed'
const STATUS_COMPLETED: RunStatus = 'completed'
const STATUS_AWAITING_INPUT: RunStatus = 'awaiting-input'

const coerceNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined
  }
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

const normalizeUsage = (usage: unknown): { promptTokens?: number; completionTokens?: number; totalTokens?: number } | undefined => {
  if (!usage || typeof usage !== 'object') {
    return undefined
  }
  const payload = usage as Record<string, unknown>
  const promptTokens = coerceNumber(
    payload.promptTokens ??
      payload.prompt_tokens ??
      payload.inputTokens ??
      payload.input_tokens ??
      payload.inputTextTokens ??
      payload.input_text_tokens
  )
  const completionTokens = coerceNumber(
    payload.completionTokens ??
      payload.completion_tokens ??
      payload.outputTokens ??
      payload.output_tokens ??
      payload.outputTextTokens ??
      payload.output_text_tokens
  )
  let totalTokens = coerceNumber(
    payload.totalTokens ?? payload.total_tokens ?? payload.tokens ?? payload.token_count
  )
  if (totalTokens === undefined && (promptTokens !== undefined || completionTokens !== undefined)) {
    totalTokens = (promptTokens ?? 0) + (completionTokens ?? 0)
  }
  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined
  }
  return { promptTokens, completionTokens, totalTokens }
}

const resolveModelId = (model: unknown): string | undefined => {
  if (typeof model === 'string') {
    return model
  }
  if (!model || typeof model !== 'object') {
    return undefined
  }
  const candidate = (model as { modelId?: unknown; id?: unknown; modelName?: unknown })
  const modelId =
    (typeof candidate.modelId === 'string' && candidate.modelId) ||
    (typeof candidate.id === 'string' && candidate.id) ||
    (typeof candidate.modelName === 'string' && candidate.modelName) ||
    undefined
  return modelId
}

const isIngestionTelemetryEnabled = (): boolean =>
  isObservabilityEnabled() && getObservabilityTransport() === 'ingestion'

const isOtelTelemetryEnabled = (): boolean =>
  isObservabilityEnabled() && getObservabilityTransport() === 'otel'

const emitEvent = (options: ControllerStartOptions | undefined, event: ProgressEvent): void => {
  if (typeof options?.emit === 'function') {
    options.emit(event)
  }
}

const toProgressEvent = (params: {
  type: ProgressEvent['type']
  runId: string
  stepId?: StepId
  status?: RunStatus
  payload?: Record<string, unknown>
  message?: string
}): ProgressEvent => ({
  type: params.type,
  timestamp: new Date().toISOString(),
  runId: params.runId,
  stepId: params.stepId,
  status: params.status,
  payload: params.payload,
  message: params.message
})

const topologicallySortPlan = (plan: PlanGraph): StepId[] => {
  const pending = new Set(Object.keys(plan.nodes))
  const resolved: StepId[] = []

  while (pending.size > 0) {
    let progress = false
    for (const stepId of pending) {
      const node = plan.nodes[stepId]
      const deps = node.dependsOn ?? []
      const isReady = deps.every(dep => resolved.includes(dep))
      if (!isReady) {
        continue
      }
      resolved.push(stepId)
      pending.delete(stepId)
      progress = true
      break
    }

    if (!progress) {
      throw new Error('Plan graph contains circular or unsatisfied dependencies')
    }
  }

  return resolved
}

const toControllerStatus = (status: RunStatus): ControllerRunSummary['status'] => {
  switch (status) {
    case STATUS_FAILED:
      return 'failed'
    case STATUS_AWAITING_INPUT:
      return 'awaiting-input'
    default:
      return 'completed'
  }
}

const extractOverrides = (request: ControllerStartRequest['request']): ProductAgentApiOverrides | undefined => {
  const candidate =
    request.attributes?.apiOverrides ??
    request.attributes?.overrides ??
    request.attributes?.runOverrides

  if (candidate && typeof candidate === 'object') {
    return candidate as ProductAgentApiOverrides
  }

  return undefined
}

const createWorkspaceEvent = (
  runId: string,
  type: WorkspaceEvent['type'],
  payload: Record<string, unknown>
): WorkspaceEvent => ({
  id: randomUUID(),
  runId,
  type,
  createdAt: new Date().toISOString(),
  payload
})

export class GraphController implements AgentController {
  readonly planner?: Planner
  readonly skillRunner: SkillRunner
  readonly verifier: Verifier
  readonly workspace: WorkspaceDAO
  readonly subagents: SubagentLifecycle[]
  readonly subagentRegistry?: SubagentRegistry

  private readonly config: ProductAgentConfig
  private readonly clock: Clock
  private readonly idFactory: () => string
  private readonly workspaceOverrides?: GraphControllerOptions['workspaceOverrides']
  private readonly runSummaries = new Map<string, ControllerRunSummary>()
  private readonly executionContexts = new Map<string, ExecutionContext>()
  private readonly providerFactory: NonNullable<GraphControllerOptions['providerFactory']>
  private readonly toolInvoker: NonNullable<GraphControllerOptions['toolInvoker']>

  constructor(
    composition: ControllerComposition,
    config: ProductAgentConfig,
    options?: GraphControllerOptions
  ) {
    this.planner = composition.planner
    this.skillRunner = composition.skillRunner
    this.verifier = composition.verifier.primary
    this.workspace = composition.workspace
    this.subagents = composition.subagents ?? []
    this.subagentRegistry = options?.subagentRegistry
    this.config = config
    this.clock = options?.clock ?? (() => new Date())
    this.idFactory = options?.idFactory ?? (() => randomUUID())
    this.workspaceOverrides = options?.workspaceOverrides
    this.providerFactory =
      options?.providerFactory ?? ((apiKey?: string) => createOpenRouterProvider(config, { apiKey }))
    this.toolInvoker = options?.toolInvoker ?? generateText
  }

  private buildTraceContext(): { traceId: string; parentSpanId?: string } | undefined {
    const traceId = getActiveTraceId()
    if (!traceId) {
      return undefined
    }
    return { traceId, parentSpanId: getActiveSpanId() }
  }

  async start<TInput, TArtifact>(
    input: ControllerStartRequest<TInput>,
    options?: ControllerStartOptions
  ): Promise<ControllerRunSummary<TArtifact>> {
    const startTime = this.clock()
    const runId = input.runId ?? this.idFactory()
    const overrides = extractOverrides(input.request)
    const settings = resolveRunSettings(this.config, overrides)
    const workspaceHandle = await this.workspace.ensureWorkspace(runId, input.request.artifactKind, {
      persistArtifacts: this.workspaceOverrides?.persistArtifacts ?? this.config.workspace.persistArtifacts,
      tempSubdir: this.workspaceOverrides?.tempSubdir ?? this.config.workspace.tempSubdir
    })

    const runContext: RunContext<TInput, WorkspaceHandle> = {
      runId,
      request: input.request,
      settings,
      workspace: workspaceHandle,
      startedAt: startTime,
      metadata: options?.metadata ? { ...options.metadata } : {},
      intentPlan: input.request.intentPlan
    }

    emitEvent(
      options,
      toProgressEvent({
        type: 'run.status',
        runId,
        status: STATUS_RUNNING,
        message: 'Run started'
      })
    )

    await this.workspace.appendEvent(
      runId,
      createWorkspaceEvent(runId, 'system', {
        message: 'Run started',
        status: STATUS_RUNNING,
        settings
      })
    )

    const existingArtifacts = extractExistingArtifactsFromContext(runContext as unknown as RunContext<SectionRoutingRequest>)

    let planDraft: { plan: PlanGraph }
    if (input.initialPlan) {
      planDraft = { plan: input.initialPlan }
    } else if (this.planner) {
      planDraft = await withSpan(
        createPlanSpan({ runId, artifactKind: input.request.artifactKind }),
        async () => this.planner!.createPlan(runContext)
      )
    } else {
      throw new Error('No plan provided and no planner configured. Use the Orchestrator to generate a plan.')
    }

    const plan = planDraft.plan
    if (runContext.metadata) {
      runContext.metadata.plan = plan
    }
    emitEvent(
      options,
      toProgressEvent({
        type: 'plan.created',
        runId,
        payload: {
          plan: {
            id: plan.id,
            artifactKind: plan.artifactKind,
            entryId: plan.entryId,
            version: plan.version,
            createdAt: plan.createdAt instanceof Date ? plan.createdAt.toISOString() : plan.createdAt,
            nodes: plan.nodes,
            metadata: plan.metadata
          }
        }
      })
    )

    await this.workspace.appendEvent(
      runId,
      createWorkspaceEvent(runId, 'plan', {
        action: 'created',
        plan
      })
    )

    const executionContext: ExecutionContext = {
      runContext,
      plan,
      skillResults: [],
      status: STATUS_RUNNING,
      subagentResults: [],
      artifactsByStep: new Map(),
      artifactsByKind: new Map(existingArtifacts.artifactsByKind)
    }

    // Store context for potential resumption (e.g., subagent approval)
    this.executionContexts.set(runId, executionContext)

    try {
      await this.executePlanWithAiTools(executionContext, options)

      if (executionContext.status === STATUS_AWAITING_INPUT) {
        // Skip verification; run awaits user clarification input
      } else {
        if (!executionContext.artifact) {
          const needsClarification =
            executionContext.runContext.intentPlan?.status === 'needs-clarification' ||
            executionContext.runContext.request.intentPlan?.status === 'needs-clarification'
          if (needsClarification) {
            executionContext.status = STATUS_AWAITING_INPUT
          } else {
            throw new Error('Run completed without producing an artifact')
          }
        } else {
          // Verification step removed (Option B) - see agent-optimization-langfuse-trace-analysis.md
          // The verification step was a no-op for most artifacts and added minimal value
          executionContext.status = STATUS_COMPLETED
        }
      }

      await this.runSubagents(executionContext, options)
    } catch (error) {
      executionContext.status = STATUS_FAILED
      await this.workspace.appendEvent(
        runId,
        createWorkspaceEvent(runId, 'system', {
          message: 'Run failed',
          error: error instanceof Error ? error.message : String(error)
        })
      )

      emitEvent(
        options,
        toProgressEvent({
          type: 'run.status',
          runId,
          status: STATUS_FAILED,
          message: error instanceof Error ? error.message : 'Run failed'
        })
      )

      const summary = this.toSummary<TArtifact>(executionContext, this.clock())
      this.runSummaries.set(runId, summary)
      throw error
    }

    const completionTime = this.clock()
    const summary = this.toSummary<TArtifact>(executionContext, completionTime)
    this.runSummaries.set(runId, summary)

    // Clean up execution context if run is fully completed (not awaiting input)
    if (executionContext.status === STATUS_COMPLETED) {
      this.executionContexts.delete(runId)
    }

    await this.workspace.appendEvent(
      runId,
      createWorkspaceEvent(runId, 'system', {
        message: executionContext.status === STATUS_COMPLETED ? 'Run completed' : 'Run awaiting input',
        status: executionContext.status
      })
    )

    emitEvent(
      options,
      toProgressEvent({
        type: 'run.status',
        runId,
        status: executionContext.status,
        message: executionContext.status === STATUS_COMPLETED ? 'Run completed' : 'Run awaiting input'
      })
    )

    return summary
  }

  async resume<TInput, TArtifact>(
    runId: string
  ): Promise<ControllerRunSummary<TArtifact>> {
    const summary = this.runSummaries.get(runId)
    if (!summary) {
      throw new Error(`Run ${runId} cannot be resumed because no prior state was recorded`)
    }
    return summary as ControllerRunSummary<TArtifact>
  }

  /**
   * Resume a run that was blocked waiting for subagent approval.
   * Re-executes the blocked subagent step with the approved plan, then continues execution.
   */
  async resumeSubagent<TArtifact>(
    runId: string,
    stepId: string,
    approvedPlan: unknown,
    options?: ControllerStartOptions
  ): Promise<ControllerRunSummary<TArtifact>> {
    // eslint-disable-next-line no-console
    console.log(`[graph-controller] resumeSubagent called for run ${runId}, step ${stepId}`)
    // eslint-disable-next-line no-console
    console.log(`[graph-controller]   - stored contexts count: ${this.executionContexts.size}`)
    // eslint-disable-next-line no-console
    console.log(`[graph-controller]   - stored context keys: [${[...this.executionContexts.keys()].join(', ')}]`)

    // Retrieve context from in-memory store
    const storedContext = this.executionContexts.get(runId)
    if (!storedContext) {
      // eslint-disable-next-line no-console
      console.error(`[graph-controller] CRITICAL: No execution context found for run ${runId}`)
      throw new Error(`Run ${runId} cannot be resumed - no execution context found`)
    }

    const context = storedContext as ExecutionContext
    // eslint-disable-next-line no-console
    console.log(`[graph-controller]   - context status: ${context.status}`)
    // eslint-disable-next-line no-console
    console.log(`[graph-controller]   - plan nodes: [${Object.keys(context.plan.nodes).join(', ')}]`)

    // Verify we're blocked on the expected step
    const blockedSubagent = context.runContext.metadata?.blockedSubagent as
      | { stepId: string; subagentId: string; status: string; plan: unknown; approvalRequestedAt?: string }
      | undefined

    // eslint-disable-next-line no-console
    console.log(`[graph-controller]   - blockedSubagent: ${blockedSubagent ? `stepId=${blockedSubagent.stepId}, subagentId=${blockedSubagent.subagentId}` : 'none'}`)

    if (!blockedSubagent || blockedSubagent.stepId !== stepId) {
      // eslint-disable-next-line no-console
      console.error(`[graph-controller] CRITICAL: Run ${runId} is not blocked on step ${stepId}`)
      throw new Error(
        `Run ${runId} is not blocked on step ${stepId}. Current blocked step: ${blockedSubagent?.stepId ?? 'none'}`
      )
    }

    // Calculate approval wait duration before clearing blocked state
    const approvalRequestedAt = blockedSubagent.approvalRequestedAt as string | undefined
    const approvalWaitMs = approvalRequestedAt
      ? Date.now() - new Date(approvalRequestedAt).getTime()
      : undefined

    // Clear blocked state
    context.status = STATUS_RUNNING
    delete context.runContext.metadata?.blockedSubagent

    // Record approval received span for observability with timing metadata
    await withSpan(
      createApprovalSpan('received', {
        subagentId: blockedSubagent.subagentId,
        stepId,
        runId,
        approvalRequestedAt,
        approvalWaitMs
      }),
      async () => ({ stepId, subagentId: blockedSubagent.subagentId, approvalWaitMs })
    )

    // eslint-disable-next-line no-console
    console.log(`[graph-controller] emitting subagent.approved event for run ${runId}`)

    // Emit approval event
    emitEvent(
      options,
      toProgressEvent({
        type: 'subagent.approved',
        runId: context.runContext.runId,
        stepId,
        payload: {
          subagentId: blockedSubagent.subagentId,
          approvedPlan
        },
        message: 'Subagent plan approved, resuming execution'
      })
    )

    // Record approval in workspace
    await this.workspace.appendEvent(
      runId,
      createWorkspaceEvent(runId, 'subagent', {
        action: 'approved',
        stepId,
        subagentId: blockedSubagent.subagentId,
        approvedPlan
      })
    )

    // Get the node and lifecycle for re-execution
    const node = context.plan.nodes[stepId]
    if (!node) {
      // eslint-disable-next-line no-console
      console.error(`[graph-controller] CRITICAL: Step ${stepId} not found in plan for run ${runId}`)
      throw new Error(`Step ${stepId} not found in plan`)
    }

    const subagentId = (node.metadata?.subagentId as string) ?? blockedSubagent.subagentId
    // eslint-disable-next-line no-console
    console.log(`[graph-controller] getting lifecycle for subagent ${subagentId}`)
    const lifecycle = await this.getSubagentLifecycle(subagentId)
    // eslint-disable-next-line no-console
    console.log(`[graph-controller] lifecycle loaded: ${lifecycle.metadata.label ?? lifecycle.metadata.id}`)

    // Re-execute the subagent with approved plan
    emitEvent(
      options,
      toProgressEvent({
        type: 'subagent.started',
        runId,
        stepId,
        payload: {
          subagentId: lifecycle.metadata.id,
          artifactKind: lifecycle.metadata.artifactKind,
          label: lifecycle.metadata.label,
          resumed: true
        },
        message: `Resuming ${lifecycle.metadata.label ?? lifecycle.metadata.id}`
      })
    )

    // Build subagent request with approved plan
    const sourceArtifact = this.resolveSubagentSourceArtifact(lifecycle, node, context)
    // eslint-disable-next-line no-console
    console.log(`[graph-controller] building subagent request with approved plan`)
    // eslint-disable-next-line no-console
    console.log(`[graph-controller]   - sourceArtifact: ${sourceArtifact?.kind ?? 'none'}`)
    // eslint-disable-next-line no-console
    console.log(`[graph-controller]   - requirePlanConfirmation: false`)

    try {
      // eslint-disable-next-line no-console
      console.log(`[graph-controller] executing subagent ${lifecycle.metadata.id} for run ${runId}`)
      const result = await withSpan(
        createSubagentSpan(lifecycle.metadata.id, lifecycle.metadata.artifactKind, {
          nodeId: node.id,
          stepId,
          subagentId: lifecycle.metadata.id,
          mode: 'resume',
          runId
        }),
        async () =>
          lifecycle.execute({
            params: {
              ...(node.inputs ?? {}),
              input: context.runContext.request.input,
              approvedPlan,
              requirePlanConfirmation: false // Don't ask for confirmation again
            },
            run: context.runContext,
            traceContext: this.buildTraceContext(),
            sourceArtifact,
            emit: (event: ProgressEvent) => {
              emitEvent(
                options,
                toProgressEvent({
                  type: 'subagent.progress',
                  runId,
                  stepId,
                  payload: { subagentId: lifecycle.metadata.id, event }
                })
              )
            }
          })
      )
      // eslint-disable-next-line no-console
      console.log(`[graph-controller] subagent ${lifecycle.metadata.id} execution completed for run ${runId}`)
      // eslint-disable-next-line no-console
      console.log(`[graph-controller]   - result artifact: ${result.artifact?.kind ?? 'none'}`)
      // eslint-disable-next-line no-console
      console.log(`[graph-controller]   - result status: ${(result.metadata as any)?.status ?? 'N/A'}`)

      // Handle the result - this time it should be completed
      await this.handleSubagentToolResult({
        result: {
          status: 'completed',
          nodeId: node.id,
          subagentId: lifecycle.metadata.id,
          artifact: result.artifact,
          metadata: result.metadata
        },
        node,
        lifecycle,
        context,
        options
      })
    } catch (error) {
      emitEvent(
        options,
        toProgressEvent({
          type: 'subagent.failed',
          runId,
          stepId,
          payload: {
            subagentId: lifecycle.metadata.id,
            error: error instanceof Error ? error.message : String(error)
          },
          message: `${lifecycle.metadata.label ?? lifecycle.metadata.id} failed`
        })
      )
      throw error
    }

    // If execution paused again (another approval needed), return early
    if (context.status === STATUS_AWAITING_INPUT) {
      // eslint-disable-next-line no-console
      console.log(`[graph-controller] resumeSubagent: context still awaiting input after subagent execution`)
      return this.toSummary<TArtifact>(context, this.clock())
    }

    // Continue with remaining steps
    // eslint-disable-next-line no-console
    console.log(`[graph-controller] continuing from step ${stepId} for run ${runId}`)
    await this.continueFromStep(context, stepId, options)
    // eslint-disable-next-line no-console
    console.log(`[graph-controller] continueFromStep completed, status: ${context.status}`)

    // Verification step removed (Option B) - see agent-optimization-langfuse-trace-analysis.md

    // Run any remaining subagents
    if (context.status === STATUS_COMPLETED) {
      // eslint-disable-next-line no-console
      console.log(`[graph-controller] running remaining subagents for run ${runId}`)
      await this.runSubagents(context, options)
    }

    // eslint-disable-next-line no-console
    console.log(`[graph-controller] resumeSubagent completed for run ${runId}, final status: ${context.status}`)
    const summary = this.toSummary<TArtifact>(context, this.clock())
    this.runSummaries.set(runId, summary)

    return summary
  }

  /**
   * Continue plan execution from a specific step (skipping already completed steps).
   */
  private async continueFromStep(
    context: ExecutionContext,
    completedStepId: string,
    options?: ControllerStartOptions
  ): Promise<void> {
    const orderedSteps = topologicallySortPlan(context.plan)
    const completedIndex = orderedSteps.indexOf(completedStepId)

    if (completedIndex === -1 || completedIndex >= orderedSteps.length - 1) {
      // No more steps to execute
      context.status = STATUS_COMPLETED
      return
    }

    // Execute remaining steps
    for (let i = completedIndex + 1; i < orderedSteps.length; i++) {
      if (context.status === STATUS_AWAITING_INPUT || context.status === STATUS_FAILED) {
        break
      }

      const stepId = orderedSteps[i]
      const node = context.plan.nodes[stepId]

      // Skip already completed steps
      if (context.artifactsByStep.has(stepId)) {
        continue
      }

      // Execute this step
      await this.executeStep(node, context, options)
    }

    if (context.status !== STATUS_AWAITING_INPUT && context.status !== STATUS_FAILED) {
      context.status = STATUS_COMPLETED
    }
  }

  /**
   * Execute a single step (skill or subagent).
   */
  private async executeStep(
    node: PlanNode,
    context: ExecutionContext,
    options?: ControllerStartOptions
  ): Promise<void> {
    const nodeKind = node.metadata?.kind === 'subagent' ? 'subagent' : 'skill'
    const subagentId =
      (node.task as { agentId?: string })?.agentId ?? (node.metadata?.subagentId as string | undefined)

    emitEvent(
      options,
      toProgressEvent({
        type: 'step.started',
        runId: context.runContext.runId,
        stepId: node.id,
        payload: {
          label: node.label,
          kind: nodeKind,
          subagentId
        }
      })
    )

    if (nodeKind === 'subagent' && subagentId) {
      await this.executeSubagentStep(node, subagentId, context, options)
    } else {
      await this.executeSkillStep(node, context, options)
    }
  }

  /**
   * Execute a subagent step.
   */
  private async executeSubagentStep(
    node: PlanNode,
    subagentId: string,
    context: ExecutionContext,
    options?: ControllerStartOptions
  ): Promise<void> {
    const lifecycle = await this.getSubagentLifecycle(subagentId)

    return withSpan(
      createSubagentSpan(subagentId, lifecycle.metadata.artifactKind, {
        nodeId: node.id,
        runId: context.runContext.runId
      }),
      async () => {
        const sourceArtifact = this.resolveSubagentSourceArtifact(lifecycle, node, context)

        emitEvent(
          options,
          toProgressEvent({
            type: 'subagent.started',
            runId: context.runContext.runId,
            stepId: node.id,
            payload: {
              subagentId: lifecycle.metadata.id,
              artifactKind: lifecycle.metadata.artifactKind,
              label: lifecycle.metadata.label
            },
            message: `Starting ${lifecycle.metadata.label ?? lifecycle.metadata.id}`
          })
        )

        const subagentRequest = {
          params: {
            ...(node.inputs ?? {}),
            input: context.runContext.request.input
          },
          run: context.runContext,
          traceContext: this.buildTraceContext(),
          sourceArtifact,
          emit: (event: ProgressEvent) => {
            emitEvent(
              options,
              toProgressEvent({
                type: 'subagent.progress',
                runId: context.runContext.runId,
                stepId: node.id,
                payload: { subagentId: lifecycle.metadata.id, event }
              })
            )
          }
        }

        try {
          const result = await lifecycle.execute(subagentRequest)
          await this.handleSubagentToolResult({
            result: {
              status: 'completed',
              nodeId: node.id,
              subagentId: lifecycle.metadata.id,
              artifact: result.artifact,
              metadata: result.metadata
            },
            node,
            lifecycle,
            context,
            options
          })
        } catch (error) {
          context.status = STATUS_FAILED
          emitEvent(
            options,
            toProgressEvent({
              type: 'subagent.failed',
              runId: context.runContext.runId,
              stepId: node.id,
              payload: {
                subagentId: lifecycle.metadata.id,
                error: error instanceof Error ? error.message : String(error)
              },
              message: `${lifecycle.metadata.label ?? lifecycle.metadata.id} failed`
            })
          )
          throw error
        }
      }
    )
  }

  /**
   * Execute a skill step using the existing tool invocation logic.
   */
  private async executeSkillStep(
    node: PlanNode,
    context: ExecutionContext,
    options?: ControllerStartOptions
  ): Promise<void> {
    return withSpan(
      createStepSpan(node.id, node.label, {
        skillId: node.metadata?.skillId,
        runId: context.runContext.runId
      }),
      async () => {
        const apiKey = this.resolveApiKey(context.runContext)
        const hasApiKey = typeof apiKey === 'string' && apiKey.trim().length > 0
        const provider = this.providerFactory(apiKey)
        const toolName = `node_${node.id}`

        // Use skillsModel for skill nodes if configured, otherwise use default model (same as executePlanWithAiTools)
        const modelToUse = this.config.runtime.skillsModel
          ? this.config.runtime.skillsModel
          : context.runContext.settings.model
        const model = hasApiKey ? resolveOpenRouterModel(provider, this.config, modelToUse) : undefined

        const skillTool = createSkillTool({
          node,
          runContext: context.runContext,
          skillRunner: this.skillRunner
        })

        try {
          const result = await this.invokeToolWithModel({
            toolName,
            tool: skillTool,
            model,
            node,
            context,
            options,
            hasApiKey
          })
          await this.handleSkillToolResult({
            result,
            node,
            stepId: node.id,
            context,
            options
          })
        } catch (error) {
          context.status = STATUS_FAILED
          emitEvent(
            options,
            toProgressEvent({
              type: 'step.failed',
              runId: context.runContext.runId,
              stepId: node.id,
              payload: { error: error instanceof Error ? error.message : String(error) }
            })
          )
          throw error
        }
      }
    )
  }

  private resolveApiKey(runContext: RunContext): string | undefined {
    const attributeKey =
      typeof runContext.request.attributes?.apiKey === 'string'
        ? (runContext.request.attributes.apiKey as string)
        : undefined

    const input = runContext.request.input as Record<string, unknown> | undefined
    const settingsKey =
      typeof input?.settings === 'object' && input?.settings
        ? (input.settings as Record<string, unknown>).apiKey
        : undefined

    const sanitizedSettingsKey =
      typeof settingsKey === 'string' && settingsKey.trim().length > 0
        ? settingsKey
        : undefined

    const envKey =
      typeof process.env.OPENROUTER_API_KEY === 'string' &&
      process.env.OPENROUTER_API_KEY.trim().length > 0
        ? process.env.OPENROUTER_API_KEY
        : undefined

    return attributeKey ?? sanitizedSettingsKey ?? envKey
  }

  private async executePlanWithAiTools(
    context: ExecutionContext,
    options?: ControllerStartOptions
  ): Promise<void> {
    const apiKey = this.resolveApiKey(context.runContext)
    const hasApiKey = typeof apiKey === 'string' && apiKey.trim().length > 0
    const provider = this.providerFactory(apiKey)

    const orderedSteps = topologicallySortPlan(context.plan)

    for (const stepId of orderedSteps) {
      const node = context.plan.nodes[stepId]
      const nodeKind = this.getPlanNodeKind(node)
      const task = node.task as { agentId?: string; subagentId?: string } | undefined
      const subagentId =
        nodeKind === 'subagent'
          ? task?.agentId ?? task?.subagentId ?? (node.metadata?.subagentId as string | undefined)
          : undefined
      const spanInput: Record<string, unknown> = {
        nodeId: node.id,
        nodeKind,
        runId: context.runContext.runId
      }
      if (node.metadata?.skillId) {
        spanInput.skillId = node.metadata.skillId
      }
      if (subagentId) {
        spanInput.subagentId = subagentId
      }

      // Use skillsModel for skill nodes if configured, otherwise use default model
      const modelToUse = nodeKind === 'skill' && this.config.runtime.skillsModel
        ? this.config.runtime.skillsModel
        : context.runContext.settings.model

      const model = hasApiKey
        ? resolveOpenRouterModel(provider, this.config, modelToUse)
        : undefined
      const toolName = `node_${node.id}`

      let shouldStop = false
      await withSpan(createStepSpan(node.id, node.label, spanInput), async () => {
        emitEvent(
          options,
          toProgressEvent({
            type: 'step.started',
            runId: context.runContext.runId,
            stepId,
            message: node.label
          })
        )

        if (nodeKind === 'skill') {
          await this.workspace.appendEvent(
            context.runContext.runId,
            createWorkspaceEvent(context.runContext.runId, 'skill', {
              action: 'start',
              stepId,
              label: node.label
            })
          )
        }

        let lifecycle: SubagentLifecycle | undefined
        if (nodeKind === 'subagent') {
          if (!subagentId) {
            throw new Error(`Subagent node "${node.id}" is missing a subagentId`)
          }
          lifecycle = await this.getSubagentLifecycle(subagentId)

          emitEvent(
            options,
            toProgressEvent({
              type: 'subagent.started',
              runId: context.runContext.runId,
              stepId: node.id,
              payload: {
                subagentId,
                artifactKind: lifecycle.metadata.artifactKind,
                label: lifecycle.metadata.label
              },
              message: `${lifecycle.metadata.label ?? subagentId} started`
            })
          )

          await this.workspace.appendEvent(
            context.runContext.runId,
            createWorkspaceEvent(context.runContext.runId, 'subagent', {
              action: 'start',
              stepId: node.id,
              subagentId,
              artifactKind: lifecycle.metadata.artifactKind
            })
          )
        }

        const tool =
          nodeKind === 'subagent' && lifecycle
            ? createSubagentTool({
                node,
                runContext: context.runContext,
                resolveLifecycle: async () => lifecycle as SubagentLifecycle,
                resolveSourceArtifact: lc => this.resolveSubagentSourceArtifact(lc, node, context),
                emitProgress: event =>
                  emitEvent(
                    options,
                    toProgressEvent({
                      type: 'subagent.progress',
                      runId: context.runContext.runId,
                      payload: {
                        subagentId: lifecycle?.metadata.id,
                        event
                      }
                    })
                  )
              })
            : createSkillTool({
                node,
                runContext: context.runContext,
                skillRunner: this.skillRunner
              })

        try {
          if (nodeKind === 'subagent') {
            const executeSubagent = async () => {
              const toolResult = await this.invokeToolDirectly(tool, node, context, options)
              await this.handleSubagentToolResult({
                result: toolResult,
                node,
                lifecycle: lifecycle as SubagentLifecycle,
                context,
                options
              })
              // Check if subagent is blocked on approval - stop execution if so
              if (context.status === STATUS_AWAITING_INPUT) {
                shouldStop = true
              }
            }

            const subagentSpanInput = {
              nodeId: node.id,
              stepId,
              subagentId,
              mode: 'plan',
              runId: context.runContext.runId
            }
            await withSpan(
              createSubagentSpan(
                subagentId ?? 'unknown',
                lifecycle?.metadata.artifactKind ?? 'unknown',
                subagentSpanInput
              ),
              executeSubagent
            )

            if (shouldStop) {
              return
            }
          } else {
            const toolResult = await this.invokeToolWithModel({
              toolName,
              tool,
              model,
              node,
              context,
              options,
              hasApiKey
            })

            await this.handleSkillToolResult({
              result: toolResult,
              node,
              stepId,
              context,
              options
            })
            if (context.status === STATUS_AWAITING_INPUT) {
              shouldStop = true
              return
            }
          }
        } catch (error) {
          emitEvent(
            options,
            toProgressEvent({
              type: 'step.failed',
              runId: context.runContext.runId,
              stepId,
              message: error instanceof Error ? error.message : 'Step failed'
            })
          )

          if (nodeKind === 'subagent' && lifecycle) {
            const message = error instanceof Error ? error.message : String(error)
            await this.workspace.appendEvent(
              context.runContext.runId,
              createWorkspaceEvent(context.runContext.runId, 'subagent', {
                action: 'failed',
                stepId,
                subagentId: lifecycle.metadata.id,
                error: message
              })
            )

            const lifecycleSubagentId = lifecycle.metadata.id
            this.recordSubagentFailureMetadata(
              context,
              lifecycleSubagentId,
              message,
              'plan'
            )

            emitEvent(
              options,
              toProgressEvent({
                type: 'subagent.failed',
                runId: context.runContext.runId,
                stepId,
                payload: {
                  subagentId: lifecycleSubagentId,
                  error: message
                },
                message
              })
            )
          } else {
            await this.workspace.appendEvent(
              context.runContext.runId,
              createWorkspaceEvent(context.runContext.runId, 'skill', {
                action: 'failed',
                stepId,
                error: error instanceof Error ? error.message : String(error)
              })
            )
          }

          throw error
        }
      })

      if (shouldStop) {
        break
      }
    }
  }

  private async invokeToolWithModel(params: {
    toolName: string
    tool: unknown
    model: unknown
    node: PlanNode
    context: ExecutionContext
    options?: ControllerStartOptions
    hasApiKey?: boolean
  }): Promise<ToolExecutionResult> {
    if (!params.hasApiKey || !params.model) {
      return this.invokeToolDirectly(params.tool, params.node, params.context, params.options)
    }

    try {
      const telemetryEnabled = isOtelTelemetryEnabled()
      const modelId = resolveModelId(params.model) ?? params.context.runContext.settings.model
      const maxOutputTokens = Math.min(params.context.runContext.settings.maxOutputTokens ?? 8000, 2048)
      const systemPrompt = this.buildToolSystemPrompt(params.context)
      const userPrompt = this.buildToolPrompt(params.context, params.node)
      const startTime = new Date().toISOString()
      const response = await this.toolInvoker({
        model: params.model as any,
        system: systemPrompt,
        prompt: userPrompt,
        tools: {
          [params.toolName]: params.tool as any
        },
        toolChoice: 'required',
        maxOutputTokens,
        temperature: params.context.runContext.settings.temperature,
        maxRetries: this.config.runtime.retry.attempts,
        abortSignal: params.options?.signal,
        experimental_telemetry: {
          isEnabled: telemetryEnabled,
          ...(modelId ? { metadata: { modelId } } : {})
        }
      })
      const endTime = new Date().toISOString()

      const toolResult =
        (response as any).toolResults?.[0]?.result ??
        (response as any).toolResults?.[0]?.output ??
        (response as any).toolResults?.[0]
      if (!toolResult) {
        // Fallback: execute the tool directly if the model failed to return a tool result.
        return this.invokeToolDirectly(params.tool, params.node, params.context, params.options)
      }

      if (isIngestionTelemetryEnabled()) {
        const usage = normalizeUsage((response as any).usage)
        void recordGeneration({
          name: `tool.invoke:${params.toolName}`,
          model: modelId ?? 'unknown',
          input: {
            system: systemPrompt,
            prompt: userPrompt,
            toolName: params.toolName,
            toolChoice: 'required'
          },
          output: {
            text: (response as any).text,
            toolResults: (response as any).toolResults
          },
          startTime,
          endTime,
          usage,
          modelParameters: {
            temperature: params.context.runContext.settings.temperature,
            maxTokens: maxOutputTokens
          },
          metadata: {
            runId: params.context.runContext.runId,
            stepId: params.node.id
          }
        })
      }

      return toolResult as ToolExecutionResult
    } catch (error) {
      const providerError = this.extractProviderError(error)
      if (providerError) {
        // eslint-disable-next-line no-console
        console.warn(
          `[graph-controller] model tool invocation failed for node ${params.node.id} (run ${params.context.runContext.runId}); falling back to direct execution`,
          { status: providerError.status, message: providerError.message }
        )
        return this.invokeToolDirectly(params.tool, params.node, params.context, params.options)
      }
      throw error
    }
  }

  private async invokeToolDirectly(
    tool: unknown,
    node: PlanNode,
    context: ExecutionContext,
    options?: ControllerStartOptions
  ): Promise<ToolExecutionResult> {
    const executable = tool as { execute?: (input: unknown, options?: { abortSignal?: AbortSignal }) => any }
    if (typeof executable.execute !== 'function') {
      throw new Error(`Tool for node "${node.id}" is missing an execute handler`)
    }

    const result = await executable.execute(
      {},
      {
        abortSignal: options?.signal
      }
    )

    return result as ToolExecutionResult
  }

  private extractProviderError(error: unknown): { status?: number; message?: string } | null {
    if (!error) {
      return null
    }

    const candidate = error as Record<string, unknown>
    const status =
      typeof candidate?.status === 'number'
        ? (candidate.status as number)
        : typeof candidate?.statusCode === 'number'
          ? (candidate.statusCode as number)
          : typeof (candidate?.response as { status?: number } | undefined)?.status === 'number'
            ? ((candidate.response as { status: number }).status as number)
            : undefined

    const message =
      typeof candidate?.message === 'string'
        ? (candidate.message as string)
        : typeof error === 'string'
          ? (error as string)
          : undefined

    const normalizedMessage = message?.toLowerCase() ?? ''
    const isProviderFailure =
      (status !== undefined && status >= 400 && status < 500) ||
      normalizedMessage.includes('bad request') ||
      normalizedMessage.includes('unauthorized') ||
      (typeof candidate?.name === 'string' && candidate.name === 'AIRequestError')

    if (!isProviderFailure) {
      return null
    }

    return { status, message }
  }

  private async handleSkillToolResult(params: {
    result: ToolExecutionResult
    node: PlanNode
    stepId: StepId
    context: ExecutionContext
    options?: ControllerStartOptions
  }): Promise<void> {
    const { result, node, context, options, stepId } = params
    const skillId = (node.metadata?.skillId as string) ?? node.id

    if (result.skillResult) {
      context.skillResults.push(result.skillResult)
    }

    const artifact = result.artifact
    if (artifact) {
      context.artifact = artifact
      this.trackArtifactForContext(stepId, artifact, context)
      await this.workspace.writeArtifact(context.runContext.runId, artifact)
      await this.workspace.appendEvent(
        context.runContext.runId,
        createWorkspaceEvent(context.runContext.runId, 'artifact', {
          artifactId: artifact.id,
          kind: artifact.kind,
          version: artifact.version
        })
      )

      emitEvent(
        options,
        toProgressEvent({
          type: 'artifact.delivered',
          runId: context.runContext.runId,
          stepId,
          payload: {
            artifactId: artifact.id,
            artifactKind: artifact.kind,
            artifact
          }
        })
      )
    }

    emitEvent(
      options,
      toProgressEvent({
        type: 'step.completed',
        runId: context.runContext.runId,
        stepId,
        payload: {
          skillId,
          metadata: result.metadata
        }
      })
    )

    await this.workspace.appendEvent(
      context.runContext.runId,
      createWorkspaceEvent(context.runContext.runId, 'skill', {
        action: 'complete',
        stepId,
        result: {
          metadata: result.metadata,
          confidence: result.confidence
        }
      })
    )

    const runStatusOverride =
      result.status === STATUS_AWAITING_INPUT
        ? STATUS_AWAITING_INPUT
        : typeof result.metadata?.runStatus === 'string'
          ? (result.metadata.runStatus as RunStatus)
          : undefined

    if (runStatusOverride === STATUS_AWAITING_INPUT) {
      context.status = STATUS_AWAITING_INPUT
      const clarification = result.metadata?.clarification as ClarificationResult | undefined
      if (clarification) {
        context.clarification = clarification
        if (!context.runContext.metadata) {
          context.runContext.metadata = {}
        }
        context.runContext.metadata.clarification = clarification
      }
    }
  }

  private async handleSubagentToolResult(params: {
    result: ToolExecutionResult
    node: PlanNode
    lifecycle: SubagentLifecycle
    context: ExecutionContext
    options?: ControllerStartOptions
  }): Promise<void> {
    const { result, node, lifecycle, context, options } = params
    const artifact = result.artifact

    const runStatusOverride =
      (result.metadata?.runStatus as RunStatus | undefined) ||
      (artifact?.metadata?.extras?.status as RunStatus | undefined)

    if (runStatusOverride === STATUS_AWAITING_INPUT && !artifact) {
      // Propagate awaiting-input status without requiring an artifact (e.g., clarification flows)
      context.status = STATUS_AWAITING_INPUT
      const clarification = result.metadata?.clarification as ClarificationResult | undefined
      if (clarification) {
        context.clarification = clarification
        context.runContext.metadata = {
          ...(context.runContext.metadata ?? {}),
          clarification
        }
      }
      await this.workspace.appendEvent(
        context.runContext.runId,
        createWorkspaceEvent(context.runContext.runId, 'subagent', {
          action: 'awaiting-input',
          stepId: node.id,
          subagentId: lifecycle.metadata.id
        })
      )
      return
    }

    if (!artifact) {
      throw new Error(`Subagent "${lifecycle.metadata.id}" did not return an artifact`)
    }

    // Check for pending approval status from subagent
    const subagentStatus =
      (artifact.metadata?.extras?.status as string | undefined) ||
      (result.metadata?.status as string | undefined)

    if (subagentStatus === 'awaiting-plan-confirmation' || subagentStatus === 'awaiting-clarification') {
      const subagentPlan = artifact.metadata?.extras?.plan || result.metadata?.plan

      // Record approval request span for observability with timestamp
      const approvalRequestedAt = new Date().toISOString()
      await withSpan(
        createApprovalSpan('requested', {
          subagentId: lifecycle.metadata.id,
          artifactKind: lifecycle.metadata.artifactKind,
          status: subagentStatus,
          runId: context.runContext.runId,
          approvalRequestedAt
        }),
        async () => ({ status: subagentStatus, subagentId: lifecycle.metadata.id, approvalRequestedAt })
      )

      // Emit approval-required event
      emitEvent(
        options,
        toProgressEvent({
          type: 'subagent.approval-required',
          runId: context.runContext.runId,
          stepId: node.id,
          payload: {
            subagentId: lifecycle.metadata.id,
            artifactKind: lifecycle.metadata.artifactKind,
            status: subagentStatus,
            plan: subagentPlan,
            approvalUrl: `/runs/${context.runContext.runId}/subagent/${node.id}/approve`
          },
          message: `${lifecycle.metadata.label ?? lifecycle.metadata.id} requires approval`
        })
      )

      // Set context to awaiting state
      context.status = STATUS_AWAITING_INPUT
      if (!context.runContext.metadata) {
        context.runContext.metadata = {}
      }
      context.runContext.metadata.blockedSubagent = {
        stepId: node.id,
        subagentId: lifecycle.metadata.id,
        status: subagentStatus,
        plan: subagentPlan,
        approvalRequestedAt
      }

      // Store partial artifact for later continuation
      this.trackArtifactForContext(node.id, artifact, context)

      // Record in workspace for recovery
      await this.workspace.appendEvent(
        context.runContext.runId,
        createWorkspaceEvent(context.runContext.runId, 'subagent', {
          action: 'awaiting-approval',
          stepId: node.id,
          subagentId: lifecycle.metadata.id,
          status: subagentStatus,
          plan: subagentPlan
        })
      )

      return // Don't continue execution - wait for approval
    }

    const transitionPayload = this.buildTransitionPayload(node, artifact, context)

    await this.workspace.writeArtifact(context.runContext.runId, artifact)
    this.trackArtifactForContext(node.id, artifact, context)

    const shouldPromote =
      (node.metadata?.promoteResult as boolean | undefined) === true ||
      artifact.kind === context.plan.artifactKind

    if (shouldPromote || !context.artifact) {
      context.artifact = artifact
    }

    context.subagentResults.push({
      subagentId: lifecycle.metadata.id,
      artifact,
      metadata: result.metadata
    })
    this.recordSubagentArtifactMetadata(context, lifecycle.metadata.id, artifact, result.metadata)

    await this.workspace.appendEvent(
      context.runContext.runId,
      createWorkspaceEvent(context.runContext.runId, 'subagent', {
        action: 'complete',
        stepId: node.id,
        subagentId: lifecycle.metadata.id,
        artifactId: artifact.id,
        artifactKind: artifact.kind
      })
    )

    emitEvent(
      options,
      toProgressEvent({
        type: 'artifact.delivered',
        runId: context.runContext.runId,
        stepId: node.id,
        payload: {
          artifactId: artifact.id,
          artifactKind: artifact.kind,
          artifact,
          transition: transitionPayload
        }
      })
    )

    emitEvent(
      options,
      toProgressEvent({
        type: 'subagent.completed',
        runId: context.runContext.runId,
        stepId: node.id,
        payload: {
          subagentId: lifecycle.metadata.id,
          artifactId: artifact.id,
          artifactKind: artifact.kind,
          transition: transitionPayload
        },
        message: `${lifecycle.metadata.label ?? lifecycle.metadata.id} completed`
      })
    )

    emitEvent(
      options,
      toProgressEvent({
        type: 'step.completed',
        runId: context.runContext.runId,
        stepId: node.id,
        payload: {
          subagentId: lifecycle.metadata.id
        }
      })
    )
  }

  private trackArtifactForContext(stepId: StepId, artifact: Artifact, context: ExecutionContext) {
    context.artifactsByStep.set(stepId, artifact)
    const existing = context.artifactsByKind.get(artifact.kind) ?? []
    existing.push(artifact)
    context.artifactsByKind.set(artifact.kind, existing)
  }

  private buildTransitionPayload(
    node: PlanNode,
    artifact: Artifact | undefined,
    context: ExecutionContext
  ):
    | {
        fromArtifactKind?: ArtifactKind
        toArtifactKind?: ArtifactKind
        promotesRunArtifact?: boolean
        intentTargetArtifact?: ArtifactKind
        transitionPath?: ArtifactKind[]
      }
    | undefined {
    if (node.metadata?.kind !== 'subagent') {
      return undefined
    }

    const inputsFromArtifact = node.inputs?.fromArtifact as ArtifactKind | undefined
    const metadataSource = node.metadata?.source as { artifactKind?: ArtifactKind } | undefined
    const sourceArtifactKind = inputsFromArtifact ?? metadataSource?.artifactKind
    const targetKind =
      (node.metadata?.artifactKind as ArtifactKind | undefined) ?? artifact?.kind ?? undefined
    const planMetadata = context.plan.metadata as Record<string, unknown> | undefined
    const transitionPath = Array.isArray(planMetadata?.transitionPath)
      ? (planMetadata?.transitionPath as ArtifactKind[])
      : undefined

    return {
      fromArtifactKind: sourceArtifactKind,
      toArtifactKind: targetKind,
      promotesRunArtifact: node.metadata?.promoteResult === true,
      intentTargetArtifact:
        (planMetadata?.requestedArtifactKind as ArtifactKind | undefined) ??
        context.plan.artifactKind,
      transitionPath
    }
  }

  private buildToolSystemPrompt(context: ExecutionContext): string {
    const target = context.plan.artifactKind
    return [
      'You are the Product Agent orchestrator.',
      'Use the provided tools to execute each plan step and return concise results.',
      `Target artifact: ${target}.`,
      'Always call the required tool and rely on the tool output instead of inventing content.'
    ].join(' ')
  }

  private buildToolPrompt(context: ExecutionContext, node: PlanNode): string {
    const planMetadata = context.plan.metadata as
      | {
          transitionPath?: ArtifactKind[]
          intent?: { requestedArtifacts?: ArtifactKind[]; targetArtifact?: ArtifactKind }
        }
      | undefined
    const requested = planMetadata?.intent?.requestedArtifacts ?? planMetadata?.transitionPath ?? []
    const requestedSummary = requested.length > 0 ? `Requested artifacts: ${requested.join(', ')}.` : ''
    const dependencies =
      node.dependsOn && node.dependsOn.length > 0
        ? `Depends on: ${node.dependsOn.join(', ')}.`
        : 'No dependencies.'
    const userSummary = this.extractRunInputSummary(context.runContext.request.input)

    return [
      `Execute plan step "${node.label}" (id: ${node.id}).`,
      dependencies,
      requestedSummary,
      userSummary ? `User input: ${userSummary}` : ''
    ]
      .filter(Boolean)
      .join(' ')
  }

  private extractRunInputSummary(input: unknown): string {
    if (!input) {
      return ''
    }
    const candidate = input as { message?: unknown }
    if (typeof candidate?.message === 'string') {
      return candidate.message
    }
    try {
      return JSON.stringify(input)
    } catch {
      return ''
    }
  }

  private getPlanNodeKind(node: PlanNode): 'skill' | 'subagent' {
    return node.metadata?.kind === 'subagent' ? 'subagent' : 'skill'
  }

  private resolveSubagentSourceArtifact(
    lifecycle: SubagentLifecycle,
    node: PlanNode,
    context: ExecutionContext
  ): Artifact | undefined {
    const source = node.metadata?.source as
      | {
          fromNode?: StepId
          artifactKind?: ArtifactKind
        }
      | undefined

    if (source?.fromNode) {
      const byNode = context.artifactsByStep.get(source.fromNode)
      if (byNode) {
        return byNode
      }
    }

    if (source?.artifactKind) {
      const byKind = context.artifactsByKind.get(source.artifactKind)
      if (byKind && byKind.length > 0) {
        return byKind[byKind.length - 1]
      }
    }

    if (context.artifact) {
      return context.artifact
    }

    if (lifecycle.metadata.sourceKinds.includes('prompt')) {
      return this.buildPromptArtifact(context)
    }

    return undefined
  }

  private buildPromptArtifact(context: ExecutionContext): Artifact | undefined {
    const requestInput = context.runContext.request.input as { message?: string; context?: unknown } | undefined
    const message = requestInput?.message ?? ''
    const contextPayload = requestInput?.context ?? undefined

    if (!message && !contextPayload) {
      return undefined
    }

    return {
      id: `artifact-prompt-${context.runContext.runId}`,
      kind: 'prompt',
      version: '1.0.0',
      label: 'Prompt Context',
      data: {
        message,
        context: contextPayload
      },
      metadata: {
        createdAt: this.clock().toISOString(),
        createdBy: context.runContext.request.createdBy,
        tags: ['prompt', 'synthetic']
      }
    }
  }

  private async getSubagentLifecycle(subagentId: string): Promise<SubagentLifecycle> {
    const local = this.subagents.find(subagent => subagent.metadata.id === subagentId)
    if (local) {
      return local
    }

    if (!this.subagentRegistry) {
      throw new Error(`Subagent "${subagentId}" is not registered with the controller`)
    }

    return this.subagentRegistry.createLifecycle(subagentId)
  }

  private recordSubagentArtifactMetadata(
    context: ExecutionContext,
    subagentId: string,
    artifact: Artifact,
    metadata?: Record<string, unknown>
  ): void {
    if (!context.runContext.metadata) {
      context.runContext.metadata = {}
    }

    const existing =
      (context.runContext.metadata.subagents as Record<string, unknown> | undefined) ?? {}
    existing[subagentId] = {
      artifactId: artifact.id,
      artifactKind: artifact.kind,
      metadata: metadata ?? {},
      label: artifact.label,
      version: artifact.version
    }

    context.runContext.metadata.subagents = existing
  }

  private recordSubagentFailureMetadata(
    context: ExecutionContext,
    subagentId: string,
    error: string,
    stage?: string
  ): void {
    if (!context.runContext.metadata) {
      context.runContext.metadata = {}
    }

    const failures =
      (context.runContext.metadata.subagentFailures as Record<string, unknown> | undefined) ?? {}
    failures[subagentId] = {
      error,
      stage,
      timestamp: this.clock().toISOString()
    }
    context.runContext.metadata.subagentFailures = failures
  }

  private async runSubagents(
    context: ExecutionContext,
    options?: ControllerStartOptions
  ): Promise<void> {
    if (!context.artifact) {
      return
    }

    if (context.status !== STATUS_COMPLETED) {
      return
    }

    const requestedArtifacts = this.resolveRequestedArtifacts(context)
    if (requestedArtifacts.size === 0) {
      return
    }

    const resolvedSubagents = (await this.resolveSubagents(context, options)).filter(subagent =>
      requestedArtifacts.has(subagent.metadata.artifactKind)
    )
    if (resolvedSubagents.length === 0) {
      return
    }

    const runId = context.runContext.runId
    const sourceKind = context.artifact.kind
    const executedSubagents = new Set(context.subagentResults.map(result => result.subagentId))
    const shouldRunSubagent = (subagent: SubagentLifecycle) => {
      if (!requestedArtifacts.has(subagent.metadata.artifactKind)) {
        return false
      }
      if (
        subagent.metadata.sourceKinds.length > 0 &&
        !subagent.metadata.sourceKinds.includes(sourceKind)
      ) {
        return false
      }
      return true
    }

    for (const subagent of resolvedSubagents) {
      if (executedSubagents.has(subagent.metadata.id)) {
        continue
      }

      if (!shouldRunSubagent(subagent)) {
        continue
      }

      const spanInput = {
        subagentId: subagent.metadata.id,
        artifactKind: subagent.metadata.artifactKind,
        mode: 'auto',
        runId: context.runContext.runId
      }

      try {
        await withSpan(
          createSubagentSpan(subagent.metadata.id, subagent.metadata.artifactKind, spanInput),
          async () => {
            emitEvent(
              options,
              toProgressEvent({
                type: 'subagent.started',
                runId,
                payload: {
                  subagentId: subagent.metadata.id,
                  artifactKind: subagent.metadata.artifactKind,
                  label: subagent.metadata.label
                },
                message: `${subagent.metadata.label ?? subagent.metadata.id} started`
              })
            )

            await this.workspace.appendEvent(
              runId,
              createWorkspaceEvent(runId, 'subagent', {
                action: 'start',
                subagentId: subagent.metadata.id,
                artifactKind: subagent.metadata.artifactKind
              })
            )

            try {
              // Extract context payload and research-specific parameters from the run request
              const requestInput = context.runContext.request.input as SectionRoutingRequest | undefined
              const contextPayload = requestInput?.context?.contextPayload as Record<string, unknown> | undefined

              // Build params for the subagent, including any parameters from contextPayload
              const subagentParams = contextPayload ?? {}

              const result = await subagent.execute({
                params: subagentParams,
                run: context.runContext,
                traceContext: this.buildTraceContext(),
                sourceArtifact: context.artifact,
                emit: event =>
                  emitEvent(
                    options,
                    toProgressEvent({
                      type: 'subagent.progress',
                      runId,
                      payload: {
                        subagentId: subagent.metadata.id,
                        event
                      }
                    })
                  )
              })

              await this.workspace.writeArtifact(runId, result.artifact)
              const syntheticStepId = (`subagent-auto-${subagent.metadata.id}-${context.subagentResults.length + 1}`) as StepId
              this.trackArtifactForContext(syntheticStepId, result.artifact, context)

              context.subagentResults.push({
                subagentId: subagent.metadata.id,
                artifact: result.artifact,
                metadata: result.metadata
              })

              this.recordSubagentArtifactMetadata(
                context,
                subagent.metadata.id,
                result.artifact,
                result.metadata
              )
              executedSubagents.add(subagent.metadata.id)

              await this.workspace.appendEvent(
                runId,
                createWorkspaceEvent(runId, 'subagent', {
                  action: 'complete',
                  subagentId: subagent.metadata.id,
                  artifactId: result.artifact.id,
                  artifactKind: result.artifact.kind
                })
              )

              emitEvent(
                options,
                toProgressEvent({
                  type: 'subagent.completed',
                  runId,
                  payload: {
                    subagentId: subagent.metadata.id,
                    artifactId: result.artifact.id,
                    artifactKind: result.artifact.kind
                  },
                  message: `${subagent.metadata.label ?? subagent.metadata.id} completed`
                })
              )
            } catch (error) {
              await this.workspace.appendEvent(
                runId,
                createWorkspaceEvent(runId, 'subagent', {
                  action: 'failed',
                  subagentId: subagent.metadata.id,
                  error: error instanceof Error ? error.message : String(error)
                })
              )

              emitEvent(
                options,
                toProgressEvent({
                  type: 'subagent.failed',
                  runId,
                  payload: {
                    subagentId: subagent.metadata.id,
                    error: error instanceof Error ? error.message : String(error)
                  },
                  message: error instanceof Error ? error.message : 'Subagent failed'
                })
              )

              this.recordSubagentFailureMetadata(
                context,
                subagent.metadata.id,
                error instanceof Error ? error.message : String(error)
              )
              throw error
            }
          }
        )
      } catch (err) {
        // Log but continue running remaining subagents
        // eslint-disable-next-line no-console
        console.error(`[graph-controller] subagent span failed for ${subagent.metadata.id}:`, err)
      }
    }
  }

  private async resolveSubagents(
    context: ExecutionContext,
    options?: ControllerStartOptions
  ): Promise<SubagentLifecycle[]> {
    if (!context.artifact) {
      return []
    }

    if (!this.subagentRegistry) {
      return [...this.subagents]
    }

    const runId = context.runContext.runId
    const resolved: SubagentLifecycle[] = [...this.subagents]
    const seen = new Set(resolved.map(subagent => subagent.metadata.id))
    const manifests = this.subagentRegistry.filterByArtifact(context.artifact.kind)

    for (const manifest of manifests) {
      if (seen.has(manifest.id)) {
        continue
      }

      try {
        const lifecycle = await this.subagentRegistry.createLifecycle(manifest.id)
        resolved.push(lifecycle)
        seen.add(manifest.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await this.workspace.appendEvent(
          runId,
          createWorkspaceEvent(runId, 'subagent', {
            action: 'failed',
            subagentId: manifest.id,
            stage: 'load',
            error: message
          })
        )

        emitEvent(
          options,
          toProgressEvent({
            type: 'subagent.failed',
            runId,
            payload: {
              subagentId: manifest.id,
              error: message,
              stage: 'load'
            },
            message
          })
        )

        this.recordSubagentFailureMetadata(context, manifest.id, message, 'load')
      }
    }

    return resolved
  }

  private resolveRequestedArtifacts(context: ExecutionContext): Set<ArtifactKind> {
    const requested = new Set<ArtifactKind>()
    const planMetadata = context.plan.metadata as { intent?: ArtifactIntent } | undefined
    const intent = context.runContext.intentPlan ?? planMetadata?.intent

    const addArtifact = (artifact?: ArtifactKind) => {
      if (artifact) {
        requested.add(artifact)
      }
    }

    if (intent) {
      intent.requestedArtifacts?.forEach(addArtifact)
      addArtifact(intent.targetArtifact)
      intent.transitions?.forEach(transition => {
        addArtifact(transition.fromArtifact)
        addArtifact(transition.toArtifact)
      })
    }

    addArtifact(context.runContext.request.artifactKind as ArtifactKind | undefined)

    return requested
  }

  private toSummary<TArtifact>(
    context: ExecutionContext,
    completedAt: Date
  ): ControllerRunSummary<TArtifact> {
    return {
      runId: context.runContext.runId,
      artifact: context.artifact as Artifact<TArtifact> | undefined,
      skillResults: context.skillResults,
      verification: context.verification,
      completedAt,
      status: toControllerStatus(context.status),
      workspace: context.runContext.workspace,
      metadata: context.runContext.metadata,
      subagents: context.subagentResults.length > 0 ? context.subagentResults : undefined
    }
  }
}
