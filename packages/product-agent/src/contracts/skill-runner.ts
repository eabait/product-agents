import type { PlanNode, RunContext, StepId } from './core'

export interface SkillContext<TInput = unknown> {
  run: RunContext<TInput>
  step: PlanNode
  abortSignal?: AbortSignal
  metadata?: Record<string, unknown>
}

export interface SkillRegistration<TInput = unknown, TOutput = unknown> {
  id: string
  label: string
  version: string
  description?: string
  supportsStreaming?: boolean
  run: (request: SkillRequest<TInput, TOutput>) => Promise<SkillResult<TOutput>>
  stream?: (request: SkillRequest<TInput, TOutput>) => AsyncIterable<SkillProgressEvent<TOutput>>
  validateInput?: (input: unknown) => TInput
}

export interface SkillRequest<TInput = unknown, TOutput = unknown> {
  skillId: string
  planNode: PlanNode
  input: TInput
  context: SkillContext
  expectedOutputShape?: SkillOutputShape<TOutput>
}

export interface SkillOutputShape<TOutput = unknown> {
  kind: 'markdown' | 'json' | 'sections' | 'artifact' | 'other'
  schema?: unknown
  metadata?: Record<string, unknown>
  example?: TOutput
}

export interface SkillResult<TOutput = unknown> {
  output: TOutput
  usage?: Record<string, unknown>
  confidence?: number
  metadata?: Record<string, unknown>
  nextSteps?: StepId[]
}

export interface SkillProgressEvent<TOutput = unknown> {
  type: 'chunk' | 'status' | 'complete'
  timestamp: string
  chunk?: TOutput
  message?: string
  metadata?: Record<string, unknown>
}

export interface SkillRunner<TInput = unknown, TOutput = unknown> {
  invoke(request: SkillRequest<TInput, TOutput>): Promise<SkillResult<TOutput>>
  invokeStreaming?(request: SkillRequest<TInput, TOutput>): AsyncIterable<SkillProgressEvent<TOutput>>
}
