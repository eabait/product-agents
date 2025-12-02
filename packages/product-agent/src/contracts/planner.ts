import type { PlanGraph, RunContext } from './core'

export interface PlannerDiagnostics {
  tokensConsumed?: number
  model?: string
  latencyMs?: number
  metadata?: Record<string, unknown>
}

export interface PlanDraft<TTask = unknown, TInput = unknown> {
  plan: PlanGraph<TTask>
  context: RunContext<TInput>
  diagnostics?: PlannerDiagnostics
}

export interface PlanRefinementInput<TTask = unknown, TInput = unknown> {
  currentPlan: PlanGraph<TTask>
  context: RunContext<TInput>
  feedback?: {
    issues: string[]
    blocking?: boolean
    metadata?: Record<string, unknown>
  }
}

export interface Planner<TTask = unknown, TInput = unknown> {
  createPlan(context: RunContext<TInput>): Promise<PlanDraft<TTask>>
  refinePlan(input: PlanRefinementInput<TTask, TInput>): Promise<PlanDraft<TTask>>
}
