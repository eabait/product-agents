import type { Artifact, RunContext, StepId } from './core'

export interface VerificationIssue {
  id: string
  stepId?: StepId
  message: string
  severity: 'info' | 'warning' | 'error'
  suggestedAction?: string
  metadata?: Record<string, unknown>
}

export interface VerificationRequest<TArtifact = unknown, TInput = unknown> {
  artifact: Artifact<TArtifact>
  context: RunContext<TInput>
  metadata?: Record<string, unknown>
}

export interface VerificationResult<TArtifact = unknown> {
  status: 'pass' | 'fail' | 'needs-review'
  artifact: Artifact<TArtifact>
  issues: VerificationIssue[]
  usage?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export interface Verifier<TArtifact = unknown, TInput = unknown> {
  verify(request: VerificationRequest<TArtifact, TInput>): Promise<VerificationResult<TArtifact>>
}
