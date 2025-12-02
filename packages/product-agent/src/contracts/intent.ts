import type { ArtifactKind } from './core'

export interface ArtifactTransition {
  fromArtifact?: ArtifactKind
  toArtifact: ArtifactKind
  description?: string
  metadata?: Record<string, unknown>
}

export interface ArtifactIntent {
  source: 'user' | 'resolver' | string
  requestedArtifacts: ArtifactKind[]
  targetArtifact: ArtifactKind
  transitions: ArtifactTransition[]
  confidence?: number
  metadata?: Record<string, unknown>
}
