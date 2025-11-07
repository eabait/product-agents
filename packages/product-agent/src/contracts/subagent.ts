import type { Artifact, ArtifactKind, ProgressEvent, RunContext } from './core'

export interface SubagentMetadata {
  id: string
  label: string
  version: string
  artifactKind: ArtifactKind
  sourceKinds: ArtifactKind[]
  description?: string
  tags?: string[]
}

export interface SubagentRequest<TParams = unknown, TSourceArtifact = unknown> {
  params: TParams
  run: RunContext
  sourceArtifact?: Artifact<TSourceArtifact>
  emit?: (event: ProgressEvent) => void
}

export interface SubagentResult<TArtifact = unknown> {
  artifact: Artifact<TArtifact>
  progress?: ProgressEvent[]
  metadata?: Record<string, unknown>
}

export interface SubagentLifecycle<
  TParams = unknown,
  TSourceArtifact = unknown,
  TResultArtifact = unknown
> {
  metadata: SubagentMetadata
  execute(request: SubagentRequest<TParams, TSourceArtifact>): Promise<SubagentResult<TResultArtifact>>
}

export interface SubagentRunSummary<TArtifact = unknown> {
  subagentId: string
  artifact: Artifact<TArtifact>
  metadata?: Record<string, unknown>
}
