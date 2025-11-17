import { randomUUID } from 'node:crypto'

import type { Artifact, SubagentLifecycle } from '@product-agents/product-agent'
import type { SectionRoutingRequest, SectionRoutingResponse } from '@product-agents/prd-shared'

interface PersonaBuilderOptions {
  clock?: () => Date
  idFactory?: () => string
}

interface PersonaBuilderParams {
  targetUsers?: string[]
  keyFeatures?: string[]
  constraints?: string[]
  successMetrics?: Array<{ metric: string; target?: string; timeline?: string } | string>
  contextPayload?: unknown
  description?: string
}

export interface PersonaProfile {
  id: string
  name: string
  summary: string
  goals: string[]
  frustrations: string[]
  opportunities: string[]
  successIndicators: string[]
  quote: string
  tags: string[]
}

export interface PersonaArtifact {
  personas: PersonaProfile[]
  source: {
    artifactId: string
    artifactKind: string
    runId: string
    sectionsUsed: string[]
  }
  generatedAt: string
  notes?: string
}

type SectionsMap = Record<string, unknown>

const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
  !!candidate && typeof candidate === 'object' && !Array.isArray(candidate)

const collectFromContextItems = (
  payload: unknown,
  predicate: (item: Record<string, unknown>) => boolean
): string[] => {
  if (!isRecord(payload)) {
    return []
  }

  const items = payload.categorizedContext
  if (!Array.isArray(items)) {
    return []
  }

  const results: string[] = []
  for (const raw of items) {
    if (!isRecord(raw)) {
      continue
    }
    if (!predicate(raw)) {
      continue
    }
    const content = typeof raw.content === 'string' && raw.content.trim().length > 0 ? raw.content.trim() : undefined
    const title = typeof raw.title === 'string' && raw.title.trim().length > 0 ? raw.title.trim() : undefined
    if (content) {
      results.push(content)
    } else if (title) {
      results.push(title)
    }
  }
  return results
}

const collectFromSelectedMessages = (payload: unknown): string[] => {
  if (!isRecord(payload)) {
    return []
  }
  const messages = payload.selectedMessages
  if (!Array.isArray(messages)) {
    return []
  }
  const snippets: string[] = []
  messages.forEach(entry => {
    if (!isRecord(entry)) {
      return
    }
    const content = typeof entry.content === 'string' ? entry.content.trim() : ''
    if (content) {
      snippets.push(content)
    }
  })
  return snippets
}

const PERSONA_KEYWORDS = /(persona|user|customer|stakeholder|manager|lead|designer|engineer|analyst|operator|strategist|researcher)/i
const FEATURE_KEYWORDS = /(feature|workflow|allows|enable|build|design|support|helps|optimise|optimize|dashboard|automation)/i
const CONSTRAINT_KEYWORDS = /(constraint|limitation|must|need to|blocked|cannot|compliance|deadline|restriction|budget|limited)/i
const METRIC_KEYWORDS = /(increase|improve|reduce|grow|target)/i

const splitTextIntoCandidates = (text: string): string[] =>
  text
    .split(/\n+/)
    .flatMap(chunk => chunk.split(/(?<=[.!?])\s+/))
    .map(entry => entry.replace(/^[-•–*]+/, '').trim())
    .filter(Boolean)

const extractByKeyword = (text: string, matcher: RegExp): string[] =>
  splitTextIntoCandidates(text).filter(sentence => matcher.test(sentence)).map(sentence => sentence.trim())

const normalizeMetricInput = (input: PersonaBuilderParams['successMetrics']): Array<{
  metric: string
  target?: string
  timeline?: string
}> => {
  if (!input) {
    return []
  }
  return input
    .map(entry => {
      if (typeof entry === 'string') {
        const trimmed = entry.trim()
        return trimmed ? { metric: trimmed } : null
      }
      if (!entry || typeof entry.metric !== 'string') {
        return null
      }
      return {
        metric: entry.metric.trim(),
        target: entry.target?.trim(),
        timeline: entry.timeline?.trim()
      }
    })
    .filter((entry): entry is { metric: string; target?: string; timeline?: string } => !!entry && !!entry.metric)
}

const buildSectionsFromPrompt = (
  params: PersonaBuilderParams | undefined,
  input: SectionRoutingRequest | undefined
): { sections: SectionsMap; summary?: string } => {
  const sections: SectionsMap = {}
  const summaryCandidates = [params?.description, input?.message].filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0
  )
  const summary = summaryCandidates[0]?.trim()

  const targetUsers: string[] = []
  const features: string[] = []
  const constraints: string[] = []

  sanitizeStringArray(params?.targetUsers).forEach(entry => targetUsers.push(entry))
  sanitizeStringArray(params?.keyFeatures).forEach(entry => features.push(entry))
  sanitizeStringArray(params?.constraints).forEach(entry => constraints.push(entry))

  const metricEntries = normalizeMetricInput(params?.successMetrics)

  const payloads = [params?.contextPayload, input?.context?.contextPayload].filter(Boolean)
  payloads.forEach(payload => {
    collectFromContextItems(payload, candidate => {
      const tagList = sanitizeStringArray(candidate.tags)
      const category = typeof candidate.category === 'string' ? candidate.category.toLowerCase() : ''
      return category === 'stakeholder' || tagList.some(tag => /persona|user|audience/i.test(tag))
    }).forEach(entry => targetUsers.push(entry))

    collectFromContextItems(payload, candidate => {
      const category = typeof candidate.category === 'string' ? candidate.category.toLowerCase() : ''
      return category === 'requirement'
    }).forEach(entry => features.push(entry))

    collectFromContextItems(payload, candidate => {
      const category = typeof candidate.category === 'string' ? candidate.category.toLowerCase() : ''
      return category === 'constraint'
    }).forEach(entry => constraints.push(entry))

    collectFromSelectedMessages(payload).forEach(snippet => {
      extractByKeyword(snippet, PERSONA_KEYWORDS).forEach(entry => targetUsers.push(entry))
      extractByKeyword(snippet, FEATURE_KEYWORDS).forEach(entry => features.push(entry))
      extractByKeyword(snippet, CONSTRAINT_KEYWORDS).forEach(entry => constraints.push(entry))
    })
  })

  if (summary) {
    extractByKeyword(summary, PERSONA_KEYWORDS).forEach(entry => targetUsers.push(entry))
    extractByKeyword(summary, FEATURE_KEYWORDS).forEach(entry => features.push(entry))
    extractByKeyword(summary, CONSTRAINT_KEYWORDS).forEach(entry => constraints.push(entry))
  }

  const uniqueTargets = dedupe(targetUsers).slice(0, 6)
  if (uniqueTargets.length > 0) {
    sections.targetUsers = {
      targetUsers: uniqueTargets
    }
  }

  const uniqueFeatures = dedupe(features).slice(0, 8)
  if (uniqueFeatures.length > 0) {
    sections.keyFeatures = {
      keyFeatures: uniqueFeatures
    }
  }

  const uniqueConstraints = dedupe(constraints).slice(0, 6)
  if (uniqueConstraints.length > 0) {
    sections.constraints = {
      constraints: uniqueConstraints
    }
  }

  if (metricEntries.length > 0) {
    sections.successMetrics = {
      successMetrics: metricEntries
    }
  }

  if (summary) {
    sections.solution = {
      solutionOverview: summary
    }
  }

  return {
    sections,
    summary
  }
}

const normalizeKey = (key: string): string => key.toLowerCase().replace(/[\s_-]/g, '')

const findSection = (sections: SectionsMap, candidates: string[]): unknown => {
  const normalizedCandidates = new Set(candidates.map(normalizeKey))
  for (const [key, value] of Object.entries(sections)) {
    if (normalizedCandidates.has(normalizeKey(key))) {
      return value
    }
  }
  return undefined
}

const sanitizeStringArray = (input: unknown): string[] => {
  if (!input) {
    return []
  }

  const collect: string[] = []
  const pushIfValid = (value: unknown) => {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) {
        collect.push(trimmed)
      }
    }
  }

  if (Array.isArray(input)) {
    input.forEach(pushIfValid)
    return Array.from(new Set(collect))
  }

  if (typeof input === 'object') {
    if (Array.isArray((input as any).items)) {
      ((input as any).items as unknown[]).forEach(pushIfValid)
    } else if (Array.isArray((input as any).list)) {
      ((input as any).list as unknown[]).forEach(pushIfValid)
    }
  }

  return Array.from(new Set(collect))
}

const dedupe = (values: string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const key = value.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    result.push(value)
  }
  return result
}

const extractNestedStrings = (input: unknown, key: string): string[] => {
  if (!input || typeof input !== 'object') {
    return []
  }

  const candidate = (input as any)[key]
  if (!candidate) {
    return []
  }
  return sanitizeStringArray(candidate)
}

const extractTargetUsers = (sections: SectionsMap, sectionsUsed: Set<string>): string[] => {
  const candidate = findSection(sections, ['targetusers', 'personas', 'audience'])
  let values = sanitizeStringArray(candidate)

  if (values.length === 0 && candidate) {
    values = extractNestedStrings(candidate, 'targetUsers')
  }

  if (values.length > 0) {
    sectionsUsed.add('targetUsers')
  }

  return values.slice(0, 4)
}

const extractKeyFeatures = (sections: SectionsMap, sectionsUsed: Set<string>): string[] => {
  const candidate = findSection(sections, ['keyfeatures', 'features', 'capabilities'])
  let values = sanitizeStringArray(candidate)

  if (values.length === 0 && candidate) {
    values = extractNestedStrings(candidate, 'keyFeatures')
  }

  if (values.length > 0) {
    sectionsUsed.add('keyFeatures')
  }

  return values.slice(0, 6)
}

const extractConstraints = (sections: SectionsMap, sectionsUsed: Set<string>): string[] => {
  const candidate = findSection(sections, ['constraints', 'limitations', 'assumptions'])
  const constraints = new Set<string>()

  sanitizeStringArray(candidate).forEach(entry => constraints.add(entry))

  if (candidate && typeof candidate === 'object') {
    extractNestedStrings(candidate, 'constraints').forEach(entry => constraints.add(entry))
    extractNestedStrings(candidate, 'assumptions').forEach(entry => constraints.add(entry))
  }

  const result = Array.from(constraints)
  if (result.length > 0) {
    sectionsUsed.add('constraints')
  }
  return result.slice(0, 6)
}

const extractSuccessMetrics = (sections: SectionsMap, sectionsUsed: Set<string>): string[] => {
  const candidate = findSection(sections, ['successmetrics', 'metrics', 'outcomes'])
  const metrics: string[] = []

  const serializeMetric = (metric: any) => {
    if (!metric || typeof metric !== 'object') {
      return null
    }
    const name = typeof metric.metric === 'string' ? metric.metric.trim() : ''
    const target = typeof metric.target === 'string' ? metric.target.trim() : ''
    const timeline = typeof metric.timeline === 'string' ? metric.timeline.trim() : ''
    if (!name) {
      return null
    }
    const parts = [name]
    if (target) {
      parts.push(`Target: ${target}`)
    }
    if (timeline) {
      parts.push(`Timeline: ${timeline}`)
    }
    return parts.join(' — ')
  }

  if (Array.isArray(candidate)) {
    candidate.forEach(entry => {
      const serialized = serializeMetric(entry)
      if (serialized) {
        metrics.push(serialized)
      }
    })
  } else if (candidate && typeof candidate === 'object') {
    const nested = (candidate as any).successMetrics
    if (Array.isArray(nested)) {
      nested.forEach(entry => {
        const serialized = serializeMetric(entry)
        if (serialized) {
          metrics.push(serialized)
        }
      })
    }
  }

  if (metrics.length > 0) {
    sectionsUsed.add('successMetrics')
  }

  return metrics.slice(0, 6)
}

const extractSolutionSummary = (sections: SectionsMap, sectionsUsed: Set<string>): string | undefined => {
  const candidate = findSection(sections, ['solution', 'overview'])
  if (!candidate || typeof candidate !== 'object') {
    return undefined
  }

  const overview =
    typeof (candidate as any).solutionOverview === 'string'
      ? (candidate as any).solutionOverview.trim()
      : undefined
  if (overview) {
    sectionsUsed.add('solution')
    return overview
  }

  const approach =
    typeof (candidate as any).approach === 'string'
      ? (candidate as any).approach.trim()
      : undefined
  if (approach) {
    sectionsUsed.add('solution')
    return approach
  }

  return undefined
}

const toTitleCase = (input: string): string =>
  input
    .split(/\s+/)
    .map(token => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ')

const inferPersonaName = (summary: string, index: number): string => {
  const cleaned = summary.replace(/^[-•–*]+/, '').trim()
  if (!cleaned) {
    return `Persona ${index + 1}`
  }

  const colonIndex = cleaned.indexOf(':')
  const dashIndex = cleaned.indexOf(' - ')
  const sentenceEnd = cleaned.indexOf('.')

  let candidate: string
  if (colonIndex > 0 && colonIndex < 80) {
    candidate = cleaned.slice(0, colonIndex)
  } else if (dashIndex > 0 && dashIndex < 80) {
    candidate = cleaned.slice(0, dashIndex)
  } else if (sentenceEnd > 0 && sentenceEnd < 80) {
    candidate = cleaned.slice(0, sentenceEnd)
  } else {
    candidate = cleaned.split(/[,;]/)[0] ?? cleaned
  }

  candidate = candidate.replace(/\(.*?\)/g, '').trim()
  if (!candidate) {
    return `Persona ${index + 1}`
  }

  const words = candidate.split(/\s+/).slice(0, 5)
  return toTitleCase(words.join(' '))
}

const toSentenceCase = (input: string): string => {
  if (!input) return ''
  const trimmed = input.trim()
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

const extractGoals = (summary: string, keyFeatures: string[], metrics: string[]): string[] => {
  const patterns = [
    /(needs to|needs|wants to|aims to|tries to|hopes to|in order to|so they can)\s+([^.;]+)/gi,
    /(seeks to|focused on|goal is to)\s+([^.;]+)/gi
  ]

  const goals: string[] = []
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(summary)) !== null) {
      const phrase = match[2]?.trim()
      if (phrase) {
        goals.push(toSentenceCase(phrase))
      }
    }
  }

  if (goals.length === 0) {
    goals.push(...keyFeatures.slice(0, 2))
  }
  if (goals.length === 0) {
    goals.push(...metrics.slice(0, 1))
  }

  return dedupe(goals).slice(0, 3)
}

const extractFrustrations = (summary: string, constraints: string[]): string[] => {
  const patterns = [
    /(struggles with|frustrated by|blocked by|pain point(?:s)? include)\s+([^.;]+)/gi,
    /(but|however)\s+([^.;]+)/gi
  ]

  const frustrations: string[] = []
  for (const pattern of patterns) {
    let match: RegExpExecArray | null
    while ((match = pattern.exec(summary)) !== null) {
      const phrase = match[2]?.trim()
      if (phrase) {
        frustrations.push(toSentenceCase(phrase))
      }
    }
  }

  if (frustrations.length === 0) {
    frustrations.push(...constraints.slice(0, 2))
  }

  return dedupe(frustrations).slice(0, 3)
}

const deriveTags = (name: string, summary: string): string[] => {
  const tokens = `${name} ${summary}`
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3 && token.length <= 20)

  const prioritized = tokens.filter(token => /^[A-Z]/.test(token))
  const pool = prioritized.length > 0 ? prioritized : tokens

  return dedupe(pool.map(token => token.toLowerCase())).slice(0, 4)
}

const buildQuote = (summary: string): string => {
  const trimmed = summary.trim()
  if (!trimmed) {
    return ''
  }
  return trimmed.endsWith('.') ? trimmed : `${trimmed}.`
}

const buildOpportunities = (features: string[]): string[] => features.slice(0, 3)

const buildPersonaProfiles = (
  targetUsers: string[],
  keyFeatures: string[],
  constraints: string[],
  metrics: string[],
  solutionSummary: string | undefined
): PersonaProfile[] => {
  const personas: PersonaProfile[] = []
  const inputs = targetUsers.length > 0 ? targetUsers : [solutionSummary ?? 'Primary target user inferred from PRD context.']

  inputs.slice(0, 4).forEach((summary, index) => {
    const safeSummary = summary && summary.trim().length > 0 ? summary.trim() : 'Primary target user persona derived from PRD context.'
    const name = inferPersonaName(safeSummary, index)
    const goals = extractGoals(safeSummary, keyFeatures, metrics)
    const frustrations = extractFrustrations(safeSummary, constraints)
    const opportunities = buildOpportunities(keyFeatures)
    const successIndicators = metrics.slice(0, 3)
    const quote = buildQuote(safeSummary)
    const tags = deriveTags(name, safeSummary)

    personas.push({
      id: `persona-${index + 1}`,
      name,
      summary: safeSummary,
      goals,
      frustrations,
      opportunities,
      successIndicators,
      quote,
      tags
    })
  })

  return personas
}

const resolveSectionsContext = (
  sourceArtifact: Artifact<SectionRoutingResponse> | undefined,
  params: PersonaBuilderParams | undefined,
  input: unknown
): { sections: SectionsMap; summary?: string; derivedFromPrompt: boolean } => {
  if (sourceArtifact) {
    const sourceData = sourceArtifact.data as SectionRoutingResponse | undefined
    if (!sourceData || typeof sourceData !== 'object' || !('sections' in sourceData)) {
      throw new Error('Persona builder expected PRD sections in the source artifact.')
    }
    return {
      sections: ((sourceData.sections ?? {}) as SectionsMap) ?? {},
      summary: undefined,
      derivedFromPrompt: false
    }
  }

  const sectionInput = (input as SectionRoutingRequest | undefined) ?? undefined
  const fallback = buildSectionsFromPrompt(params, sectionInput)
  return {
    sections: fallback.sections,
    summary: fallback.summary,
    derivedFromPrompt: true
  }
}

export const createPersonaBuilderSubagent = (
  options?: PersonaBuilderOptions
): SubagentLifecycle<PersonaBuilderParams, SectionRoutingResponse, PersonaArtifact> => {
  const clock = options?.clock ?? (() => new Date())
  const idFactory = options?.idFactory ?? (() => randomUUID())

  return {
    metadata: {
      id: 'persona.builder',
      label: 'Persona Builder',
      version: '0.1.0',
      artifactKind: 'persona',
      sourceKinds: ['prd', 'prompt'],
      description: 'Transforms PRD sections into structured persona summaries.',
      tags: ['persona', 'analysis', 'synthesis']
    },
    async execute(request) {
      const sectionInput = request.run.request.input as SectionRoutingRequest | undefined
      const { sections, summary: promptSummary, derivedFromPrompt } = resolveSectionsContext(
        request.sourceArtifact as Artifact<SectionRoutingResponse> | undefined,
        (request.params as PersonaBuilderParams | undefined) ?? undefined,
        sectionInput
      )
      const sectionsUsed = new Set<string>()
      if (derivedFromPrompt) {
        sectionsUsed.add('promptContext')
      }

      const targetUsers = extractTargetUsers(sections, sectionsUsed)
      const keyFeatures = extractKeyFeatures(sections, sectionsUsed)
      const constraints = extractConstraints(sections, sectionsUsed)
      const successMetrics = extractSuccessMetrics(sections, sectionsUsed)
      let solutionSummary = extractSolutionSummary(sections, sectionsUsed)
      if (!solutionSummary && promptSummary) {
        solutionSummary = promptSummary
        sectionsUsed.add('promptSummary')
      }

      const personas = buildPersonaProfiles(targetUsers, keyFeatures, constraints, successMetrics, solutionSummary)

      const generatedAt = clock().toISOString()
      const artifactId = `artifact-${idFactory()}`

      const sourceArtifactId =
        request.sourceArtifact?.id ?? (request.run.request.attributes?.sourceArtifactId as string | undefined)
      const derivedSourceId = sourceArtifactId ?? `input-${request.run.runId}`
      const sourceKind = request.sourceArtifact?.kind ?? request.run.request.artifactKind ?? 'prompt'

      const notes: string | undefined = (() => {
        const entries: string[] = []
        if (!request.sourceArtifact) {
          entries.push('Personas generated directly from prompt/context inputs without a PRD artifact.')
        }
        if (targetUsers.length === 0) {
          entries.push(
            'Personas inferred from broader PRD context due to missing target users section.'
          )
        }
        return entries.length > 0 ? entries.join(' ') : undefined
      })()

      const personaArtifact: Artifact<PersonaArtifact> = {
        id: artifactId,
        kind: 'persona',
        version: '1.0.0',
        label: 'Persona Bundle',
        data: {
          personas,
          source: {
            artifactId: derivedSourceId,
            artifactKind: sourceKind,
            runId: request.run.runId,
            sectionsUsed: Array.from(sectionsUsed)
          },
          generatedAt,
          notes
        },
        metadata: {
          createdAt: generatedAt,
          createdBy: request.run.request.createdBy,
          tags: ['persona', 'derived'],
          confidence: request.sourceArtifact?.metadata?.confidence ?? 0.58,
          extras: {
            sourceArtifactId: derivedSourceId,
            personaCount: personas.length,
            sectionsUsed: Array.from(sectionsUsed),
            sourceArtifactKind: sourceKind,
            sourceMode: request.sourceArtifact ? 'artifact' : 'prompt'
          }
        }
      }

      return {
        artifact: personaArtifact,
        metadata: {
          personaCount: personas.length,
          sectionsUsed: Array.from(sectionsUsed),
          sourceArtifactId: derivedSourceId
        }
      }
    }
  }
}
