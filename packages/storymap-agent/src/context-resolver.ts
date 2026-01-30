import type { Artifact, ArtifactKind } from '@product-agents/product-agent'
import type { StoryMapArtifact, StoryMapEpic, StoryMapStory, StoryMapPersonaLink } from '@product-agents/product-agent'

const MAX_FINDINGS = 8
const MAX_PERSONAS = 6
const MAX_SECTIONS = 6

type MaybeArtifactMap = Map<ArtifactKind, Artifact[] | undefined> | undefined

export interface StoryMapContext {
  prdSummary?: string
  prdSections?: Record<string, unknown>
  personas?: Array<{ id: string; name?: string; goals?: string[]; frustrations?: string[] }>
  research?: { findings?: string[]; recommendations?: string[]; limitations?: string[] }
  existingStoryMap?: StoryMapArtifact
  sourcesUsed: string[]
}

const selectLatest = (artifacts?: Artifact[]): Artifact | undefined => {
  if (!artifacts || artifacts.length === 0) return undefined
  return artifacts[artifacts.length - 1]
}

const coerceStringArray = (value: unknown): string[] => {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(v => typeof v === 'string') as string[]
  if (typeof value === 'string') return [value]
  return []
}

const take = <T>(items: T[] | undefined, limit: number): T[] => {
  if (!items) return []
  return items.slice(0, limit)
}

export const resolveStoryMapContext = (
  sourceArtifacts: MaybeArtifactMap,
  sourceArtifact?: Artifact
): StoryMapContext => {
  const result: StoryMapContext = { sourcesUsed: [] }

  const artifactsByKind = sourceArtifacts ?? new Map<ArtifactKind, Artifact[]>()

  const prd = selectLatest(artifactsByKind.get('prd') ?? [])
  if (prd?.data && typeof prd.data === 'object') {
    const data = prd.data as Record<string, unknown>
    const sections = (data.sections as Record<string, unknown> | undefined) ?? data
    result.prdSections = sections
    const summaryFields = ['solutionOverview', 'problemStatement', 'executiveSummary']
    const summary = summaryFields
      .map(key => {
        const value = sections?.[key]
        return typeof value === 'string' ? value : undefined
      })
      .find(Boolean)
    if (summary) {
      result.prdSummary = summary
    }
    result.sourcesUsed.push('prd')
  }

  const personas = selectLatest(artifactsByKind.get('persona') ?? [])
  if (personas?.data && typeof personas.data === 'object') {
    const data = personas.data as { personas?: Array<Record<string, unknown>> }
    const mapped = (data.personas ?? []).slice(0, MAX_PERSONAS).map(entry => ({
      id: typeof entry.id === 'string' ? entry.id : 'persona',
      name: typeof entry.name === 'string' ? entry.name : undefined,
      goals: coerceStringArray(entry.goals).slice(0, 5),
      frustrations: coerceStringArray(entry.frustrations).slice(0, 5)
    }))
    if (mapped.length > 0) {
      result.personas = mapped
      result.sourcesUsed.push('persona')
    }
  }

  const research = selectLatest(artifactsByKind.get('research') ?? [])
  if (research?.data && typeof research.data === 'object') {
    const data = research.data as Record<string, unknown>
    result.research = {
      findings: take(coerceStringArray((data.findings as unknown[] | undefined)?.map((f: any) => f?.summary ?? f?.insight ?? f)), MAX_FINDINGS),
      recommendations: take(
        coerceStringArray((data.recommendations as unknown[] | undefined)?.map((r: any) => r?.action ?? r)),
        MAX_FINDINGS
      ),
      limitations: take(coerceStringArray(data.limitations), 5)
    }
    result.sourcesUsed.push('research')
  }

  const storyMap = selectLatest(artifactsByKind.get('story-map') ?? [])
  if (storyMap?.data) {
    result.existingStoryMap = storyMap.data as StoryMapArtifact
    result.sourcesUsed.push('story-map')
  }

  // If invoked with only sourceArtifact, use it as a fallback for whichever kind it is
  if (result.sourcesUsed.length === 0 && sourceArtifact) {
    const kind = sourceArtifact.kind
    if (kind === 'prd') {
      artifactsByKind.set('prd', [sourceArtifact])
      return resolveStoryMapContext(artifactsByKind, undefined)
    }
    if (kind === 'persona') {
      artifactsByKind.set('persona', [sourceArtifact])
      return resolveStoryMapContext(artifactsByKind, undefined)
    }
    if (kind === 'research') {
      artifactsByKind.set('research', [sourceArtifact])
      return resolveStoryMapContext(artifactsByKind, undefined)
    }
  }

  return result
}

export type { StoryMapArtifact, StoryMapEpic, StoryMapStory, StoryMapPersonaLink }
