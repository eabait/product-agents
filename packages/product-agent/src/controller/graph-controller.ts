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
import type { Artifact, StepId } from '../contracts/core'
import type { WorkspaceDAO, WorkspaceEvent, WorkspaceHandle } from '../contracts/workspace'
import type { Planner } from '../contracts/planner'
import type { ClarificationResult } from '@product-agents/prd-shared'

type Clock = () => Date

interface GraphControllerOptions {
  clock?: Clock
  idFactory?: () => string
  workspaceOverrides?: {
    persistArtifacts?: boolean
    tempSubdir?: string
  }
}

interface ExecutionContext {
  runContext: RunContext<unknown, WorkspaceHandle>
  plan: PlanGraph
  skillResults: SkillResult[]
  artifact?: Artifact
  verification?: VerificationResult
  status: RunStatus
  clarification?: ClarificationResult
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
      metadata: options?.metadata ? { ...options.metadata } : {}
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
          planId: plan.id,
          version: plan.version
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
      status: STATUS_RUNNING
    }

    try {
      await this.executePlan(executionContext, options)

      if (executionContext.status === STATUS_AWAITING_INPUT) {
        // Skip verification; run awaits user clarification input
      } else {
        if (!executionContext.artifact) {
          throw new Error('Run completed without producing an artifact')
        }

        const verification = await this.runVerification(executionContext, options)
        executionContext.verification = verification
        executionContext.status = mapVerificationStatusToRunStatus(verification)

        if (executionContext.status === STATUS_FAILED) {
          throw new Error('Verification failed')
        }
      }
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
                kind: artifactCandidate.kind
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
      metadata: context.runContext.metadata
    }
  }
}
