declare module '@product-agents/product-agent' {
  export interface Artifact<T = unknown> {
    id: string
    kind: string
    version?: string
    label?: string
    data: T
    metadata?: Record<string, unknown>
    notes?: string[] | string
  }

  export interface SubagentManifest {
    id: string
    package: string
    version: string
    label: string
    description?: string
    creates?: string
    consumes?: string[]
    capabilities?: string[]
    entry?: string
    exportName?: string
    tags?: string[]
  }

  export interface SubagentLifecycle<P = unknown, I = unknown, A = unknown> {
    metadata: {
      id: string
      label: string
      version: string
      artifactKind: string
      sourceKinds?: string[]
      description?: string
      tags?: string[]
    }
    execute: (request: {
      params?: P
      run: {
        runId: string
        request: {
          input?: I
          artifactKind?: string
          attributes?: Record<string, unknown>
          createdBy?: string
        }
        settings: {
          model: string
          temperature?: number
          maxOutputTokens?: number
        }
      }
      sourceArtifact?: Artifact<any>
      emit?: (event: Record<string, unknown>) => void
    }) => Promise<{
      artifact?: Artifact<A>
      clarification?: unknown
      status?: string
      notes?: string[] | string
    }>
  }
}
