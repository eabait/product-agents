import type { ArtifactIntent, ArtifactKind, RunContext } from '../contracts/core'
import type { SectionRoutingRequest } from '@product-agents/prd-shared'
import type { SubagentRegistry } from '../subagents/subagent-registry'
import {
  IntentClassifierSkill,
  type IntentClassifierInput,
  type IntentClassifierOutput
} from '@product-agents/skills-intent'

export interface IntentResolverOptions {
  classifier: Pick<IntentClassifierSkill, 'classify'>
  subagentRegistry?: SubagentRegistry
  defaultArtifactKind?: ArtifactKind
  logger?: {
    debug?: (...args: unknown[]) => void
    warn?: (...args: unknown[]) => void
    error?: (...args: unknown[]) => void
  }
}

export class IntentResolver {
  private readonly classifier: Pick<IntentClassifierSkill, 'classify'>
  private readonly subagentRegistry?: SubagentRegistry
  private readonly defaultArtifactKind: ArtifactKind
  private readonly logger?: IntentResolverOptions['logger']

  constructor(options: IntentResolverOptions) {
    this.classifier = options.classifier
    this.subagentRegistry = options.subagentRegistry
    this.defaultArtifactKind = options.defaultArtifactKind ?? 'prd'
    this.logger = options.logger
  }

  async resolve(
    context: RunContext<SectionRoutingRequest>
  ): Promise<ArtifactIntent> {
    const existing = this.extractIntent(context)
    if (existing) {
      return existing
    }

    const availableArtifacts = this.collectAvailableArtifacts()
    const classifierInput = this.buildClassifierInput(
      context,
      availableArtifacts
    )

    try {
      const classification = await this.classifier.classify(classifierInput)
      const plan = this.buildIntentFromClassification(classification)
      this.cacheIntent(context, plan)
      return plan
    } catch (error) {
      this.logger?.error?.(
        '[intent-resolver] failed to classify intent, using fallback',
        error
      )
      const fallback = this.buildFallbackIntent()
      this.cacheIntent(context, fallback)
      return fallback
    }
  }

  private extractIntent(
    context: RunContext<SectionRoutingRequest>
  ): ArtifactIntent | undefined {
    if (context.intentPlan) {
      return context.intentPlan
    }
    if (context.metadata?.intent) {
      return context.metadata.intent as ArtifactIntent
    }
    if (context.request.intentPlan) {
      return context.request.intentPlan
    }
    const attributesIntent = context.request.attributes?.intent
    if (attributesIntent && typeof attributesIntent === 'object') {
      const plan = attributesIntent as ArtifactIntent
      this.cacheIntent(context, plan)
      return plan
    }
    return undefined
  }

  private cacheIntent(
    context: RunContext<SectionRoutingRequest>,
    plan: ArtifactIntent
  ): void {
    context.intentPlan = plan
    context.request.intentPlan = plan
    context.metadata = {
      ...(context.metadata ?? {}),
      intent: plan
    }
  }

  private collectAvailableArtifacts(): ArtifactKind[] {
    const artifacts = new Set<ArtifactKind>([this.defaultArtifactKind])
    this.subagentRegistry
      ?.list()
      .forEach(manifest => artifacts.add(manifest.creates))
    return Array.from(artifacts)
  }

  private buildClassifierInput(
    context: RunContext<SectionRoutingRequest>,
    availableArtifacts: ArtifactKind[]
  ): IntentClassifierInput {
    const requested =
      context.request.intentPlan?.requestedArtifacts ??
      context.intentPlan?.requestedArtifacts ??
      []
    const message =
      context.request.input?.message ??
      context.request.input?.context?.conversationHistory
        ?.map(entry => entry.content)
        .join('\n') ??
      ''

    return {
      message,
      requestedArtifacts: requested,
      availableArtifacts,
      runId: context.runId,
      metadata: {
        artifactKind: context.request.artifactKind
      }
    }
  }

  private buildIntentFromClassification(
    classification: IntentClassifierOutput
  ): ArtifactIntent {
    const uniqueRequested = Array.from(
      new Set(classification.chain ?? [])
    )

    return {
      source: 'resolver',
      requestedArtifacts: uniqueRequested,
      targetArtifact:
        classification.targetArtifact ?? this.defaultArtifactKind,
      transitions: uniqueRequested.map((artifact, index) => ({
        fromArtifact: index === 0 ? undefined : uniqueRequested[index - 1],
        toArtifact: artifact,
        metadata: {
          probability: classification.probabilities?.[artifact]
        }
      })),
      confidence: classification.confidence,
      metadata: {
        probabilities: classification.probabilities,
        rationale: classification.rationale,
        ...(classification.metadata ?? {})
      }
    }
  }

  private buildFallbackIntent(): ArtifactIntent {
    const fallbackChain: ArtifactKind[] = [this.defaultArtifactKind]
    return {
      source: 'resolver',
      requestedArtifacts: fallbackChain,
      targetArtifact: this.defaultArtifactKind,
      transitions: [
        {
          toArtifact: this.defaultArtifactKind
        }
      ],
      confidence: 0.5
    }
  }
}
