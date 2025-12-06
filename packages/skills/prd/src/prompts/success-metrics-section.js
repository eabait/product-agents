import { buildAnalysisSummaryBlock, buildExistingSectionBlock, buildUserContextBlock, formatMetricsList, formatReturnJsonOnly, formatStructuredOutputRequirement } from './prompt-helpers.ts';
export function createSuccessMetricsSectionPrompt(input, contextAnalysis) {
    const existingMetrics = Array.isArray(input.context?.existingSection?.successMetrics)
        ? input.context?.existingSection?.successMetrics
        : Array.isArray(input.context?.existingSection)
            ? input.context?.existingSection
            : [];
    const lines = [
        'You are a product manager updating the Success Metrics section of a PRD. Respect strong existing metrics and apply only necessary changes.',
        '',
        buildUserContextBlock(input.message),
        buildAnalysisSummaryBlock(contextAnalysis, { includeConstraints: true }),
        ''
    ];
    const existingSection = buildExistingSectionBlock(input, 'successMetrics');
    if (existingSection) {
        lines.push(existingSection, '');
    }
    const currentMetrics = formatMetricsList('## Current Metrics to Preserve', existingMetrics);
    if (currentMetrics) {
        lines.push(currentMetrics, '');
    }
    lines.push('## Instructions', '- Provide 3-6 outcome metrics that signal whether the product meets its goals.', '- Each metric must include a measurable target and a realistic timeline.', '- Balance user value and business impact; avoid vague activity metrics.', '- Reference existing metrics when updating or removing items.', '', formatStructuredOutputRequirement([
        'mode: "smart_merge" | "append" | "replace"',
        'operations: array of { action, referenceMetric?, metric?, target?, timeline?, rationale? }',
        'proposedMetrics: array of { metric, target, timeline } for new additions',
        'summary: optional string describing notable adjustments'
    ]), '', formatReturnJsonOnly());
    return lines.join('\n');
}
