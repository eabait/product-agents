import { summarizeExistingPrd } from './prompt-helpers.ts';
const SECTION_DESCRIPTORS = {
    targetUsers: 'Who the product is for',
    solution: 'What we are building and how',
    keyFeatures: 'Core functionality and differentiators',
    successMetrics: 'How success is measured',
    constraints: 'Technical, business, or regulatory limits'
};
export function createSectionDetectionPrompt(message, existingPRD) {
    const trimmedMessage = message.trim();
    const lines = [
        'You review an edit request and decide which PRD sections require updates.',
        '',
        '## Available Sections',
        JSON.stringify(SECTION_DESCRIPTORS, null, 2),
        '',
        '## User Request',
        trimmedMessage.length > 0 ? trimmedMessage : 'No instruction provided.',
        ''
    ];
    const existingSnapshot = summarizeExistingPrd(existingPRD);
    if (existingSnapshot.length > 0) {
        lines.push(...existingSnapshot, '');
    }
    lines.push('## Decision Process', '- Select only the sections that must change to satisfy the request.', '- If the request does not materially impact a section, leave it out.', '- Typical mapping:', '  • New or modified features → keyFeatures', '  • Changes to audience/personas → targetUsers', '  • Core solution changes or delivery approach → solution', '  • Measurement or KPI updates → successMetrics', '  • New limitations, dependencies, or compliance needs → constraints', '', '## Output JSON Shape', '- affectedSections: string[] containing section keys from the table above', '- reasoning: object where each key is a section and the value explains why it changes', '- confidence: "high" | "medium" | "low"', '', '## Output Rules', '- Be conservative: exclude sections unless there is a clear change driver.', '- Return strict JSON only. No prose, explanations, or code fences.');
    return lines.join('\n');
}
