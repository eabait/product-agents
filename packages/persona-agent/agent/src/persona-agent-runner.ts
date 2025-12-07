import { z } from 'zod'

import { OpenRouterClient } from '@product-agents/openrouter-client'
type GenerationUsage = ReturnType<OpenRouterClient['getLastUsage']>

import { buildPersonaProfiles, type PersonaBuilderParams, type PersonaProfile } from './persona-subagent.js'

// Coerce persona payloads that sometimes arrive as JSON strings with stray parameter tags
const parsePersonaArrayString = (value: string): unknown => {
  const candidates: string[] = []
  const addCandidate = (candidate?: string) => {
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate)
    }
  }

  const trimmed = value.trim()
  const withoutFences = trimmed.replace(/^```(?:json)?/i, '').replace(/```\s*$/i, '').trim()

  addCandidate(withoutFences)
  addCandidate(withoutFences.replace(/,\s*$/, ''))

  if (withoutFences.startsWith('[')) {
    const lastBracket = withoutFences.lastIndexOf(']')
    if (lastBracket > 0) {
      addCandidate(withoutFences.slice(0, lastBracket + 1))
    }
  }

  if (withoutFences.includes('<parameter')) {
    const beforeParameter = withoutFences.slice(0, withoutFences.indexOf('<parameter')).trim()
    addCandidate(beforeParameter.replace(/,\s*$/, ''))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (Array.isArray(parsed)) {
        return parsed
      }
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).personas)) {
        return (parsed as any).personas
      }
    } catch {
      // continue to next candidate
    }
  }

  return undefined
}

const PersonaProfileSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  summary: z.string().min(1),
  goals: z.array(z.string().min(1)).min(1).max(5),
  frustrations: z.array(z.string().min(1)).min(1).max(5),
  opportunities: z.array(z.string().min(1)).min(1).max(5).default([]),
  successIndicators: z.array(z.string().min(1)).min(1).max(5).default([]),
  quote: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).max(8).default([])
})

const PersonaArraySchema = z.preprocess(value => {
  if (typeof value === 'string') {
    const parsed = parsePersonaArrayString(value)
    if (parsed !== undefined) {
      return parsed
    }
    return value
  }
  return value
}, z.array(PersonaProfileSchema).min(1).max(4))

const PersonaNotesSchema = z.preprocess(value => {
  if (!value) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) {
        return parsed
      }
    } catch {
      // fallback to wrapping string
    }
    return [value]
  }
  return value
}, z.array(z.string().min(1)).optional())

const PersonaResponseSchema = z.object({
  personas: PersonaArraySchema,
  notes: PersonaNotesSchema,
  rationale: z.string().optional()
})

type PersonaResponse = z.infer<typeof PersonaResponseSchema>

const MAX_CONTEXT_CHARS = 2000

export interface PersonaAgentRunnerInput {
  model: string
  temperature: number
  maxOutputTokens: number
  targetUsers: string[]
  keyFeatures: string[]
  constraints: string[]
  successMetrics: string[]
  solutionSummary?: string
  promptSummary?: string
  requestMessage?: string
  params?: PersonaBuilderParams
  contextSnippet?: string
  additionalNotes?: string[]
}

export interface PersonaAgentRunnerResult {
  personas: PersonaProfile[]
  strategy: 'llm' | 'heuristic'
  notes?: string[]
  usage?: GenerationUsage
  telemetry?: PersonaAgentTelemetry
}

export interface PersonaAgentRunnerOptions {
  client?: OpenRouterClient
}

const formatListBlock = (label: string, values: string[]): string => {
  if (!values || values.length === 0) {
    return `${label}: (none supplied)`
  }
  const items = values.map(entry => `- ${entry}`).join('\n')
  return `${label}:\n${items}`
}

const safeStringify = (value: unknown): string | undefined => {
  if (value === null || value === undefined) {
    return undefined
  }
  try {
    const serialized = JSON.stringify(value, null, 2)
    if (!serialized) {
      return undefined
    }
    if (serialized.length > MAX_CONTEXT_CHARS) {
      return `${serialized.slice(0, MAX_CONTEXT_CHARS)}…`
    }
    return serialized
  } catch {
    return undefined
  }
}

export const buildPersonaPrompt = (input: PersonaAgentRunnerInput): string => {
  const sections: string[] = []

  if (input.requestMessage) {
    sections.push(`Primary request or recent user message:\n${input.requestMessage}`)
  }
  if (input.solutionSummary) {
    sections.push(`Solution or product summary:\n${input.solutionSummary}`)
  } else if (input.promptSummary) {
    sections.push(`Prompt summary:\n${input.promptSummary}`)
  }

  sections.push(formatListBlock('Target users', input.targetUsers))
  sections.push(formatListBlock('Key features / jobs-to-be-done', input.keyFeatures))
  sections.push(formatListBlock('Constraints / frustrations', input.constraints))
  sections.push(formatListBlock('Success metrics', input.successMetrics))

  const description = input.params?.description
  if (description) {
    sections.push(`Additional brief/description:\n${description}`)
  }

  const serializedParams = safeStringify(input.params?.contextPayload)
  if (serializedParams) {
    sections.push(`Structured context payload (JSON):\n${serializedParams}`)
  } else if (input.contextSnippet) {
    sections.push(`Context payload snippet:\n${input.contextSnippet}`)
  }

  if (input.additionalNotes && input.additionalNotes.length > 0) {
    sections.push(`Other planning notes:\n${input.additionalNotes.join('\n')}`)
  }

  const contextBlock = sections.filter(Boolean).join('\n\n')

  return `You are a persona strategy analyst translating PRD inputs into 2-4 realistic personas. Each persona must capture who the user is, what motivates them, why they struggle today, and how success is measured.\n\nContext:\n${contextBlock}\n\nInstructions:\n- Prefer real user language pulled from the context.\n- Reflect constraints and success metrics in motivations.\n- Provide a short first-person quote tying back to their job.\n- Only mention assumptions when the context lacks detail.\n\nReturn ONLY valid JSON that matches this shape:\n{\n  "personas": [\n    {\n      "id": "persona-1",\n      "name": "2-4 word title",\n      "summary": "1-2 sentences describing the persona",\n      "goals": [""],\n      "frustrations": [""],\n      "opportunities": [""],\n      "successIndicators": [""],\n      "quote": "First-person quote",\n      "tags": ["primary", "ops"]\n    }\n  ],\n  "notes": ["Anything notable about missing context"]\n}`
}

const normalizePersona = (persona: z.infer<typeof PersonaProfileSchema>, index: number): PersonaProfile => {
  const ensureArray = (values: string[] | undefined): string[] =>
    Array.isArray(values) ? values.filter(entry => entry && entry.trim()).map(entry => entry.trim()) : []

  const normalizedId = persona.id && persona.id.trim().length > 0 ? persona.id.trim() : `persona-${index + 1}`

  return {
    id: normalizedId,
    name: persona.name.trim(),
    summary: persona.summary.trim(),
    goals: ensureArray(persona.goals),
    frustrations: ensureArray(persona.frustrations),
    opportunities: ensureArray(persona.opportunities),
    successIndicators: ensureArray(persona.successIndicators),
    quote: persona.quote?.trim() ?? '',
    tags: ensureArray(persona.tags)
  }
}

const createPreview = (value: string | undefined, limit = 480): string | undefined => {
  if (!value) {
    return undefined
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}…` : trimmed
}

export interface PersonaAgentTelemetry {
  model: string
  durationMs: number
  promptLength: number
  promptPreview?: string
  responsePreview?: string
  strategy: 'llm' | 'heuristic'
  timestamp: string
  errorMessage?: string
}

export class PersonaAgentRunner {
  private readonly client: OpenRouterClient

  constructor(options?: PersonaAgentRunnerOptions) {
    this.client = options?.client ?? new OpenRouterClient()
  }

  getLastUsage(): GenerationUsage | undefined {
    return this.client.getLastUsage()
  }

  async run(input: PersonaAgentRunnerInput): Promise<PersonaAgentRunnerResult> {
    const prompt = buildPersonaPrompt(input)
    const startedAt = Date.now()

    try {
      const response = (await this.client.generateStructured({
        model: input.model,
        schema: PersonaResponseSchema,
        prompt,
        temperature: input.temperature,
        maxTokens: input.maxOutputTokens
      })) as PersonaResponse

      if (!Array.isArray(response.personas)) {
        throw new Error('Persona payload malformed')
      }

      const personas = response.personas.map((persona, index) => normalizePersona(persona, index))
      if (personas.length === 0) {
        throw new Error('LLM returned an empty persona list')
      }

      const notes = (() => {
        const entries: string[] = []
        if (Array.isArray(response.notes)) {
          entries.push(...response.notes)
        }
        if (response.rationale) {
          entries.push(response.rationale)
        }
        return entries.length > 0 ? entries : undefined
      })()

      const telemetry: PersonaAgentTelemetry = {
        model: input.model,
        durationMs: Date.now() - startedAt,
        promptLength: prompt.length,
        promptPreview: createPreview(prompt),
        responsePreview: createPreview(JSON.stringify(response.personas)),
        strategy: 'llm',
        timestamp: new Date().toISOString()
      }

      return {
        personas,
        strategy: 'llm',
        notes,
        usage: this.getLastUsage(),
        telemetry
      }
    } catch (error) {
      console.warn('[persona-agent] LLM persona generation failed, falling back to heuristics', error)
      const fallbackSummary = input.solutionSummary ?? input.promptSummary
      const fallbackPersonas = buildPersonaProfiles(
        input.targetUsers,
        input.keyFeatures,
        input.constraints,
        input.successMetrics,
        fallbackSummary
      )
      const telemetry: PersonaAgentTelemetry = {
        model: input.model,
        durationMs: Date.now() - startedAt,
        promptLength: prompt.length,
        promptPreview: createPreview(prompt),
        responsePreview: createPreview(JSON.stringify(fallbackPersonas)),
        strategy: 'heuristic',
        timestamp: new Date().toISOString(),
        errorMessage: error instanceof Error ? error.message : 'Persona runner fallback triggered'
      }

      return {
        personas: fallbackPersonas,
        strategy: 'heuristic',
        notes: ['LLM persona synthesis failed. Falling back to deterministic heuristic builder.'],
        telemetry
      }
    }
  }
}
