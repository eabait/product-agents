import type { Artifact, ArtifactId, ArtifactKind, RunId } from './core'

export interface WorkspaceDescriptor {
  runId: RunId
  root: string
  createdAt: Date
  kind: ArtifactKind
  metadata?: Record<string, unknown>
}

export interface WorkspaceArtifactSummary {
  id: ArtifactId
  kind: ArtifactKind
  label?: string
  version: string
  createdAt: string
  updatedAt?: string
  metadata?: Record<string, unknown>
}

export interface WorkspaceHandle {
  descriptor: WorkspaceDescriptor
  resolve(...segments: string[]): string
}

export interface WorkspaceDAOOptions {
  persistArtifacts?: boolean
  tempSubdir?: string
}

export interface WorkspaceDAO {
  ensureWorkspace(runId: RunId, artifactKind: ArtifactKind, options?: WorkspaceDAOOptions): Promise<WorkspaceHandle>
  writeArtifact<TData = unknown>(runId: RunId, artifact: Artifact<TData>): Promise<void>
  readArtifact<TData = unknown>(runId: RunId, artifactId: ArtifactId): Promise<Artifact<TData> | null>
  listArtifacts(runId: RunId): Promise<WorkspaceArtifactSummary[]>
  appendEvent(runId: RunId, event: WorkspaceEvent): Promise<void>
  getEvents(runId: RunId): Promise<WorkspaceEvent[]>
  teardown(runId: RunId): Promise<void>
}

export interface WorkspaceEvent {
  id: string
  runId: RunId
  type: 'plan' | 'skill' | 'verification' | 'artifact' | 'system'
  createdAt: string
  payload: Record<string, unknown>
}
