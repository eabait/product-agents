declare module '@product-agents/product-agent' {
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

  export interface Artifact<T = unknown> {
    id: string
    kind: ArtifactKind
    version: string
    label?: string
    data: T
    metadata?: ArtifactMetadata
  }

  export interface SubagentManifest {
    id: string
    package: string
    version: string
    label: string
    creates: ArtifactKind
    consumes: ArtifactKind[]
    capabilities?: string[]
    description?: string
    entry: string
    exportName?: string
    tags?: string[]
  }

  export interface RunContext<TInput = unknown> {
    runId: string
    request: {
      artifactKind: ArtifactKind
      input: TInput
      createdBy: string
      attributes?: Record<string, unknown>
    }
    settings: {
      model: string
      temperature?: number
      maxOutputTokens?: number
    }
    workspace?: unknown
    startedAt: Date
    metadata?: Record<string, unknown>
    intentPlan?: Record<string, unknown>
  }

  export interface TraceContextInfo {
    traceId: string
    parentSpanId?: string
  }

  export interface ProgressEvent {
    type: string
    timestamp: string
    runId: string
    message?: string
    payload?: Record<string, unknown>
  }

  export interface SubagentRequest<TParams = unknown, TSourceArtifact = unknown> {
    params: TParams
    run: RunContext
    sourceArtifact?: Artifact<TSourceArtifact>
    sourceArtifacts?: Map<ArtifactKind, Artifact[]>
    emit?: (event: ProgressEvent) => void
    traceContext?: TraceContextInfo
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
    metadata: {
      id: string
      label: string
      version: string
      artifactKind: ArtifactKind
      sourceKinds: ArtifactKind[]
      description?: string
      tags?: string[]
    }
    execute(request: SubagentRequest<TParams, TSourceArtifact>): Promise<SubagentResult<TResultArtifact>>
  }

  export interface StoryMapPersonaLink {
    personaId: string
    goal: string
    painPoints?: string[]
  }

  export interface StoryMapStory {
    id: string
    title: string
    asA: string
    iWant: string
    soThat: string
    acceptanceCriteria: string[]
    effort?: 'xs' | 's' | 'm' | 'l' | 'xl'
    confidence?: number
    personas?: StoryMapPersonaLink[]
  }

  export interface StoryMapEpic {
    id: string
    name: string
    outcome: string
    stories: StoryMapStory[]
    dependencies?: string[]
    metrics?: string[]
  }

  export interface StoryMapArtifact {
    version: string
    label: string
    personasReferenced: string[]
    epics: StoryMapEpic[]
    roadmapNotes?: {
      releaseRings?: Array<{
        label: string
        targetDate?: string
        epicIds: string[]
      }>
      risks?: string[]
      assumptions?: string[]
    }
  }
}
