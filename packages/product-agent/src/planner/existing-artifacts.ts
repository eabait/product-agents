import type { Artifact, ArtifactKind, RunContext } from '../contracts/core'
import type { SectionRoutingRequest, SectionRoutingResponse } from '@product-agents/prd-shared'

type MaybeArtifact = Partial<Artifact> & Record<string, unknown>

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return []
  return Array.isArray(value) ? value : [value]
}

const coerceArtifact = (candidate: MaybeArtifact, kind: ArtifactKind, index = 0): Artifact => {
  const id =
    (typeof candidate.id === 'string' && candidate.id.trim().length > 0
      ? candidate.id
      : `existing-${kind}-${index}`) ?? `existing-${kind}-${index}`

  const version =
    (typeof candidate.version === 'string' && candidate.version.trim().length > 0
      ? candidate.version
      : '1.0.0') ?? '1.0.0'

  const label =
    typeof candidate.label === 'string' && candidate.label.trim().length > 0
      ? candidate.label
      : undefined

  return {
    id,
    kind: (candidate.kind as ArtifactKind) ?? kind,
    version,
    label,
    data: (candidate as Artifact).data ?? candidate,
    metadata: (candidate as Artifact).metadata
  }
}

const addArtifacts = (
  map: Map<ArtifactKind, Artifact[]>,
  kind: ArtifactKind,
  candidates: MaybeArtifact[]
): void => {
  candidates.forEach((candidate, index) => {
    try {
      const artifact = coerceArtifact(candidate, kind, index)
      const existing = map.get(kind) ?? []
      existing.push(artifact)
      map.set(kind, existing)
    } catch {
      // ignore malformed candidates
    }
  })
}

export interface ExistingArtifactsResult {
  artifactsByKind: Map<ArtifactKind, Artifact[]>
  kinds: ArtifactKind[]
}

/**
 * Extracts any pre-existing artifacts supplied on the request/context so
 * planners and intent resolvers can skip regenerating them.
 */
export const extractExistingArtifactsFromContext = (
  context: RunContext<SectionRoutingRequest>
): ExistingArtifactsResult => {
  const artifactsByKind = new Map<ArtifactKind, Artifact[]>()
  const input = context.request.input as SectionRoutingRequest | undefined
  const sectionContext = input?.context as
    | (SectionRoutingRequest['context'] & {
        existingPersonas?: unknown
        existingStoryMap?: unknown
        existingResearch?: unknown
      })
    | undefined

  if (sectionContext?.existingPRD) {
    addArtifacts(
      artifactsByKind,
      'prd',
      asArray(sectionContext.existingPRD as MaybeArtifact) as MaybeArtifact[]
    )
  }

  if (sectionContext?.existingPersonas) {
    addArtifacts(
      artifactsByKind,
      'persona',
      asArray(sectionContext.existingPersonas as MaybeArtifact) as MaybeArtifact[]
    )
  }

  if (sectionContext?.existingStoryMap) {
    addArtifacts(
      artifactsByKind,
      'story-map',
      asArray(sectionContext.existingStoryMap as MaybeArtifact) as MaybeArtifact[]
    )
  }

  if (sectionContext?.existingResearch) {
    addArtifacts(
      artifactsByKind,
      'research',
      asArray(sectionContext.existingResearch as MaybeArtifact) as MaybeArtifact[]
    )
  }

  // If callers pass already-normalized artifacts in attributes.intentPlan or metadata, pick them up.
  const metadataArtifacts = (context.metadata as Record<string, unknown> | undefined)?.artifacts
  if (Array.isArray(metadataArtifacts)) {
    metadataArtifacts.forEach(entry => {
      if (entry && typeof entry === 'object' && typeof (entry as Artifact).kind === 'string') {
        addArtifacts(
          artifactsByKind,
          (entry as Artifact).kind as ArtifactKind,
          [entry as MaybeArtifact]
        )
      }
    })
  }

  return {
    artifactsByKind,
    kinds: Array.from(artifactsByKind.keys())
  }
}
