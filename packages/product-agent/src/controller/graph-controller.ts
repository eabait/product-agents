import { randomUUID } from 'node:crypto'

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
import type { WorkspaceDAO, WorkspaceEvent, WorkspaceHandle } from '../contracts/workspace'
import type { Planner } from '../contracts/planner'
import type { ClarificationResult } from '@product-agents/prd-shared'
import type { SubagentLifecycle, SubagentRunSummary } from '../contracts/subagent'
import type { SubagentRegistry } from '../subagents/subagent-registry'

type Clock = () => Date

interface GraphControllerOptions {
  clock?: Clock
  idFactory?: () => string
  workspaceOverrides?: {
    persistArtifacts?: boolean
    tempSubdir?: string
  }
  subagentRegistry?: SubagentRegistry
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

const mapVerificationStatusToRunStatus = (verification?: VerificationResult): RunStatus => {
  if (!verification) {
    return STATUS_COMPLETED
  }

  switch (verification.status) {
    case 'fail':
      return STATUS_FAILED
    case 'needs-review':
      return STATUS_AWAITING_INPUT
    default:
      return STATUS_COMPLETED
  }
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
  readonly planner: Planner
  readonly skillRunner: SkillRunner
  readonly verifier: Verifier
  readonly workspace: WorkspaceDAO
  readonly subagents: SubagentLifecycle[]
  readonly subagentRegistry?: SubagentRegistry

  private readonly config: ProductAgentConfig
  private readonly clock: Clock
  private readonly idFactory: () => string
  private readonly workspaceOverrides?: GraphControllerOptions['workspaceOverrides']
  private readonly verifierGroup: ControllerComposition['verifier']
  private readonly runSummaries = new Map<string, ControllerRunSummary>()

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
    this.verifierGroup = composition.verifier
    this.config = config
    this.clock = options?.clock ?? (() => new Date())
    this.idFactory = options?.idFactory ?? (() => randomUUID())
    this.workspaceOverrides = options?.workspaceOverrides
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

    const planDraft = input.initialPlan
      ? { plan: input.initialPlan }
      : await this.planner.createPlan(runContext)

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
      artifactsByKind: new Map()
    }

    try {
      await this.executePlan(executionContext, options)

      if (executionContext.status === STATUS_AWAITING_INPUT) {
        // Skip verification; run awaits user clarification input
      } else {
        if (!executionContext.artifact) {
          throw new Error('Run completed without producing an artifact')
        }

        if (executionContext.artifact.kind === 'prd') {
          const verification = await this.runVerification(executionContext, options)
          executionContext.verification = verification
          executionContext.status = mapVerificationStatusToRunStatus(verification)

          if (executionContext.status === STATUS_FAILED) {
            throw new Error('Verification failed')
          }
        } else {
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

  private async executePlan(
    context: ExecutionContext,
    options?: ControllerStartOptions
  ): Promise<void> {
    const orderedSteps = topologicallySortPlan(context.plan)

    for (const stepId of orderedSteps) {
      const node = context.plan.nodes[stepId]

      emitEvent(
        options,
        toProgressEvent({
          type: 'step.started',
          runId: context.runContext.runId,
          stepId,
          message: node.label
        })
      )

      const nodeKind = this.getPlanNodeKind(node)
      if (nodeKind === 'subagent') {
        await this.executeSubagentStep(node, context, options)
        continue
      }

      await this.workspace.appendEvent(
        context.runContext.runId,
        createWorkspaceEvent(context.runContext.runId, 'skill', {
          action: 'start',
          stepId,
          label: node.label
        })
      )

      try {
        const result = await this.skillRunner.invoke({
          skillId: (node.metadata?.skillId as string) ?? stepId,
          planNode: node,
          input: node.task,
          context: {
            run: context.runContext,
            step: node,
            abortSignal: options?.signal,
            metadata: context.runContext.metadata
          }
        })

        context.skillResults.push(result)
        const artifactCandidate = (result.metadata as { artifact?: Artifact })?.artifact
        if (artifactCandidate) {
          context.artifact = artifactCandidate
          this.trackArtifactForContext(stepId, artifactCandidate, context)
          await this.workspace.writeArtifact(context.runContext.runId, artifactCandidate)
          await this.workspace.appendEvent(
            context.runContext.runId,
            createWorkspaceEvent(context.runContext.runId, 'artifact', {
              artifactId: artifactCandidate.id,
              kind: artifactCandidate.kind,
              version: artifactCandidate.version
            })
          )
        emitEvent(
          options,
          toProgressEvent({
            type: 'artifact.delivered',
            runId: context.runContext.runId,
            stepId,
            payload: {
              artifactId: artifactCandidate.id,
              artifactKind: artifactCandidate.kind,
              artifact: artifactCandidate
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
              skillId: (node.metadata?.skillId as string) ?? stepId,
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

        const metadata = result.metadata as Record<string, unknown> | undefined
        const runStatusOverride =
          typeof metadata?.runStatus === 'string' ? (metadata.runStatus as RunStatus) : undefined
        if (runStatusOverride === STATUS_AWAITING_INPUT) {
          context.status = STATUS_AWAITING_INPUT
          const clarification = metadata?.clarification as ClarificationResult | undefined
          if (clarification) {
            context.clarification = clarification
            if (!context.runContext.metadata) {
              context.runContext.metadata = {}
            }
            context.runContext.metadata.clarification = clarification
          }
          break
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
        await this.workspace.appendEvent(
          context.runContext.runId,
          createWorkspaceEvent(context.runContext.runId, 'skill', {
            action: 'failed',
            stepId,
            error: error instanceof Error ? error.message : String(error)
          })
        )
        throw error
      }
    }
  }

  private async runVerification(
    context: ExecutionContext,
    options?: ControllerStartOptions
  ): Promise<VerificationResult | undefined> {
    if (!context.artifact) {
      return undefined
    }

    emitEvent(
      options,
      toProgressEvent({
        type: 'verification.started',
        runId: context.runContext.runId
      })
    )

    const verifiers = this.verifierGroup
    const primaryResult = await verifiers.primary.verify({
      artifact: context.artifact,
      context: context.runContext
    })

    const secondaryResults: VerificationResult[] = []
    if (verifiers.secondary?.length) {
      for (const verifier of verifiers.secondary) {
        const result = await verifier.verify({
          artifact: primaryResult.artifact,
          context: context.runContext
        })
        secondaryResults.push(result)
      }
    }

    const allResults = [primaryResult, ...secondaryResults]
    const finalArtifact = allResults.reduce<Artifact | undefined>(
      (latest, result) => result.artifact ?? latest,
      primaryResult.artifact
    )
    const combinedIssues = allResults.flatMap(result => result.issues ?? [])

    const statusOrder: Record<VerificationResult['status'], number> = {
      fail: 3,
      'needs-review': 2,
      pass: 1
    }

    const finalStatus = allResults.reduce<VerificationResult['status']>(
      (current, result) =>
        statusOrder[result.status] > statusOrder[current] ? result.status : current,
      primaryResult.status
    )

    const metadata = {
      primary: primaryResult.metadata,
      secondary: secondaryResults.map(result => ({
        status: result.status,
        metadata: result.metadata,
        issues: result.issues
      }))
    }

    const aggregatedResult: VerificationResult = {
      status: finalStatus,
      artifact: finalArtifact ?? context.artifact,
      issues: combinedIssues,
      usage: primaryResult.usage,
      metadata
    }

    emitEvent(
      options,
      toProgressEvent({
        type: 'verification.completed',
        runId: context.runContext.runId,
        payload: {
          status: aggregatedResult.status,
          issues: aggregatedResult.issues
        }
      })
    )

    await this.workspace.appendEvent(
      context.runContext.runId,
      createWorkspaceEvent(context.runContext.runId, 'verification', {
        status: aggregatedResult.status,
        issues: aggregatedResult.issues
      })
    )

    return aggregatedResult
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

  private getPlanNodeKind(node: PlanNode): 'skill' | 'subagent' {
    return node.metadata?.kind === 'subagent' ? 'subagent' : 'skill'
  }

  private async executeSubagentStep(
    node: PlanNode,
    context: ExecutionContext,
    options?: ControllerStartOptions
  ): Promise<void> {
    const task = node.task as { kind?: string; agentId?: string; subagentId?: string } | undefined
    const subagentId = task?.agentId ?? task?.subagentId ?? (node.metadata?.subagentId as string | undefined)
    if (!subagentId) {
      throw new Error(`Subagent node "${node.id}" is missing a subagentId`)
    }

    const lifecycle = await this.getSubagentLifecycle(subagentId)
    const sourceArtifact = this.resolveSubagentSourceArtifact(lifecycle, node, context)
    if (!sourceArtifact) {
      throw new Error(`Subagent "${subagentId}" requires a source artifact but none was available`)
    }

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

    try {
      const result = await lifecycle.execute({
        params: (node.metadata?.params as Record<string, unknown>) ?? {},
        run: context.runContext,
        sourceArtifact,
        emit: event =>
          emitEvent(
            options,
            toProgressEvent({
              type: 'subagent.progress',
              runId: context.runContext.runId,
              payload: {
                subagentId,
                event
              }
            })
          )
      })

      const transitionPayload = this.buildTransitionPayload(node, result.artifact, context)

      await this.workspace.writeArtifact(context.runContext.runId, result.artifact)
      this.trackArtifactForContext(node.id, result.artifact, context)

      const shouldPromote =
        (node.metadata?.promoteResult as boolean | undefined) === true ||
        result.artifact.kind === context.plan.artifactKind

      if (shouldPromote || !context.artifact) {
        context.artifact = result.artifact
      }

      context.subagentResults.push({
        subagentId,
        artifact: result.artifact,
        metadata: result.metadata
      })
      this.recordSubagentArtifactMetadata(context, subagentId, result.artifact, result.metadata)

      await this.workspace.appendEvent(
        context.runContext.runId,
        createWorkspaceEvent(context.runContext.runId, 'subagent', {
          action: 'complete',
          stepId: node.id,
          subagentId,
          artifactId: result.artifact.id,
          artifactKind: result.artifact.kind
        })
      )

      emitEvent(
        options,
        toProgressEvent({
          type: 'artifact.delivered',
          runId: context.runContext.runId,
          stepId: node.id,
          payload: {
            artifactId: result.artifact.id,
            artifactKind: result.artifact.kind,
            artifact: result.artifact,
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
            subagentId,
            artifactId: result.artifact.id,
            artifactKind: result.artifact.kind,
            transition: transitionPayload
          },
          message: `${lifecycle.metadata.label ?? subagentId} completed`
        })
      )

      emitEvent(
        options,
        toProgressEvent({
          type: 'step.completed',
          runId: context.runContext.runId,
          stepId: node.id,
          payload: {
            subagentId
          }
        })
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Subagent failed'
      this.recordSubagentFailureMetadata(context, subagentId, message, 'plan')

      await this.workspace.appendEvent(
        context.runContext.runId,
        createWorkspaceEvent(context.runContext.runId, 'subagent', {
          action: 'failed',
          stepId: node.id,
          subagentId,
          error: message
        })
      )

      emitEvent(
        options,
        toProgressEvent({
          type: 'subagent.failed',
          runId: context.runContext.runId,
          stepId: node.id,
          payload: {
            subagentId,
            error: message
          },
          message
        })
      )

      throw error
    }
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

    const resolvedSubagents = await this.resolveSubagents(context, options)
    if (resolvedSubagents.length === 0) {
      return
    }

    const runId = context.runContext.runId
    const sourceKind = context.artifact.kind
    const executedSubagents = new Set(context.subagentResults.map(result => result.subagentId))
    const shouldRunSubagent = (subagent: SubagentLifecycle) => {
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
        const result = await subagent.execute({
          params: {},
          run: context.runContext,
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
