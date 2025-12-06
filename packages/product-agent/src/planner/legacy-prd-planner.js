import { ALL_SECTION_NAMES } from '@product-agents/prd-shared';
const PLAN_VERSION = '2.1.0';
export class LegacyPrdPlanner {
    clock;
    constructor(options) {
        this.clock = options?.clock ?? (() => new Date());
    }
    async createPlan(context) {
        const createdAt = this.clock();
        const runInput = context.request.input;
        const isSectionName = (value) => ALL_SECTION_NAMES.includes(value);
        const validSections = ALL_SECTION_NAMES;
        const requestedSections = runInput?.targetSections && runInput.targetSections.length > 0
            ? runInput.targetSections.filter(isSectionName)
            : [...validSections];
        const sectionNodes = {};
        const sectionIds = [];
        requestedSections.forEach((section) => {
            const nodeId = `write-${section}`;
            sectionIds.push(nodeId);
            sectionNodes[nodeId] = this.createSectionNode(section);
        });
        const plan = {
            id: `plan-${context.runId}`,
            artifactKind: context.request.artifactKind,
            entryId: 'clarification-check',
            createdAt,
            version: PLAN_VERSION,
            nodes: {
                'clarification-check': {
                    id: 'clarification-check',
                    label: 'Check prompt for clarification needs',
                    task: { kind: 'clarification-check' },
                    status: 'pending',
                    dependsOn: [],
                    metadata: {
                        skillId: 'prd.check-clarification'
                    }
                },
                'analyze-context': {
                    id: 'analyze-context',
                    label: 'Analyze product context',
                    task: { kind: 'analyze-context' },
                    status: 'pending',
                    dependsOn: ['clarification-check'],
                    metadata: {
                        skillId: 'prd.analyze-context'
                    }
                },
                ...sectionIds.reduce((acc, nodeId) => {
                    acc[nodeId] = {
                        ...sectionNodes[nodeId],
                        dependsOn: ['analyze-context']
                    };
                    return acc;
                }, {}),
                'assemble-prd': {
                    id: 'assemble-prd',
                    label: 'Assemble Product Requirements Document',
                    task: { kind: 'assemble-prd' },
                    status: 'pending',
                    dependsOn: sectionIds.length > 0
                        ? sectionIds
                        : ['analyze-context'],
                    metadata: {
                        skillId: 'prd.assemble-prd'
                    }
                }
            },
            metadata: {
                source: 'legacy-prd-planner'
            }
        };
        return {
            plan,
            context
        };
    }
    createSectionNode(section) {
        return {
            id: `write-${section}`,
            label: `Write ${section} section`,
            task: {
                kind: 'write-section',
                section
            },
            status: 'pending',
            dependsOn: [],
            metadata: {
                skillId: `prd.write-${section}`
            }
        };
    }
    async refinePlan(input) {
        return {
            plan: input.currentPlan,
            context: input.context
        };
    }
}
export const createLegacyPrdPlanner = (options) => new LegacyPrdPlanner(options);
