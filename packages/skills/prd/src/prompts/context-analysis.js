/**
 * Context Analysis Worker Prompts
 *
 * Prompts for analyzing product requests and extracting key themes,
 * requirements, and constraints.
 */
export function createContextAnalysisPrompt(message, contextPayload) {
    const trimmedMessage = message.trim();
    const lines = [
        'You analyze the product request and extract planning signals for a PRD.',
        '',
        '## User Input',
        trimmedMessage.length > 0 ? trimmedMessage : 'No specific request provided.',
        ''
    ];
    const supplemental = formatSupplementalContext(contextPayload);
    if (supplemental.length > 0) {
        lines.push('## Provided Context');
        lines.push(...supplemental, '');
    }
    lines.push('## Tasks', '- Themes: identify the main product goals or focus areas (string array).', '- Requirements: capture functional, technical, and UX requirements as arrays of concise statements.', '- Epic stories: include 3-8 epic level user stories (title + description) when possible.', '- MVP features: list essential launch capabilities.', '- Constraints: highlight technical, business, or compliance limitations.', '', '## Output JSON Shape', '- themes: string[]', '- requirements: { functional: string[]; technical: string[]; user_experience: string[]; epics?: { title: string; description: string }[]; mvpFeatures?: string[] }', '- constraints: string[]', '', '## Output Rules', '- Use empty arrays when information is unavailable.', '- Keep entries concise (≤ 200 characters).', '- Return strict JSON only with the keys above. No additional commentary or code fences.');
    return lines.join('\n');
}
function formatSupplementalContext(contextPayload) {
    if (!contextPayload?.categorizedContext || contextPayload.categorizedContext.length === 0) {
        return [];
    }
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    const activeItems = contextPayload.categorizedContext
        .filter((item) => item?.isActive)
        .sort((a, b) => (priorityOrder[b?.priority] || 1) - (priorityOrder[a?.priority] || 1));
    const constraintLines = activeItems
        .filter((item) => item.category === 'constraint')
        .slice(0, 5)
        .map((item) => `- Constraint: ${item.title ?? 'Untitled'} — ${truncate(item.content)}`);
    const requirementLines = activeItems
        .filter((item) => item.category === 'requirement')
        .slice(0, 5)
        .map((item) => `- Requirement: ${item.title ?? 'Untitled'} — ${truncate(item.content)}`);
    const summary = [];
    if (constraintLines.length > 0) {
        summary.push(...constraintLines);
    }
    if (requirementLines.length > 0) {
        summary.push(...requirementLines);
    }
    return summary;
}
function truncate(value, maxChars = 240) {
    if (typeof value !== 'string') {
        return String(value ?? '').slice(0, maxChars);
    }
    return value.length > maxChars ? `${value.slice(0, maxChars - 3)}...` : value;
}
