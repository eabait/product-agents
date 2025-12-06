import { SECTION_NAMES } from '@product-agents/prd-shared';
const SECTION_LABELS = {
    [SECTION_NAMES.TARGET_USERS]: 'Target Users Section Writer',
    [SECTION_NAMES.SOLUTION]: 'Solution Section Writer',
    [SECTION_NAMES.KEY_FEATURES]: 'Key Features Section Writer',
    [SECTION_NAMES.SUCCESS_METRICS]: 'Success Metrics Section Writer',
    [SECTION_NAMES.CONSTRAINTS]: 'Constraints Section Writer'
};
export const prdSkillPack = {
    id: 'prd.core',
    version: '0.3.0',
    label: 'PRD Core Skills',
    description: 'Context analysis, section writers, and assembly primitives for PRD generation.',
    skills: [
        {
            id: 'prd.check-clarification',
            label: 'Clarification Analyzer',
            version: '1.0.0',
            category: 'analyzer',
            description: 'Evaluates the incoming request and decides if clarification questions are required.'
        },
        {
            id: 'prd.analyze-context',
            label: 'Context Analyzer',
            version: '1.0.0',
            category: 'analyzer',
            description: 'Summarises user goals, requirements, and constraints to seed downstream writers.'
        },
        ...(Object.values(SECTION_NAMES).map(section => ({
            id: `prd.write-${section}`,
            label: SECTION_LABELS[section],
            version: '1.0.0',
            category: 'section-writer',
            section,
            description: `Generates and updates the ${section} section of the PRD.`
        }))),
        {
            id: 'prd.assemble-prd',
            label: 'PRD Assembly',
            version: '1.0.0',
            category: 'assembly',
            description: 'Aggregates section outputs, calculates confidence, and emits final artifact metadata.'
        }
    ],
    subagents: [
        {
            id: 'persona.builder',
            label: 'Persona Builder',
            version: '0.1.0',
            artifactKind: 'persona',
            description: 'Derives structured personas from generated PRDs.'
        }
    ]
};
export const listPrdSkills = () => [...prdSkillPack.skills];
export const listPrdSubagents = () => [...(prdSkillPack.subagents ?? [])];
