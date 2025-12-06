import { randomUUID } from 'node:crypto';
import { generateText } from 'ai';
import { resolveRunSettings } from '../config/product-agent.config';
import { createOpenRouterProvider, resolveOpenRouterModel } from '../providers/openrouter-provider';
import { createSkillTool, createSubagentTool } from '../ai/tool-adapters';
import { extractExistingArtifactsFromContext } from '../planner/existing-artifacts';
const STATUS_RUNNING = 'running';
const STATUS_FAILED = 'failed';
const STATUS_COMPLETED = 'completed';
const STATUS_AWAITING_INPUT = 'awaiting-input';
const emitEvent = (options, event) => {
    if (typeof options?.emit === 'function') {
        options.emit(event);
    }
};
const toProgressEvent = (params) => ({
    type: params.type,
    timestamp: new Date().toISOString(),
    runId: params.runId,
    stepId: params.stepId,
    status: params.status,
    payload: params.payload,
    message: params.message
});
const topologicallySortPlan = (plan) => {
    const pending = new Set(Object.keys(plan.nodes));
    const resolved = [];
    while (pending.size > 0) {
        let progress = false;
        for (const stepId of pending) {
            const node = plan.nodes[stepId];
            const deps = node.dependsOn ?? [];
            const isReady = deps.every(dep => resolved.includes(dep));
            if (!isReady) {
                continue;
            }
            resolved.push(stepId);
            pending.delete(stepId);
            progress = true;
            break;
        }
        if (!progress) {
            throw new Error('Plan graph contains circular or unsatisfied dependencies');
        }
    }
    return resolved;
};
const mapVerificationStatusToRunStatus = (verification) => {
    if (!verification) {
        return STATUS_COMPLETED;
    }
    switch (verification.status) {
        case 'fail':
            return STATUS_FAILED;
        case 'needs-review':
            return STATUS_AWAITING_INPUT;
        default:
            return STATUS_COMPLETED;
    }
};
const toControllerStatus = (status) => {
    switch (status) {
        case STATUS_FAILED:
            return 'failed';
        case STATUS_AWAITING_INPUT:
            return 'awaiting-input';
        default:
            return 'completed';
    }
};
const extractOverrides = (request) => {
    const candidate = request.attributes?.apiOverrides ??
        request.attributes?.overrides ??
        request.attributes?.runOverrides;
    if (candidate && typeof candidate === 'object') {
        return candidate;
    }
    return undefined;
};
const createWorkspaceEvent = (runId, type, payload) => ({
    id: randomUUID(),
    runId,
    type,
    createdAt: new Date().toISOString(),
    payload
});
export class GraphController {
    planner;
    skillRunner;
    verifier;
    workspace;
    subagents;
    subagentRegistry;
    config;
    clock;
    idFactory;
    workspaceOverrides;
    verifierGroup;
    verifierRegistry;
    runSummaries = new Map();
    providerFactory;
    toolInvoker;
    constructor(composition, config, options) {
        this.planner = composition.planner;
        this.skillRunner = composition.skillRunner;
        this.verifier = composition.verifier.primary;
        this.workspace = composition.workspace;
        this.subagents = composition.subagents ?? [];
        this.subagentRegistry = options?.subagentRegistry;
        this.verifierGroup = composition.verifier;
        this.verifierRegistry = composition.verifier.registry;
        this.config = config;
        this.clock = options?.clock ?? (() => new Date());
        this.idFactory = options?.idFactory ?? (() => randomUUID());
        this.workspaceOverrides = options?.workspaceOverrides;
        this.providerFactory =
            options?.providerFactory ?? ((apiKey) => createOpenRouterProvider(config, { apiKey }));
        this.toolInvoker = options?.toolInvoker ?? generateText;
    }
    async start(input, options) {
        const startTime = this.clock();
        const runId = input.runId ?? this.idFactory();
        const overrides = extractOverrides(input.request);
        const settings = resolveRunSettings(this.config, overrides);
        const workspaceHandle = await this.workspace.ensureWorkspace(runId, input.request.artifactKind, {
            persistArtifacts: this.workspaceOverrides?.persistArtifacts ?? this.config.workspace.persistArtifacts,
            tempSubdir: this.workspaceOverrides?.tempSubdir ?? this.config.workspace.tempSubdir
        });
        const runContext = {
            runId,
            request: input.request,
            settings,
            workspace: workspaceHandle,
            startedAt: startTime,
            metadata: options?.metadata ? { ...options.metadata } : {},
            intentPlan: input.request.intentPlan
        };
        emitEvent(options, toProgressEvent({
            type: 'run.status',
            runId,
            status: STATUS_RUNNING,
            message: 'Run started'
        }));
        await this.workspace.appendEvent(runId, createWorkspaceEvent(runId, 'system', {
            message: 'Run started',
            status: STATUS_RUNNING,
            settings
        }));
        const existingArtifacts = extractExistingArtifactsFromContext(runContext);
        const planDraft = input.initialPlan
            ? { plan: input.initialPlan }
            : await this.planner.createPlan(runContext);
        const plan = planDraft.plan;
        if (runContext.metadata) {
            runContext.metadata.plan = plan;
        }
        emitEvent(options, toProgressEvent({
            type: 'plan.created',
            runId,
            payload: {
                plan: {
                    id: plan.id,
                    artifactKind: plan.artifactKind,
                    entryId: plan.entryId,
                    version: plan.version,
                    createdAt: plan.createdAt instanceof Date ? plan.createdAt.toISOString() : plan.createdAt,
                    nodes: plan.nodes,
                    metadata: plan.metadata
                }
            }
        }));
        await this.workspace.appendEvent(runId, createWorkspaceEvent(runId, 'plan', {
            action: 'created',
            plan
        }));
        const executionContext = {
            runContext,
            plan,
            skillResults: [],
            status: STATUS_RUNNING,
            subagentResults: [],
            artifactsByStep: new Map(),
            artifactsByKind: new Map(existingArtifacts.artifactsByKind)
        };
        try {
            await this.executePlanWithAiTools(executionContext, options);
            if (executionContext.status === STATUS_AWAITING_INPUT) {
                // Skip verification; run awaits user clarification input
            }
            else {
                if (!executionContext.artifact) {
                    const needsClarification = executionContext.runContext.intentPlan?.status === 'needs-clarification' ||
                        executionContext.runContext.request.intentPlan?.status === 'needs-clarification';
                    if (needsClarification) {
                        executionContext.status = STATUS_AWAITING_INPUT;
                    }
                    else {
                        throw new Error('Run completed without producing an artifact');
                    }
                }
                else {
                    const verifier = this.resolveVerifier(executionContext.artifact.kind);
                    if (verifier) {
                        const verification = await this.runVerification(executionContext, verifier, options);
                        executionContext.verification = verification;
                        executionContext.status = mapVerificationStatusToRunStatus(verification);
                        if (executionContext.status === STATUS_FAILED) {
                            throw new Error('Verification failed');
                        }
                    }
                    else {
                        executionContext.status = STATUS_COMPLETED;
                    }
                }
            }
            await this.runSubagents(executionContext, options);
        }
        catch (error) {
            executionContext.status = STATUS_FAILED;
            await this.workspace.appendEvent(runId, createWorkspaceEvent(runId, 'system', {
                message: 'Run failed',
                error: error instanceof Error ? error.message : String(error)
            }));
            emitEvent(options, toProgressEvent({
                type: 'run.status',
                runId,
                status: STATUS_FAILED,
                message: error instanceof Error ? error.message : 'Run failed'
            }));
            const summary = this.toSummary(executionContext, this.clock());
            this.runSummaries.set(runId, summary);
            throw error;
        }
        const completionTime = this.clock();
        const summary = this.toSummary(executionContext, completionTime);
        this.runSummaries.set(runId, summary);
        await this.workspace.appendEvent(runId, createWorkspaceEvent(runId, 'system', {
            message: executionContext.status === STATUS_COMPLETED ? 'Run completed' : 'Run awaiting input',
            status: executionContext.status
        }));
        emitEvent(options, toProgressEvent({
            type: 'run.status',
            runId,
            status: executionContext.status,
            message: executionContext.status === STATUS_COMPLETED ? 'Run completed' : 'Run awaiting input'
        }));
        return summary;
    }
    async resume(runId) {
        const summary = this.runSummaries.get(runId);
        if (!summary) {
            throw new Error(`Run ${runId} cannot be resumed because no prior state was recorded`);
        }
        return summary;
    }
    resolveApiKey(runContext) {
        const attributeKey = typeof runContext.request.attributes?.apiKey === 'string'
            ? runContext.request.attributes.apiKey
            : undefined;
        const input = runContext.request.input;
        const settingsKey = typeof input?.settings === 'object' && input?.settings
            ? input.settings.apiKey
            : undefined;
        const sanitizedSettingsKey = typeof settingsKey === 'string' && settingsKey.trim().length > 0
            ? settingsKey
            : undefined;
        const envKey = typeof process.env.OPENROUTER_API_KEY === 'string' &&
            process.env.OPENROUTER_API_KEY.trim().length > 0
            ? process.env.OPENROUTER_API_KEY
            : undefined;
        return attributeKey ?? sanitizedSettingsKey ?? envKey;
    }
    async executePlanWithAiTools(context, options) {
        const apiKey = this.resolveApiKey(context.runContext);
        const hasApiKey = typeof apiKey === 'string' && apiKey.trim().length > 0;
        const provider = this.providerFactory(apiKey);
        const model = hasApiKey
            ? resolveOpenRouterModel(provider, this.config, context.runContext.settings.model)
            : undefined;
        const orderedSteps = topologicallySortPlan(context.plan);
        for (const stepId of orderedSteps) {
            const node = context.plan.nodes[stepId];
            const nodeKind = this.getPlanNodeKind(node);
            const toolName = `node_${node.id}`;
            emitEvent(options, toProgressEvent({
                type: 'step.started',
                runId: context.runContext.runId,
                stepId,
                message: node.label
            }));
            if (nodeKind === 'skill') {
                await this.workspace.appendEvent(context.runContext.runId, createWorkspaceEvent(context.runContext.runId, 'skill', {
                    action: 'start',
                    stepId,
                    label: node.label
                }));
            }
            let lifecycle;
            if (nodeKind === 'subagent') {
                const task = node.task;
                const subagentId = task?.agentId ?? task?.subagentId ?? node.metadata?.subagentId;
                if (!subagentId) {
                    throw new Error(`Subagent node "${node.id}" is missing a subagentId`);
                }
                lifecycle = await this.getSubagentLifecycle(subagentId);
                emitEvent(options, toProgressEvent({
                    type: 'subagent.started',
                    runId: context.runContext.runId,
                    stepId: node.id,
                    payload: {
                        subagentId,
                        artifactKind: lifecycle.metadata.artifactKind,
                        label: lifecycle.metadata.label
                    },
                    message: `${lifecycle.metadata.label ?? subagentId} started`
                }));
                await this.workspace.appendEvent(context.runContext.runId, createWorkspaceEvent(context.runContext.runId, 'subagent', {
                    action: 'start',
                    stepId: node.id,
                    subagentId,
                    artifactKind: lifecycle.metadata.artifactKind
                }));
            }
            const tool = nodeKind === 'subagent' && lifecycle
                ? createSubagentTool({
                    node,
                    runContext: context.runContext,
                    resolveLifecycle: async () => lifecycle,
                    resolveSourceArtifact: lc => this.resolveSubagentSourceArtifact(lc, node, context),
                    emitProgress: event => emitEvent(options, toProgressEvent({
                        type: 'subagent.progress',
                        runId: context.runContext.runId,
                        payload: {
                            subagentId: lifecycle?.metadata.id,
                            event
                        }
                    }))
                })
                : createSkillTool({
                    node,
                    runContext: context.runContext,
                    skillRunner: this.skillRunner
                });
            try {
                const toolResult = await this.invokeToolWithModel({
                    toolName,
                    tool,
                    model,
                    node,
                    context,
                    options,
                    hasApiKey
                });
                if (nodeKind === 'subagent') {
                    await this.handleSubagentToolResult({
                        result: toolResult,
                        node,
                        lifecycle: lifecycle,
                        context,
                        options
                    });
                }
                else {
                    await this.handleSkillToolResult({
                        result: toolResult,
                        node,
                        stepId,
                        context,
                        options
                    });
                    if (context.status === STATUS_AWAITING_INPUT) {
                        break;
                    }
                }
            }
            catch (error) {
                emitEvent(options, toProgressEvent({
                    type: 'step.failed',
                    runId: context.runContext.runId,
                    stepId,
                    message: error instanceof Error ? error.message : 'Step failed'
                }));
                if (nodeKind === 'subagent' && lifecycle) {
                    const message = error instanceof Error ? error.message : String(error);
                    await this.workspace.appendEvent(context.runContext.runId, createWorkspaceEvent(context.runContext.runId, 'subagent', {
                        action: 'failed',
                        stepId,
                        subagentId: lifecycle.metadata.id,
                        error: message
                    }));
                    const subagentId = lifecycle.metadata.id;
                    this.recordSubagentFailureMetadata(context, subagentId, message, 'plan');
                    emitEvent(options, toProgressEvent({
                        type: 'subagent.failed',
                        runId: context.runContext.runId,
                        stepId,
                        payload: {
                            subagentId,
                            error: message
                        },
                        message
                    }));
                }
                else {
                    await this.workspace.appendEvent(context.runContext.runId, createWorkspaceEvent(context.runContext.runId, 'skill', {
                        action: 'failed',
                        stepId,
                        error: error instanceof Error ? error.message : String(error)
                    }));
                }
                throw error;
            }
        }
    }
    async invokeToolWithModel(params) {
        if (!params.hasApiKey || !params.model) {
            return this.invokeToolDirectly(params.tool, params.node, params.context, params.options);
        }
        const response = await this.toolInvoker({
            model: params.model,
            system: this.buildToolSystemPrompt(params.context),
            prompt: this.buildToolPrompt(params.context, params.node),
            tools: {
                [params.toolName]: params.tool
            },
            toolChoice: { type: 'tool', toolName: params.toolName },
            maxTokens: Math.min(params.context.runContext.settings.maxOutputTokens ?? 8000, 512),
            temperature: params.context.runContext.settings.temperature,
            maxRetries: this.config.runtime.retry.attempts,
            abortSignal: params.options?.signal
        });
        const toolResult = response.toolResults?.[0]?.result ??
            response.toolResults?.[0]?.output ??
            response.toolResults?.[0];
        if (!toolResult) {
            throw new Error(`Tool "${params.toolName}" did not return a result`);
        }
        return toolResult;
    }
    async invokeToolDirectly(tool, node, context, options) {
        const executable = tool;
        if (typeof executable.execute !== 'function') {
            throw new Error(`Tool for node "${node.id}" is missing an execute handler`);
        }
        const result = await executable.execute({}, {
            abortSignal: options?.signal
        });
        return result;
    }
    async handleSkillToolResult(params) {
        const { result, node, context, options, stepId } = params;
        const skillId = node.metadata?.skillId ?? node.id;
        if (result.skillResult) {
            context.skillResults.push(result.skillResult);
        }
        const artifact = result.artifact;
        if (artifact) {
            context.artifact = artifact;
            this.trackArtifactForContext(stepId, artifact, context);
            await this.workspace.writeArtifact(context.runContext.runId, artifact);
            await this.workspace.appendEvent(context.runContext.runId, createWorkspaceEvent(context.runContext.runId, 'artifact', {
                artifactId: artifact.id,
                kind: artifact.kind,
                version: artifact.version
            }));
            emitEvent(options, toProgressEvent({
                type: 'artifact.delivered',
                runId: context.runContext.runId,
                stepId,
                payload: {
                    artifactId: artifact.id,
                    artifactKind: artifact.kind,
                    artifact
                }
            }));
        }
        emitEvent(options, toProgressEvent({
            type: 'step.completed',
            runId: context.runContext.runId,
            stepId,
            payload: {
                skillId,
                metadata: result.metadata
            }
        }));
        await this.workspace.appendEvent(context.runContext.runId, createWorkspaceEvent(context.runContext.runId, 'skill', {
            action: 'complete',
            stepId,
            result: {
                metadata: result.metadata,
                confidence: result.confidence
            }
        }));
        const runStatusOverride = result.status === STATUS_AWAITING_INPUT
            ? STATUS_AWAITING_INPUT
            : typeof result.metadata?.runStatus === 'string'
                ? result.metadata.runStatus
                : undefined;
        if (runStatusOverride === STATUS_AWAITING_INPUT) {
            context.status = STATUS_AWAITING_INPUT;
            const clarification = result.metadata?.clarification;
            if (clarification) {
                context.clarification = clarification;
                if (!context.runContext.metadata) {
                    context.runContext.metadata = {};
                }
                context.runContext.metadata.clarification = clarification;
            }
        }
    }
    async handleSubagentToolResult(params) {
        const { result, node, lifecycle, context, options } = params;
        const artifact = result.artifact;
        if (!artifact) {
            throw new Error(`Subagent "${lifecycle.metadata.id}" did not return an artifact`);
        }
        const transitionPayload = this.buildTransitionPayload(node, artifact, context);
        await this.workspace.writeArtifact(context.runContext.runId, artifact);
        this.trackArtifactForContext(node.id, artifact, context);
        const shouldPromote = node.metadata?.promoteResult === true ||
            artifact.kind === context.plan.artifactKind;
        if (shouldPromote || !context.artifact) {
            context.artifact = artifact;
        }
        context.subagentResults.push({
            subagentId: lifecycle.metadata.id,
            artifact,
            metadata: result.metadata
        });
        this.recordSubagentArtifactMetadata(context, lifecycle.metadata.id, artifact, result.metadata);
        await this.workspace.appendEvent(context.runContext.runId, createWorkspaceEvent(context.runContext.runId, 'subagent', {
            action: 'complete',
            stepId: node.id,
            subagentId: lifecycle.metadata.id,
            artifactId: artifact.id,
            artifactKind: artifact.kind
        }));
        emitEvent(options, toProgressEvent({
            type: 'artifact.delivered',
            runId: context.runContext.runId,
            stepId: node.id,
            payload: {
                artifactId: artifact.id,
                artifactKind: artifact.kind,
                artifact,
                transition: transitionPayload
            }
        }));
        emitEvent(options, toProgressEvent({
            type: 'subagent.completed',
            runId: context.runContext.runId,
            stepId: node.id,
            payload: {
                subagentId: lifecycle.metadata.id,
                artifactId: artifact.id,
                artifactKind: artifact.kind,
                transition: transitionPayload
            },
            message: `${lifecycle.metadata.label ?? lifecycle.metadata.id} completed`
        }));
        emitEvent(options, toProgressEvent({
            type: 'step.completed',
            runId: context.runContext.runId,
            stepId: node.id,
            payload: {
                subagentId: lifecycle.metadata.id
            }
        }));
    }
    resolveVerifier(kind) {
        if (this.verifierRegistry) {
            return this.verifierRegistry[kind];
        }
        return this.verifier;
    }
    async runVerification(context, primaryVerifier, options) {
        if (!context.artifact) {
            return undefined;
        }
        emitEvent(options, toProgressEvent({
            type: 'verification.started',
            runId: context.runContext.runId
        }));
        const verifiers = this.verifierGroup;
        const primaryResult = await primaryVerifier.verify({
            artifact: context.artifact,
            context: context.runContext
        });
        const secondaryResults = [];
        if (verifiers.secondary?.length) {
            for (const verifier of verifiers.secondary) {
                const result = await verifier.verify({
                    artifact: primaryResult.artifact,
                    context: context.runContext
                });
                secondaryResults.push(result);
            }
        }
        const allResults = [primaryResult, ...secondaryResults];
        const finalArtifact = allResults.reduce((latest, result) => result.artifact ?? latest, primaryResult.artifact);
        const combinedIssues = allResults.flatMap(result => result.issues ?? []);
        const statusOrder = {
            fail: 3,
            'needs-review': 2,
            pass: 1
        };
        const finalStatus = allResults.reduce((current, result) => statusOrder[result.status] > statusOrder[current] ? result.status : current, primaryResult.status);
        const metadata = {
            primary: primaryResult.metadata,
            secondary: secondaryResults.map(result => ({
                status: result.status,
                metadata: result.metadata,
                issues: result.issues
            }))
        };
        const aggregatedResult = {
            status: finalStatus,
            artifact: finalArtifact ?? context.artifact,
            issues: combinedIssues,
            usage: primaryResult.usage,
            metadata
        };
        emitEvent(options, toProgressEvent({
            type: 'verification.completed',
            runId: context.runContext.runId,
            payload: {
                status: aggregatedResult.status,
                issues: aggregatedResult.issues
            }
        }));
        await this.workspace.appendEvent(context.runContext.runId, createWorkspaceEvent(context.runContext.runId, 'verification', {
            status: aggregatedResult.status,
            issues: aggregatedResult.issues
        }));
        return aggregatedResult;
    }
    trackArtifactForContext(stepId, artifact, context) {
        context.artifactsByStep.set(stepId, artifact);
        const existing = context.artifactsByKind.get(artifact.kind) ?? [];
        existing.push(artifact);
        context.artifactsByKind.set(artifact.kind, existing);
    }
    buildTransitionPayload(node, artifact, context) {
        if (node.metadata?.kind !== 'subagent') {
            return undefined;
        }
        const inputsFromArtifact = node.inputs?.fromArtifact;
        const metadataSource = node.metadata?.source;
        const sourceArtifactKind = inputsFromArtifact ?? metadataSource?.artifactKind;
        const targetKind = node.metadata?.artifactKind ?? artifact?.kind ?? undefined;
        const planMetadata = context.plan.metadata;
        const transitionPath = Array.isArray(planMetadata?.transitionPath)
            ? planMetadata?.transitionPath
            : undefined;
        return {
            fromArtifactKind: sourceArtifactKind,
            toArtifactKind: targetKind,
            promotesRunArtifact: node.metadata?.promoteResult === true,
            intentTargetArtifact: planMetadata?.requestedArtifactKind ??
                context.plan.artifactKind,
            transitionPath
        };
    }
    buildToolSystemPrompt(context) {
        const target = context.plan.artifactKind;
        return [
            'You are the Product Agent orchestrator.',
            'Use the provided tools to execute each plan step and return concise results.',
            `Target artifact: ${target}.`,
            'Always call the required tool and rely on the tool output instead of inventing content.'
        ].join(' ');
    }
    buildToolPrompt(context, node) {
        const planMetadata = context.plan.metadata;
        const requested = planMetadata?.intent?.requestedArtifacts ?? planMetadata?.transitionPath ?? [];
        const requestedSummary = requested.length > 0 ? `Requested artifacts: ${requested.join(', ')}.` : '';
        const dependencies = node.dependsOn && node.dependsOn.length > 0
            ? `Depends on: ${node.dependsOn.join(', ')}.`
            : 'No dependencies.';
        const userSummary = this.extractRunInputSummary(context.runContext.request.input);
        return [
            `Execute plan step "${node.label}" (id: ${node.id}).`,
            dependencies,
            requestedSummary,
            userSummary ? `User input: ${userSummary}` : ''
        ]
            .filter(Boolean)
            .join(' ');
    }
    extractRunInputSummary(input) {
        if (!input) {
            return '';
        }
        const candidate = input;
        if (typeof candidate?.message === 'string') {
            return candidate.message;
        }
        try {
            return JSON.stringify(input);
        }
        catch {
            return '';
        }
    }
    getPlanNodeKind(node) {
        return node.metadata?.kind === 'subagent' ? 'subagent' : 'skill';
    }
    resolveSubagentSourceArtifact(lifecycle, node, context) {
        const source = node.metadata?.source;
        if (source?.fromNode) {
            const byNode = context.artifactsByStep.get(source.fromNode);
            if (byNode) {
                return byNode;
            }
        }
        if (source?.artifactKind) {
            const byKind = context.artifactsByKind.get(source.artifactKind);
            if (byKind && byKind.length > 0) {
                return byKind[byKind.length - 1];
            }
        }
        if (context.artifact) {
            return context.artifact;
        }
        if (lifecycle.metadata.sourceKinds.includes('prompt')) {
            return this.buildPromptArtifact(context);
        }
        return undefined;
    }
    buildPromptArtifact(context) {
        const requestInput = context.runContext.request.input;
        const message = requestInput?.message ?? '';
        const contextPayload = requestInput?.context ?? undefined;
        if (!message && !contextPayload) {
            return undefined;
        }
        return {
            id: `artifact-prompt-${context.runContext.runId}`,
            kind: 'prompt',
            version: '1.0.0',
            label: 'Prompt Context',
            data: {
                message,
                context: contextPayload
            },
            metadata: {
                createdAt: this.clock().toISOString(),
                createdBy: context.runContext.request.createdBy,
                tags: ['prompt', 'synthetic']
            }
        };
    }
    async getSubagentLifecycle(subagentId) {
        const local = this.subagents.find(subagent => subagent.metadata.id === subagentId);
        if (local) {
            return local;
        }
        if (!this.subagentRegistry) {
            throw new Error(`Subagent "${subagentId}" is not registered with the controller`);
        }
        return this.subagentRegistry.createLifecycle(subagentId);
    }
    recordSubagentArtifactMetadata(context, subagentId, artifact, metadata) {
        if (!context.runContext.metadata) {
            context.runContext.metadata = {};
        }
        const existing = context.runContext.metadata.subagents ?? {};
        existing[subagentId] = {
            artifactId: artifact.id,
            artifactKind: artifact.kind,
            metadata: metadata ?? {},
            label: artifact.label,
            version: artifact.version
        };
        context.runContext.metadata.subagents = existing;
    }
    recordSubagentFailureMetadata(context, subagentId, error, stage) {
        if (!context.runContext.metadata) {
            context.runContext.metadata = {};
        }
        const failures = context.runContext.metadata.subagentFailures ?? {};
        failures[subagentId] = {
            error,
            stage,
            timestamp: this.clock().toISOString()
        };
        context.runContext.metadata.subagentFailures = failures;
    }
    async runSubagents(context, options) {
        if (!context.artifact) {
            return;
        }
        if (context.status !== STATUS_COMPLETED) {
            return;
        }
        const resolvedSubagents = await this.resolveSubagents(context, options);
        if (resolvedSubagents.length === 0) {
            return;
        }
        const runId = context.runContext.runId;
        const sourceKind = context.artifact.kind;
        const executedSubagents = new Set(context.subagentResults.map(result => result.subagentId));
        const shouldRunSubagent = (subagent) => {
            if (subagent.metadata.sourceKinds.length > 0 &&
                !subagent.metadata.sourceKinds.includes(sourceKind)) {
                return false;
            }
            return true;
        };
        for (const subagent of resolvedSubagents) {
            if (executedSubagents.has(subagent.metadata.id)) {
                continue;
            }
            if (!shouldRunSubagent(subagent)) {
                continue;
            }
            emitEvent(options, toProgressEvent({
                type: 'subagent.started',
                runId,
                payload: {
                    subagentId: subagent.metadata.id,
                    artifactKind: subagent.metadata.artifactKind,
                    label: subagent.metadata.label
                },
                message: `${subagent.metadata.label ?? subagent.metadata.id} started`
            }));
            await this.workspace.appendEvent(runId, createWorkspaceEvent(runId, 'subagent', {
                action: 'start',
                subagentId: subagent.metadata.id,
                artifactKind: subagent.metadata.artifactKind
            }));
            try {
                const result = await subagent.execute({
                    params: {},
                    run: context.runContext,
                    sourceArtifact: context.artifact,
                    emit: event => emitEvent(options, toProgressEvent({
                        type: 'subagent.progress',
                        runId,
                        payload: {
                            subagentId: subagent.metadata.id,
                            event
                        }
                    }))
                });
                await this.workspace.writeArtifact(runId, result.artifact);
                const syntheticStepId = (`subagent-auto-${subagent.metadata.id}-${context.subagentResults.length + 1}`);
                this.trackArtifactForContext(syntheticStepId, result.artifact, context);
                context.subagentResults.push({
                    subagentId: subagent.metadata.id,
                    artifact: result.artifact,
                    metadata: result.metadata
                });
                this.recordSubagentArtifactMetadata(context, subagent.metadata.id, result.artifact, result.metadata);
                executedSubagents.add(subagent.metadata.id);
                await this.workspace.appendEvent(runId, createWorkspaceEvent(runId, 'subagent', {
                    action: 'complete',
                    subagentId: subagent.metadata.id,
                    artifactId: result.artifact.id,
                    artifactKind: result.artifact.kind
                }));
                emitEvent(options, toProgressEvent({
                    type: 'subagent.completed',
                    runId,
                    payload: {
                        subagentId: subagent.metadata.id,
                        artifactId: result.artifact.id,
                        artifactKind: result.artifact.kind
                    },
                    message: `${subagent.metadata.label ?? subagent.metadata.id} completed`
                }));
            }
            catch (error) {
                await this.workspace.appendEvent(runId, createWorkspaceEvent(runId, 'subagent', {
                    action: 'failed',
                    subagentId: subagent.metadata.id,
                    error: error instanceof Error ? error.message : String(error)
                }));
                emitEvent(options, toProgressEvent({
                    type: 'subagent.failed',
                    runId,
                    payload: {
                        subagentId: subagent.metadata.id,
                        error: error instanceof Error ? error.message : String(error)
                    },
                    message: error instanceof Error ? error.message : 'Subagent failed'
                }));
                this.recordSubagentFailureMetadata(context, subagent.metadata.id, error instanceof Error ? error.message : String(error));
            }
        }
    }
    async resolveSubagents(context, options) {
        if (!context.artifact) {
            return [];
        }
        if (!this.subagentRegistry) {
            return [...this.subagents];
        }
        const runId = context.runContext.runId;
        const resolved = [...this.subagents];
        const seen = new Set(resolved.map(subagent => subagent.metadata.id));
        const manifests = this.subagentRegistry.filterByArtifact(context.artifact.kind);
        for (const manifest of manifests) {
            if (seen.has(manifest.id)) {
                continue;
            }
            try {
                const lifecycle = await this.subagentRegistry.createLifecycle(manifest.id);
                resolved.push(lifecycle);
                seen.add(manifest.id);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                await this.workspace.appendEvent(runId, createWorkspaceEvent(runId, 'subagent', {
                    action: 'failed',
                    subagentId: manifest.id,
                    stage: 'load',
                    error: message
                }));
                emitEvent(options, toProgressEvent({
                    type: 'subagent.failed',
                    runId,
                    payload: {
                        subagentId: manifest.id,
                        error: message,
                        stage: 'load'
                    },
                    message
                }));
                this.recordSubagentFailureMetadata(context, manifest.id, message, 'load');
            }
        }
        return resolved;
    }
    toSummary(context, completedAt) {
        return {
            runId: context.runContext.runId,
            artifact: context.artifact,
            skillResults: context.skillResults,
            verification: context.verification,
            completedAt,
            status: toControllerStatus(context.status),
            workspace: context.runContext.workspace,
            metadata: context.runContext.metadata,
            subagents: context.subagentResults.length > 0 ? context.subagentResults : undefined
        };
    }
}
