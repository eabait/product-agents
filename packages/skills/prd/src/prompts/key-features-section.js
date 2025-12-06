import { buildAnalysisSummaryBlock, buildExistingSectionBlock, buildUserContextBlock, formatExistingItemsList, formatReturnJsonOnly, formatStructuredOutputRequirement } from './prompt-helpers.ts';
export function createKeyFeaturesSectionPrompt(input, contextAnalysis, existingFeatures) {
    const lines = [
        'You are a product manager updating the Key Features section of a PRD. Honor strong existing items and make the smallest necessary changes.',
        '',
        buildUserContextBlock(input.message),
        buildAnalysisSummaryBlock(contextAnalysis, {
            includeEpics: true,
            includeMvpFeatures: true,
            includeConstraints: true
        }),
        ''
    ];
    const existingSection = buildExistingSectionBlock(input, 'keyFeatures');
    if (existingSection) {
        lines.push(existingSection, '');
    }
    const currentFeatures = formatExistingItemsList('## Current Feature Set', existingFeatures);
    if (currentFeatures) {
        lines.push(currentFeatures, '');
    }
    lines.push('## Instructions', '- Produce 3-7 user-facing features. Each feature should include a short title and a value-focused description.', '- Prioritize items that address the identified requirements, epics, and MVP scope.', '- Keep language stakeholder-friendly (≤ 220 characters per feature).', '- Prefer targeted updates or additions over full rewrites.', '', formatStructuredOutputRequirement([
        'mode: "smart_merge" | "append" | "replace"',
        'operations: array of { action, referenceFeature?, feature?, rationale? } to describe updates/removals',
        'proposedFeatures: array of fully written features to append when adding new items',
        'summary: optional string explaining notable changes'
    ]), '', formatReturnJsonOnly());
    return lines.join('\n');
}
