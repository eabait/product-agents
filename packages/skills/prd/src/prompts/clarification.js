/**
 * Clarification Prompt
 *
 * Analyzes user input to determine if sufficient context exists for PRD generation
 * and generates targeted questions to gather missing information.
 */
export function createClarificationPrompt(userMessage) {
    const trimmedMessage = userMessage.trim();
    return [
        'You evaluate whether the following product request has enough detail to generate a meaningful PRD.',
        '',
        `Request: "${trimmedMessage.length > 0 ? trimmedMessage : 'No specific user request provided.'}"`,
        '',
        'Determine if clarification is required:',
        '- Minimum viable information covers the product concept, primary user type, and essential functionality.',
        '- Prefer making reasonable industry assumptions over asking obvious follow-up questions (e.g., payments for e-commerce, task tracking for project tools).',
        '',
        'Questioning strategy:',
        '- Ask only critical questions when a core concept, users, or primary functionality is missing.',
        '- Optional clarifications should be limited to high-impact business context, constraints, or success criteria.',
        '',
        'Confidence guidelines (0-100):',
        '- 80-100 → proceed without clarification.',
        '- 60-79 → proceed but include up to two critical questions.',
        '- 40-59 → ask targeted questions that resolve fundamental gaps.',
        '- 0-39 → request clarification before drafting the PRD.',
        '',
        'Return JSON with keys:',
        '- needsClarification (boolean)',
        '- confidence (number 0-100)',
        '- missingCritical (array of strings describing missing essentials)',
        '- questions (array of critical questions only)',
        '',
        'Output rules:',
        '- Return strict JSON only. No prose, explanations, or code fences.'
    ].join('\n');
}
