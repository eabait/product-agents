import { z } from 'zod'
import type { AgentSettings } from '@product-agents/agent-core'
import { OpenRouterClient } from '@product-agents/openrouter-client'

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
  rationale?: string
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

const CLASSIFICATION_SCHEMA = z.object({
  targetArtifact: z.string().min(1),
  chain: z.array(z.string().min(1)).min(1),
  confidence: z.number().min(0).max(1),
  probabilities: z
    .record(z.number().min(0).max(1))
    .default({}),
  rationale: z.string().optional()
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
    this.promptTemplate = options?.promptTemplate ?? defaultPromptTemplate
    this.logger = options?.logger
  }

  async classify(input: IntentClassifierInput): Promise<IntentClassifierOutput> {
    const prompt = this.promptTemplate({
      ...input,
      timestamp: new Date().toISOString()
    })

    const raw = await this.client.generateStructured({
      model: this.settings.model,
      schema: CLASSIFICATION_SCHEMA,
      prompt,
      temperature: this.settings.temperature,
      maxTokens: this.settings.maxTokens
    })

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
    raw: z.infer<typeof CLASSIFICATION_SCHEMA>,
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
    raw.chain.forEach(artifact => {
      const normalized = normalizeKind(artifact)
      if (!chain.includes(normalized)) {
        chain.push(normalized)
      }
    })

    const normalizedTarget = normalizeKind(raw.targetArtifact)
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
      rationale: raw.rationale
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

const defaultPromptTemplate = (context: IntentClassifierPromptContext): string => {
  const requested = context.requestedArtifacts && context.requestedArtifacts.length > 0
    ? context.requestedArtifacts.join(', ')
    : 'none'

  return `
You are an intent classification expert that determines which product-development artifacts should be generated.

Available artifact types: ${context.availableArtifacts.join(', ')}.

User message:
"""
${context.message}
"""

Explicit artifact selections from the UI: ${requested}.

Return JSON with the following fields:
- targetArtifact: the final artifact the orchestrator should deliver
- chain: ordered list of artifacts to create (include intermediate steps like PRD before persona/story-map if necessary)
- confidence: value between 0 and 1
- probabilities: map of artifact -> probability score
- rationale: brief explanation

Focus on reasoning about whether personas or user story maps are requested explicitly or implicitly. Always include "prd" in the chain if downstream artifacts (persona/story-map) are needed.

Current timestamp: ${context.timestamp}
`
}
