import type { EffectiveRunSettings } from '../config/product-agent.config'
import type { ArtifactIntent } from './intent'

export type RunId = string
export type PlanId = string
export type StepId = string
export type ArtifactId = string

export type ArtifactKind = 'prd' | 'persona' | 'research' | 'story-map' | string

export interface ArtifactMetadata {
  createdAt: string
  updatedAt?: string
  createdBy?: string
  tags?: string[]
  confidence?: number
  usage?: Record<string, unknown>
  extras?: Record<string, unknown>
}

export interface Artifact<TData = unknown> {
  id: ArtifactId
  kind: ArtifactKind
  version: string
  label?: string
  data: TData
  metadata?: ArtifactMetadata
}

export interface RunRequest<TInput = unknown> {
  artifactKind: ArtifactKind
  input: TInput
  createdBy: string
  correlationId?: string
  attributes?: Record<string, unknown>
  intentPlan?: ArtifactIntent
}

export interface RunContext<TInput = unknown, TWorkspace = unknown> {
  runId: RunId
  request: RunRequest<TInput>
  settings: EffectiveRunSettings
  workspace: TWorkspace
  startedAt: Date
  metadata?: Record<string, unknown>
  intentPlan?: ArtifactIntent
}

export type PlanNodeStatus = 'pending' | 'ready' | 'running' | 'complete' | 'blocked' | 'failed'

export interface PlanNode<TTask = unknown> {
  id: StepId
  label: string
  description?: string
  task: TTask
  status: PlanNodeStatus
  dependsOn: StepId[]
  metadata?: Record<string, unknown>
}

export interface PlanGraph<TTask = unknown> {
  id: PlanId
  artifactKind: ArtifactKind
  entryId: StepId
  nodes: Record<StepId, PlanNode<TTask>>
  createdAt: Date
  version: string
  rationale?: string
  metadata?: Record<string, unknown>
}

export type RunStatus = 'pending' | 'running' | 'awaiting-input' | 'blocked' | 'failed' | 'completed'

export type ProgressEventType =
  | 'plan.created'
  | 'plan.updated'
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'verification.started'
  | 'verification.completed'
  | 'verification.issue'
  | 'artifact.delivered'
  | 'run.status'
  | 'subagent.started'
  | 'subagent.progress'
  | 'subagent.completed'
  | 'subagent.failed'

export interface ProgressEvent<TPayload = unknown> {
  type: ProgressEventType
  timestamp: string
  runId: RunId
  stepId?: StepId
  payload?: TPayload
  message?: string
  status?: RunStatus
}

export interface ControllerDependencies<TPlannerTask = unknown, TWorkspace = unknown> {
  clock?: () => Date
  logger?: {
    debug: (...args: unknown[]) => void
    info: (...args: unknown[]) => void
    warn: (...args: unknown[]) => void
    error: (...args: unknown[]) => void
  }
  abortSignal?: AbortSignal
  plannerTaskAdapter?: (node: PlanNode<TPlannerTask>) => Record<string, unknown>
  workspaceAdapter?: (workspace: TWorkspace) => Record<string, unknown>
}
