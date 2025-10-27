import type { Artifact, PlanGraph, ProgressEvent, RunId, RunRequest } from './core'
import type { Planner } from './planner'
import type { SkillRunner, SkillResult } from './skill-runner'
import type { VerificationResult, Verifier } from './verifier'
import type { WorkspaceDAO, WorkspaceHandle } from './workspace'

export interface ControllerComposition {
  planner: Planner
  skillRunner: SkillRunner
  verifier: {
    primary: Verifier
    secondary?: Verifier[]
  }
  workspace: WorkspaceDAO
}

export interface ControllerStartRequest<TInput = unknown> {
  runId?: RunId
  request: RunRequest<TInput>
  initialPlan?: PlanGraph
}

export interface ControllerStartOptions {
  emit?: (event: ProgressEvent) => void
  signal?: AbortSignal
  metadata?: Record<string, unknown>
}

export interface ControllerStepOutput<TArtifact = unknown> {
  artifact?: Artifact<TArtifact>
  skillResults: SkillResult[]
  verification?: VerificationResult
  completedAt: Date
}

export interface ControllerRunSummary<TArtifact = unknown> extends ControllerStepOutput<TArtifact> {
  runId: RunId
  status: 'completed' | 'failed' | 'awaiting-input'
  workspace: WorkspaceHandle
  metadata?: Record<string, unknown>
}

export interface AgentController {
  readonly planner: Planner
  readonly skillRunner: SkillRunner
  readonly verifier: Verifier
  readonly workspace: WorkspaceDAO

  start<TInput = unknown, TArtifact = unknown>(
    input: ControllerStartRequest<TInput>,
    options?: ControllerStartOptions
  ): Promise<ControllerRunSummary<TArtifact>>

  resume<TInput = unknown, TArtifact = unknown>(
    runId: RunId,
    options?: ControllerStartOptions
  ): Promise<ControllerRunSummary<TArtifact>>
}
