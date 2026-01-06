import { z } from 'zod'
import type { AgentSettings } from '@product-agents/agent-core'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { buildIntentPrompt } from './prompt'

export type IntentClassifierClient = Pick<
  OpenRouterClient,
  'generateStructured' | 'getLastUsage'
>

export interface IntentClassifierInput {
  message: string
  requestedArtifacts?: string[]
  availableArtifacts: string[]
  runId?: string
  metadata?: Record<string, unknown>
}

export interface IntentClassifierOutput {
  targetArtifact: string
  chain: string[]
  confidence: number
  probabilities: Record<string, number>
  transitions?: Array<{
    fromArtifact?: string
    toArtifact: string
  }>
  requestedSections?: string[]
  rationale?: string
  guidance?: string
  metadata?: Record<string, unknown>
}

export interface IntentClassifierSkillOptions {
  settings?: Partial<AgentSettings>
  promptTemplate?: (input: IntentClassifierPromptContext) => string
  client?: IntentClassifierClient
  logger?: {
    debug?: (...args: unknown[]) => void
    warn?: (...args: unknown[]) => void
    error?: (...args: unknown[]) => void
  }
}

export interface IntentClassifierPromptContext extends IntentClassifierInput {
  timestamp: string
}

const TransitionSchema = z.object({
  fromArtifact: z.string().min(1).optional(),
  toArtifact: z.string().min(1)
})

const CLASSIFICATION_SCHEMA = z.object({
  targetArtifact: z.string().min(1),
  chain: z.array(z.string().min(1)).min(1).optional(),
  transitions: z.array(TransitionSchema).optional(),
  requestedSections: z.array(z.string().min(1)).optional(),
  confidence: z.number().min(0).max(1),
  probabilities: z
    .record(z.number().min(0).max(1))
    .default({}),
  rationale: z.string().optional(),
  guidance: z.string().optional()
})

const DEFAULT_SETTINGS: AgentSettings = {
  model: 'anthropic/claude-3-5-sonnet',
  temperature: 0.2,
  maxTokens: 1200
}

export class IntentClassifierSkill {
  private readonly client: IntentClassifierClient
  private readonly promptTemplate: (input: IntentClassifierPromptContext) => string
  private readonly settings: AgentSettings
  private readonly logger?: IntentClassifierSkillOptions['logger']

  constructor(options?: IntentClassifierSkillOptions) {
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(options?.settings ?? {})
    }
    this.client = options?.client ?? new OpenRouterClient(options?.settings?.apiKey)
    this.promptTemplate = options?.promptTemplate ?? buildIntentPrompt
    this.logger = options?.logger
  }

  async classify(input: IntentClassifierInput): Promise<IntentClassifierOutput> {
    const prompt = this.promptTemplate({
      ...input,
      timestamp: new Date().toISOString()
    })

    let raw: Partial<z.infer<typeof CLASSIFICATION_SCHEMA>>
    try {
      raw = await this.client.generateStructured({
        model: this.settings.model,
        schema: CLASSIFICATION_SCHEMA,
        prompt,
        temperature: this.settings.temperature,
        maxTokens: this.settings.maxTokens
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error('[intent-classifier] generateStructured failed:', {
        model: this.settings.model,
        runId: input.runId,
        error: errorMessage,
        promptLength: prompt.length
      })
      throw error
    }

    const normalized = this.normalizeResult(raw, input.availableArtifacts)

    this.logger?.debug?.('[intent-classifier] result', {
      runId: input.runId,
      targetArtifact: normalized.targetArtifact,
      chain: normalized.chain,
      confidence: normalized.confidence
    })

    return {
      ...normalized,
      metadata: this.composeMetadata(normalized)
    }
  }

  private normalizeResult(
    raw: Partial<z.infer<typeof CLASSIFICATION_SCHEMA>>,
    availableArtifacts: string[]
  ): IntentClassifierOutput {
    const canonicalArtifacts = new Set(
      availableArtifacts.map(artifact => artifact.toLowerCase())
    )

    const normalizeKind = (value: string): string => {
      const lower = value.trim().toLowerCase()
      if (!lower) {
        return 'prd'
      }
      const match = availableArtifacts.find(
        artifact => artifact.toLowerCase() === lower
      )
      return match ?? value
    }

    const chain: string[] = []

    const normalizedTransitions: IntentClassifierOutput['transitions'] = []
    if (Array.isArray(raw.transitions)) {
      raw.transitions.forEach(transition => {
        const toArtifact = transition.toArtifact ? normalizeKind(transition.toArtifact) : undefined
        if (!toArtifact) {
          return
        }
        const fromArtifact = transition.fromArtifact
          ? normalizeKind(transition.fromArtifact)
          : undefined
        normalizedTransitions.push({ fromArtifact, toArtifact })
      })
    }

    if (normalizedTransitions.length > 0) {
      normalizedTransitions.forEach(transition => {
        if (transition.fromArtifact && !chain.includes(transition.fromArtifact)) {
          chain.push(transition.fromArtifact)
        }
        if (transition.toArtifact && !chain.includes(transition.toArtifact)) {
          chain.push(transition.toArtifact)
        }
      })
    }

    const rawChain = raw.chain ?? []
    rawChain.forEach(artifact => {
      const normalized = normalizeKind(artifact)
      if (!chain.includes(normalized)) {
        chain.push(normalized)
      }
    })

    const normalizedTarget = normalizeKind(raw.targetArtifact ?? availableArtifacts[0] ?? 'prd')
    if (!chain.includes(normalizedTarget)) {
      chain.push(normalizedTarget)
    }

    if (chain.length === 0) {
      chain.push(availableArtifacts[0] ?? 'prd')
    }

    const boundedConfidence = Math.max(0, Math.min(1, raw.confidence ?? 0.5))
    const probabilities: Record<string, number> = {}
    Object.entries(raw.probabilities ?? {}).forEach(([key, value]) => {
      const normalizedKey = normalizeKind(key)
      const bounded = Math.max(0, Math.min(1, value ?? 0))
      probabilities[normalizedKey] = bounded
    })

    if (!probabilities[normalizedTarget]) {
      probabilities[normalizedTarget] = boundedConfidence
    }

    // Ensure PRD exists even if not suggested (baseline artifact)
    if (!probabilities.prd && canonicalArtifacts.has('prd')) {
      probabilities.prd = probabilities.prd ?? 0.1
    }

    return {
      targetArtifact: normalizedTarget,
      chain,
      confidence: boundedConfidence,
      probabilities,
      transitions: normalizedTransitions.length > 0 ? normalizedTransitions : undefined,
      requestedSections: Array.isArray(raw.requestedSections)
        ? Array.from(new Set(raw.requestedSections.map(value => value.trim()).filter(Boolean)))
        : undefined,
      rationale: raw.rationale,
      guidance: raw.guidance
    }
  }

  private composeMetadata(output: IntentClassifierOutput): Record<string, unknown> | undefined {
    const usage = this.client.getLastUsage?.()
    if (!usage) {
      return output.metadata
    }

    return {
      ...(output.metadata ?? {}),
      usage
    }
  }
}

// defaultPromptTemplate moved to prompt.ts
