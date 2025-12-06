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

const CLASSIFICATION_SCHEMA = z.object({
  targetArtifact: z.string().min(1),
  chain: z.array(z.string().min(1)).min(1),
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

const defaultPromptTemplate = (context: IntentClassifierPromptContext): string => {
  const requested = context.requestedArtifacts && context.requestedArtifacts.length > 0
    ? context.requestedArtifacts.join(', ')
    : 'none'

  return `
You are a friendly, concise intent classification expert that guides users to the right artifact plan.

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
- guidance: one short, friendly sentence suggesting the next step or asking for the single most important missing input

Rules:
- Be encouraging and goal-directed. Reuse any referenced artifacts (e.g., "use the PRD we just made") instead of recreating them.
- When personas or story maps are requested, include "prd" before them unless the user clearly provided a PRD already or insists on skipping it.
- Start from the prompt when it is the only source. If context is thin or confidence <0.6, keep the chain conservative and use guidance to ask for 1–2 specifics (e.g., target users, success metrics, constraints, region).
- Handle: fresh starts, starts with brief/research context, persona from prompt or PRD, story map from persona or PRD, multi-artifact requests (PRD + personas + story map), partial artifacts present (only personas or only PRD), updates/refinements to existing artifacts.
- Keep guidance short and helpful, e.g., "I'll draft a PRD, then personas. Share target users if you have them."

Current timestamp: ${context.timestamp}
`
}
