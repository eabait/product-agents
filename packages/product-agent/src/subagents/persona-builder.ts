import { randomUUID } from 'node:crypto'

import type { Artifact } from '../contracts/core'
import type { SubagentLifecycle } from '../contracts/subagent'
import type { SectionRoutingResponse } from '@product-agents/prd-shared'

interface PersonaBuilderOptions {
  clock?: () => Date
  idFactory?: () => string
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

export const createPersonaBuilderSubagent = (
  options?: PersonaBuilderOptions
): SubagentLifecycle<unknown, SectionRoutingResponse, PersonaArtifact> => {
  const clock = options?.clock ?? (() => new Date())
  const idFactory = options?.idFactory ?? (() => randomUUID())

  return {
    metadata: {
      id: 'persona.builder',
      label: 'Persona Builder',
      version: '0.1.0',
      artifactKind: 'persona',
      sourceKinds: ['prd'],
      description: 'Transforms PRD sections into structured persona summaries.',
      tags: ['persona', 'analysis', 'synthesis']
    },
    async execute(request) {
      if (!request.sourceArtifact) {
        throw new Error('Persona builder requires a PRD artifact to operate.')
      }

      const sourceData = request.sourceArtifact.data as SectionRoutingResponse | undefined
      if (!sourceData || typeof sourceData !== 'object' || !('sections' in sourceData)) {
        throw new Error('Persona builder expected PRD sections in the source artifact.')
      }

      const sections = (sourceData.sections ?? {}) as SectionsMap
      const sectionsUsed = new Set<string>()

      const targetUsers = extractTargetUsers(sections, sectionsUsed)
      const keyFeatures = extractKeyFeatures(sections, sectionsUsed)
      const constraints = extractConstraints(sections, sectionsUsed)
      const successMetrics = extractSuccessMetrics(sections, sectionsUsed)
      const solutionSummary = extractSolutionSummary(sections, sectionsUsed)

      const personas = buildPersonaProfiles(targetUsers, keyFeatures, constraints, successMetrics, solutionSummary)

      const generatedAt = clock().toISOString()
      const artifactId = `artifact-${idFactory()}`

      const personaArtifact: Artifact<PersonaArtifact> = {
        id: artifactId,
        kind: 'persona',
        version: '1.0.0',
        label: 'Persona Bundle',
        data: {
          personas,
          source: {
            artifactId: request.sourceArtifact.id,
            artifactKind: request.sourceArtifact.kind,
            runId: request.run.runId,
            sectionsUsed: Array.from(sectionsUsed)
          },
          generatedAt,
          notes: targetUsers.length === 0 ? 'Personas inferred from broader PRD context due to missing target users section.' : undefined
        },
        metadata: {
          createdAt: generatedAt,
          createdBy: request.run.request.createdBy,
          tags: ['persona', 'derived'],
          confidence: request.sourceArtifact.metadata?.confidence ?? 0.6,
          extras: {
            sourceArtifactId: request.sourceArtifact.id,
            personaCount: personas.length,
            sectionsUsed: Array.from(sectionsUsed),
            sourceArtifactKind: request.sourceArtifact.kind
          }
        }
      }

      return {
        artifact: personaArtifact,
        metadata: {
          personaCount: personas.length,
          sectionsUsed: Array.from(sectionsUsed),
          sourceArtifactId: request.sourceArtifact.id
        }
      }
    }
  }
}
