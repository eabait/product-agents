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
  logger?: {
    debug?: (...args: unknown[]) => void
    warn?: (...args: unknown[]) => void
    error?: (...args: unknown[]) => void
  }
}

export class IntentResolver {
  private readonly classifier: Pick<IntentClassifierSkill, 'classify'>
  private readonly subagentRegistry?: SubagentRegistry
  private readonly logger?: IntentResolverOptions['logger']

  constructor(options: IntentResolverOptions) {
    this.classifier = options.classifier
    this.subagentRegistry = options.subagentRegistry
    this.logger = options.logger
  }

  async resolve(
    context: RunContext<SectionRoutingRequest>
  ): Promise<ArtifactIntent> {
    const existing = this.extractIntent(context)
    if (existing) {
      return existing
    }

    const availableArtifacts = this.collectAvailableArtifacts(context)
    const classifierInput = this.buildClassifierInput(
      context,
      availableArtifacts
    )

    try {
      const classification = await this.classifier.classify(classifierInput)
      const plan = this.buildIntentFromClassification(classification)
      if (plan) {
        this.cacheIntent(context, plan)
        return plan
      }

      const fallback = this.buildClarificationIntent(context, 'empty-classification')
      this.cacheIntent(context, fallback)
      return fallback
    } catch (error) {
      this.logger?.error?.(
        '[intent-resolver] failed to classify intent, using fallback',
        error
      )
      const fallback = this.buildClarificationIntent(context, 'classification-error')
      this.cacheIntent(context, fallback)
      return fallback
    }
  }

  private extractIntent(
    context: RunContext<SectionRoutingRequest>
  ): ArtifactIntent | undefined {
    const artifactKind = context.request.artifactKind

    const cached = context.intentPlan
    if (cached && this.intentMatchesRequest(cached, artifactKind)) {
      return cached
    }

    const metaIntent = context.metadata?.intent as ArtifactIntent | undefined
    if (metaIntent && this.intentMatchesRequest(metaIntent, artifactKind)) {
      return metaIntent
    }

    const requestIntent = context.request.intentPlan
    if (requestIntent && this.intentMatchesRequest(requestIntent, artifactKind)) {
      return requestIntent
    }

    const attributesIntent = context.request.attributes?.intent
    if (attributesIntent && typeof attributesIntent === 'object') {
      const plan = attributesIntent as ArtifactIntent
      if (this.intentMatchesRequest(plan, artifactKind)) {
        this.cacheIntent(context, plan)
        return plan
      }
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

  private intentMatchesRequest(intent: ArtifactIntent, artifactKind?: ArtifactKind): boolean {
    if (!artifactKind) {
      return true
    }
    return intent.targetArtifact === artifactKind || intent.requestedArtifacts.includes(artifactKind)
  }

  private collectAvailableArtifacts(
    context: RunContext<SectionRoutingRequest>
  ): ArtifactKind[] {
    const artifacts = new Set<ArtifactKind>()
    const requestedArtifacts =
      context.request.intentPlan?.requestedArtifacts ?? context.intentPlan?.requestedArtifacts ?? []

    requestedArtifacts.forEach(artifact => artifacts.add(artifact))

    if (context.request.artifactKind) {
      artifacts.add(context.request.artifactKind)
    }

    this.subagentRegistry
      ?.list()
      .forEach(manifest => artifacts.add(manifest.creates))

    if (artifacts.size === 0) {
      artifacts.add('prompt')
    }

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
  ): ArtifactIntent | null {
    const uniqueRequested = Array.from(
      new Set(classification.chain ?? [])
    ).filter(Boolean)

    if (!classification.targetArtifact || uniqueRequested.length === 0) {
      return null
    }

    return {
      source: 'resolver',
      requestedArtifacts: uniqueRequested,
      targetArtifact: classification.targetArtifact,
      transitions: uniqueRequested.map((artifact, index) => ({
        fromArtifact: index === 0 ? undefined : uniqueRequested[index - 1],
        toArtifact: artifact,
        metadata: {
          probability: classification.probabilities?.[artifact]
        }
      })),
      confidence: classification.confidence,
      status: 'ready',
      metadata: {
        probabilities: classification.probabilities,
        rationale: classification.rationale,
        ...(classification.metadata ?? {})
      }
    }
  }

  private buildClarificationIntent(
    context: RunContext<SectionRoutingRequest>,
    reason: string
  ): ArtifactIntent {
    return {
      source: 'resolver',
      requestedArtifacts: [],
      targetArtifact: context.request.artifactKind ?? 'clarification',
      transitions: [],
      confidence: 0,
      status: 'needs-clarification',
      metadata: {
        reason
      }
    }
  }
}
