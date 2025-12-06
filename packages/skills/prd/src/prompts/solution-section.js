import { buildAnalysisSummaryBlock, buildExistingSectionBlock, buildUserContextBlock, formatReturnJsonOnly, formatStructuredOutputRequirement } from './prompt-helpers.ts';
export function createSolutionSectionPrompt(input, contextAnalysis) {
    const lines = [
        'You are a product manager drafting the Solution Overview section of a PRD. Provide clear direction while staying high level.',
        '',
        buildUserContextBlock(input.message),
        buildAnalysisSummaryBlock(contextAnalysis, { includeConstraints: true }),
        ''
    ];
    const existingSection = buildExistingSectionBlock(input, 'solution');
    if (existingSection) {
        lines.push(existingSection, '');
    }
    lines.push('## Instructions', '- Solution overview: describe WHAT is being built in 2 concise paragraphs or fewer.', '- Approach: outline HOW the team will execute (architecture, phases, or methodology) in 1 paragraph.', '- Address the identified requirements and constraints while keeping stakeholder-friendly language.', '- Avoid low-level implementation details or open questions.', '', formatStructuredOutputRequirement([
        'solutionOverview: string (120-600 characters, stakeholder friendly)',
        'approach: string (90-400 characters describing execution strategy)'
    ]), '', formatReturnJsonOnly());
    return lines.join('\n');
}
