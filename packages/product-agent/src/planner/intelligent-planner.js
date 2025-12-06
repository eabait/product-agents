import { ALL_SECTION_NAMES } from '@product-agents/prd-shared';
import { SkillCatalog } from './skill-catalog';
import { extractExistingArtifactsFromContext } from './existing-artifacts';
const PLAN_VERSION = '3.0.0';
const normalizeSection = (value) => value.toLowerCase().replace(/[\s_-]/g, '');
export class IntelligentPlanner {
    config;
    clock;
    catalog;
    subagentRegistry;
    registeredSubagents;
    skillPackIds;
    intentResolver;
    coreBuilders;
    constructor(options) {
        this.config = options.config;
        this.clock = options.clock ?? (() => new Date());
        this.catalog = options.skillCatalog ?? new SkillCatalog(options.config.skills.enabledPacks);
        this.subagentRegistry = options.subagentRegistry;
        this.registeredSubagents = options.registeredSubagents ?? [];
        this.skillPackIds = options.config.skills.enabledPacks.map(pack => pack.id);
        this.intentResolver = options.intentResolver;
        this.coreBuilders = new Map();
        this.registerCoreBuilders(options.coreBuilders ?? this.createDefaultCoreBuilders());
    }
    registerCoreBuilders(builders) {
        builders.forEach(builder => {
            this.coreBuilders.set(builder.artifactKind, builder);
        });
    }
    createDefaultCoreBuilders() {
        return [this.createPrdCoreBuilder()];
    }
    createPrdCoreBuilder() {
        return {
            artifactKind: 'prd',
            build: async ({ context }) => this.buildPrdCoreSegment(context)
        };
    }
    selectCoreBuilder(intent, existingArtifacts) {
        if (intent.status === 'needs-clarification') {
            return undefined;
        }
        const existingKinds = new Set(existingArtifacts);
        const transitions = this.normalizeTransitions(intent);
        const orderedArtifacts = [];
        transitions.forEach(transition => {
            if (transition.fromArtifact && !orderedArtifacts.includes(transition.fromArtifact)) {
                orderedArtifacts.push(transition.fromArtifact);
            }
            if (transition.toArtifact && !orderedArtifacts.includes(transition.toArtifact)) {
                orderedArtifacts.push(transition.toArtifact);
            }
        });
        if (orderedArtifacts.length === 0 && intent.targetArtifact) {
            orderedArtifacts.push(intent.targetArtifact);
        }
        for (const artifact of orderedArtifacts) {
            if (!existingKinds.has(artifact)) {
                const builder = this.coreBuilders.get(artifact);
                if (builder) {
                    return builder;
                }
            }
        }
        return undefined;
    }
    async createPlan(context) {
        const intent = await this.intentResolver.resolve(context);
        const existingArtifacts = extractExistingArtifactsFromContext(context);
        const createdAt = this.clock();
        const needsClarification = intent.status === 'needs-clarification';
        const subagentEntries = await this.collectSubagentEntries();
        const allowPromptStart = this.subagentsAllowPrompt(subagentEntries);
        const coreBuilder = this.selectCoreBuilder(intent, existingArtifacts.kinds);
        const coreSegment = coreBuilder ? await coreBuilder.build({ intent, context }) : null;
        const initialArtifactKind = this.resolveInitialArtifactKind(intent, context, coreSegment, allowPromptStart);
        const transitions = needsClarification
            ? {
                nodes: {},
                summaries: [],
                terminalNodeId: coreSegment?.terminalNodeId ?? coreSegment?.entryId,
                entryNodeId: undefined,
                transitionPath: initialArtifactKind ? [initialArtifactKind] : []
            }
            : await this.buildTransitionSegments({
                intent,
                dependsOn: coreSegment?.terminalNodeId,
                initialArtifactKind,
                fallbackArtifactKind: intent.targetArtifact ?? context.request.artifactKind,
                entries: subagentEntries,
                allowPromptStart
            });
        const planNodes = {
            ...(coreSegment?.nodes ?? {}),
            ...transitions.nodes
        };
        const defaultEntryId = coreSegment?.entryId ?? 'clarification-check';
        const entryId = coreSegment?.entryId ||
            transitions.entryNodeId ||
            transitions.terminalNodeId ||
            defaultEntryId;
        if (!entryId) {
            throw new Error('Planner could not build a runnable plan for the requested intent');
        }
        const terminalNodeId = transitions.terminalNodeId ?? coreSegment?.terminalNodeId ?? entryId;
        const transitionPath = transitions.transitionPath;
        const artifactKind = intent.targetArtifact ??
            (transitionPath.length > 0 ? transitionPath[transitionPath.length - 1] : undefined) ??
            context.request.artifactKind ??
            (coreSegment?.intermediateArtifacts?.[coreSegment.intermediateArtifacts.length - 1] ??
                'unknown');
        const plan = {
            id: `plan-${context.runId}`,
            artifactKind,
            entryId,
            createdAt,
            version: PLAN_VERSION,
            nodes: planNodes,
            metadata: {
                planner: 'intelligent',
                requestedArtifactKind: intent.targetArtifact,
                requestedSections: coreSegment?.requestedSections ?? [],
                skillPacks: this.skillPackIds,
                skills: coreSegment?.skillSequence ? { sequence: coreSegment.skillSequence } : undefined,
                subagents: transitions.summaries,
                intermediateArtifacts: Array.from(new Set([...(coreSegment?.intermediateArtifacts ?? []), ...transitionPath])),
                requestedArtifacts: intent.requestedArtifacts,
                intentConfidence: intent.confidence,
                transitionPath,
                intent: {
                    source: intent.source,
                    requestedArtifacts: intent.requestedArtifacts,
                    targetArtifact: intent.targetArtifact,
                    confidence: intent.confidence,
                    status: intent.status,
                    transitionPath
                }
            }
        };
        return {
            plan,
            context
        };
    }
    async refinePlan(input) {
        return {
            plan: input.currentPlan,
            context: input.context
        };
    }
    async buildPrdCoreSegment(context) {
        await this.ensureSkillRegistered('prd.check-clarification');
        await this.ensureSkillRegistered('prd.analyze-context');
        await this.ensureSkillRegistered('prd.assemble-prd');
        const sectionSkills = await this.catalog.listByCategory('section-writer');
        const availableSections = this.extractAvailableSections(sectionSkills);
        const requestedSections = this.resolveRequestedSections(context.request.input?.targetSections ?? [], availableSections);
        const clarificationNode = {
            id: 'clarification-check',
            label: 'Check prompt for clarification needs',
            task: { kind: 'clarification-check' },
            status: 'pending',
            dependsOn: [],
            metadata: {
                kind: 'skill',
                skillId: 'prd.check-clarification'
            }
        };
        const analyzeNode = {
            id: 'analyze-context',
            label: 'Analyze product context',
            task: { kind: 'analyze-context' },
            status: 'pending',
            dependsOn: [clarificationNode.id],
            metadata: {
                kind: 'skill',
                skillId: 'prd.analyze-context'
            }
        };
        const sectionNodes = requestedSections.map(section => this.createSectionNode(section, analyzeNode.id));
        const sectionNodeIds = sectionNodes.map(node => node.id);
        const assembleNode = {
            id: 'assemble-prd',
            label: 'Assemble Product Requirements Document',
            task: { kind: 'assemble-prd' },
            status: 'pending',
            dependsOn: sectionNodeIds.length > 0 ? sectionNodeIds : [analyzeNode.id],
            metadata: {
                kind: 'skill',
                skillId: 'prd.assemble-prd'
            }
        };
        const nodes = {
            [clarificationNode.id]: clarificationNode,
            [analyzeNode.id]: analyzeNode,
            [assembleNode.id]: assembleNode
        };
        sectionNodes.forEach(node => {
            nodes[node.id] = node;
        });
        return {
            nodes,
            entryId: clarificationNode.id,
            terminalNodeId: assembleNode.id,
            requestedSections,
            intermediateArtifacts: ['prd'],
            skillSequence: this.buildSkillSequence(requestedSections)
        };
    }
    createSectionNode(section, dependsOn) {
        return {
            id: `write-${section}`,
            label: `Write ${section} section`,
            task: {
                kind: 'write-section',
                section
            },
            status: 'pending',
            dependsOn: [dependsOn],
            metadata: {
                kind: 'skill',
                skillId: `prd.write-${section}`
            }
        };
    }
    extractAvailableSections(skills) {
        const sections = new Set();
        const validSections = new Set(ALL_SECTION_NAMES.map(section => section));
        skills.forEach(skill => {
            if (skill.section && validSections.has(skill.section)) {
                sections.add(skill.section);
            }
        });
        return sections.size > 0
            ? Array.from(sections)
            : [...ALL_SECTION_NAMES];
    }
    buildSkillSequence(sections) {
        const sequence = ['prd.check-clarification', 'prd.analyze-context'];
        sections.forEach(section => sequence.push(`prd.write-${section}`));
        sequence.push('prd.assemble-prd');
        return sequence;
    }
    async ensureSkillRegistered(skillId) {
        const skill = await this.catalog.findById(skillId);
        if (!skill) {
            throw new Error(`Required skill "${skillId}" is not available in the enabled skill packs`);
        }
    }
    resolveRequestedSections(candidateSections, availableSections) {
        const fallback = availableSections.length > 0
            ? availableSections
            : [...ALL_SECTION_NAMES];
        if (!candidateSections || candidateSections.length === 0) {
            return [...fallback];
        }
        const normalizedCandidates = candidateSections
            .map(section => normalizeSection(section))
            .filter(Boolean);
        const lookup = new Map();
        fallback.forEach(section => lookup.set(normalizeSection(section), section));
        const requested = new Set();
        normalizedCandidates.forEach(token => {
            const match = lookup.get(token);
            if (match) {
                requested.add(match);
            }
        });
        if (requested.size === 0) {
            return [...fallback];
        }
        return fallback.filter(section => requested.has(section));
    }
    async buildTransitionSegments(params) {
        const entries = params.entries;
        const transitions = this.normalizeTransitions(params.intent);
        const seedArtifact = params.initialArtifactKind ??
            params.fallbackArtifactKind ??
            transitions[0]?.fromArtifact ??
            transitions[0]?.toArtifact;
        const startingArtifact = seedArtifact ?? (params.allowPromptStart ? 'prompt' : undefined);
        if (entries.length === 0) {
            return {
                nodes: {},
                summaries: [],
                terminalNodeId: params.dependsOn ?? '',
                entryNodeId: params.dependsOn,
                transitionPath: startingArtifact ? [startingArtifact] : (seedArtifact ? [seedArtifact] : [])
            };
        }
        const nodes = {};
        const summaries = [];
        const transitionPath = startingArtifact ? [startingArtifact] : [];
        let currentNodeId = params.dependsOn;
        let currentArtifact = transitionPath[transitionPath.length - 1];
        let entryNodeId;
        transitions.forEach(transition => {
            const fromArtifact = transition.fromArtifact ?? currentArtifact ?? (params.allowPromptStart ? 'prompt' : undefined);
            const targetArtifact = transition.toArtifact;
            if (!targetArtifact || targetArtifact === fromArtifact) {
                return;
            }
            const entry = this.findSubagentForTransition(entries, fromArtifact, targetArtifact);
            if (!entry) {
                return;
            }
            const nodeId = this.toSubagentNodeId(entry.id);
            const dependsOn = currentNodeId ? [currentNodeId] : [];
            nodes[nodeId] = {
                id: nodeId,
                label: entry.label ?? `Run ${entry.id}`,
                task: {
                    kind: 'subagent',
                    agentId: entry.id
                },
                status: 'pending',
                dependsOn,
                inputs: {
                    fromArtifact: fromArtifact
                },
                metadata: {
                    kind: 'subagent',
                    subagentId: entry.id,
                    artifactKind: entry.creates,
                    source: {
                        artifactKind: fromArtifact,
                        fromNode: currentNodeId
                    },
                    promoteResult: entry.creates === params.intent.targetArtifact,
                    tags: entry.tags
                }
            };
            if (!entryNodeId) {
                entryNodeId = nodeId;
            }
            summaries.push({
                id: entry.id,
                creates: entry.creates,
                consumes: entry.consumes,
                label: entry.label
            });
            transitionPath.push(entry.creates);
            currentArtifact = entry.creates;
            currentNodeId = nodeId;
        });
        return {
            nodes,
            summaries,
            terminalNodeId: currentNodeId ?? params.dependsOn ?? entryNodeId ?? '',
            entryNodeId,
            transitionPath
        };
    }
    normalizeTransitions(intent) {
        if (intent.transitions && intent.transitions.length > 0) {
            return intent.transitions;
        }
        const chain = intent.requestedArtifacts.length > 0
            ? intent.requestedArtifacts
            : intent.targetArtifact
                ? [intent.targetArtifact]
                : [];
        const transitions = [];
        let previous;
        chain.forEach(artifact => {
            if (previous === undefined) {
                transitions.push({ toArtifact: artifact });
                previous = artifact;
                return;
            }
            if (artifact === previous) {
                return;
            }
            transitions.push({ fromArtifact: previous, toArtifact: artifact });
            previous = artifact;
        });
        return transitions;
    }
    findSubagentForTransition(entries, fromArtifact, targetArtifact) {
        return entries.find(entry => {
            if (entry.creates !== targetArtifact) {
                return false;
            }
            if (!entry.consumes || entry.consumes.length === 0) {
                return true;
            }
            return fromArtifact ? entry.consumes.includes(fromArtifact) : false;
        });
    }
    async collectSubagentEntries() {
        const entries = new Map();
        this.registeredSubagents.forEach(subagent => {
            entries.set(subagent.metadata.id, {
                id: subagent.metadata.id,
                label: subagent.metadata.label,
                creates: subagent.metadata.artifactKind,
                consumes: subagent.metadata.sourceKinds,
                description: subagent.metadata.description,
                version: subagent.metadata.version,
                tags: subagent.metadata.tags
            });
        });
        if (this.subagentRegistry) {
            this.subagentRegistry.list().forEach((manifest) => {
                entries.set(manifest.id, {
                    id: manifest.id,
                    label: manifest.label,
                    creates: manifest.creates,
                    consumes: manifest.consumes,
                    description: manifest.description,
                    version: manifest.version,
                    tags: manifest.tags
                });
            });
        }
        return Array.from(entries.values());
    }
    subagentsAllowPrompt(entries) {
        return entries.some(entry => entry.consumes.length === 0 || entry.consumes.includes('prompt'));
    }
    toSubagentNodeId(subagentId) {
        return `subagent-${subagentId.replace(/[^a-zA-Z0-9._-]+/g, '-')}`;
    }
    resolveInitialArtifactKind(intent, context, coreSegment, allowPromptStart) {
        if (intent.status === 'needs-clarification') {
            return undefined;
        }
        if (coreSegment?.intermediateArtifacts?.length) {
            return coreSegment.intermediateArtifacts[coreSegment.intermediateArtifacts.length - 1];
        }
        const transitions = this.normalizeTransitions(intent);
        const firstTransition = transitions[0];
        if (firstTransition?.fromArtifact) {
            return firstTransition.fromArtifact;
        }
        if (firstTransition && allowPromptStart) {
            return 'prompt';
        }
        if (firstTransition?.toArtifact && (firstTransition.toArtifact !== 'prompt' || allowPromptStart)) {
            return firstTransition.toArtifact;
        }
        if (context.request.artifactKind && (context.request.artifactKind !== 'prompt' || allowPromptStart)) {
            return context.request.artifactKind;
        }
        if (intent.targetArtifact && (intent.targetArtifact !== 'prompt' || allowPromptStart)) {
            return intent.targetArtifact;
        }
        if (allowPromptStart) {
            return 'prompt';
        }
        return undefined;
    }
}
