import { extractExistingArtifactsFromContext } from './existing-artifacts';
export class IntentResolver {
    classifier;
    subagentRegistry;
    logger;
    constructor(options) {
        this.classifier = options.classifier;
        this.subagentRegistry = options.subagentRegistry;
        this.logger = options.logger;
    }
    async resolve(context) {
        const existing = this.extractIntent(context);
        if (existing) {
            return existing;
        }
        const existingArtifacts = extractExistingArtifactsFromContext(context);
        const availableArtifacts = this.collectAvailableArtifacts(context);
        const classifierInput = this.buildClassifierInput(context, availableArtifacts, existingArtifacts.kinds);
        try {
            const classification = await this.classifier.classify(classifierInput);
            const plan = this.buildIntentFromClassification(classification, existingArtifacts.kinds);
            if (plan) {
                this.cacheIntent(context, plan);
                return plan;
            }
            const fallback = this.buildDefaultIntent(context, 'empty-classification');
            this.cacheIntent(context, fallback);
            return fallback;
        }
        catch (error) {
            this.logger?.error?.('[intent-resolver] failed to classify intent, using fallback', error);
            const fallback = this.buildClarificationIntent(context, 'classification-error');
            this.cacheIntent(context, fallback);
            return fallback;
        }
    }
    extractIntent(context) {
        const artifactKind = context.request.artifactKind;
        const cached = context.intentPlan;
        if (cached && this.intentMatchesRequest(cached, artifactKind)) {
            return cached;
        }
        const metaIntent = context.metadata?.intent;
        if (metaIntent && this.intentMatchesRequest(metaIntent, artifactKind)) {
            return metaIntent;
        }
        const requestIntent = context.request.intentPlan;
        if (requestIntent && this.intentMatchesRequest(requestIntent, artifactKind)) {
            return requestIntent;
        }
        const attributesIntent = context.request.attributes?.intent;
        if (attributesIntent && typeof attributesIntent === 'object') {
            const plan = attributesIntent;
            if (this.intentMatchesRequest(plan, artifactKind)) {
                this.cacheIntent(context, plan);
                return plan;
            }
        }
        return undefined;
    }
    cacheIntent(context, plan) {
        context.intentPlan = plan;
        context.request.intentPlan = plan;
        context.metadata = {
            ...(context.metadata ?? {}),
            intent: plan
        };
    }
    intentMatchesRequest(intent, artifactKind) {
        if (!artifactKind) {
            return true;
        }
        return intent.targetArtifact === artifactKind || intent.requestedArtifacts.includes(artifactKind);
    }
    collectAvailableArtifacts(context) {
        const artifacts = new Set();
        if (context.request.artifactKind) {
            artifacts.add(context.request.artifactKind);
        }
        const existing = extractExistingArtifactsFromContext(context);
        existing.kinds.forEach(kind => artifacts.add(kind));
        this.subagentRegistry
            ?.list()
            .forEach(manifest => artifacts.add(manifest.creates));
        if (artifacts.size === 0) {
            artifacts.add('prompt');
        }
        return Array.from(artifacts);
    }
    buildClassifierInput(context, availableArtifacts, existingArtifacts) {
        const history = context.request.input?.context?.conversationHistory;
        const message = context.request.input?.message ??
            history?.map(entry => entry?.content ?? '').join('\n') ??
            '';
        return {
            message,
            requestedArtifacts: [],
            availableArtifacts,
            runId: context.runId,
            metadata: {
                artifactKind: context.request.artifactKind,
                existingArtifacts
            }
        };
    }
    buildIntentFromClassification(classification, existingArtifacts) {
        const uniqueRequested = Array.from(new Set(classification.chain ?? [])).filter(Boolean);
        if (!classification.targetArtifact || uniqueRequested.length === 0) {
            return null;
        }
        // Remove upstream artifacts that already exist, but keep the target artifact
        const requested = uniqueRequested.filter(artifact => artifact === classification.targetArtifact || !existingArtifacts.includes(artifact));
        if (requested.length === 0) {
            requested.push(classification.targetArtifact);
        }
        return {
            source: 'resolver',
            requestedArtifacts: requested,
            targetArtifact: classification.targetArtifact,
            transitions: requested.map((artifact, index) => ({
                fromArtifact: index === 0 ? undefined : requested[index - 1],
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
        };
    }
    buildClarificationIntent(context, reason) {
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
        };
    }
    buildDefaultIntent(context, reason) {
        const target = context.request.artifactKind ?? 'prd';
        const chain = target === 'persona' || target === 'story-map' ? ['prd', target] : [target];
        const transitions = [];
        chain.forEach((artifact, index) => {
            transitions.push({
                fromArtifact: index === 0 ? undefined : chain[index - 1],
                toArtifact: artifact
            });
        });
        return {
            source: 'resolver',
            requestedArtifacts: chain,
            targetArtifact: target,
            transitions,
            confidence: 0.4,
            status: 'ready',
            metadata: {
                reason
            }
        };
    }
}
