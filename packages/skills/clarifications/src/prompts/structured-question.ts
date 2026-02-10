/**
 * Structured Question Prompt
 *
 * Generates structured questions with selectable options for gathering
 * missing information from the user. Used when clarification is needed.
 */

export function createStructuredQuestionPrompt(
  userMessage: string,
  missingCritical: string[]
): string {
  const trimmedMessage = userMessage.trim()
  const missingList = missingCritical.length > 0
    ? missingCritical.join(', ')
    : 'general product information'

  return [
    'Generate structured clarification questions for a product requirements request.',
    '',
    `User request: "${trimmedMessage.length > 0 ? trimmedMessage : 'No specific user request provided.'}"`,
    '',
    `Missing critical information: ${missingList}`,
    '',
    'For each missing area, create a structured question with:',
    '1. id: unique identifier (kebab-case, e.g., "auth-method", "user-storage")',
    '2. header: short label (max 12 characters) displayed as a chip/tag (e.g., "Auth", "Storage", "Users")',
    '3. question: clear, specific question text ending with a question mark',
    '4. options: 2-4 predefined choices, each with:',
    '   - label: brief option name (1-5 words)',
    '   - description: what selecting this option means for the product (max 200 chars)',
    '5. multiSelect: true if multiple options can be selected together, false for single-choice',
    '',
    'Guidelines:',
    '- Options should cover common patterns and approaches for the domain',
    '- Include practical, actionable choices that inform PRD generation',
    '- Descriptions should clarify the implications of each choice',
    '- Focus on questions that resolve fundamental gaps, not nice-to-haves',
    '- Generate 1-4 questions maximum, prioritized by importance',
    '',
    'Return JSON with keys:',
    '- questions: array of question objects with the structure above',
    '- context: brief explanation (1-2 sentences) of why these questions are important',
    '- canSkip: boolean (true only for optional refinements, false for critical questions)',
    '',
    'Output rules:',
    '- Return strict JSON only. No prose, explanations, or code fences.',
    '- Ensure all ids are unique kebab-case strings.',
    '- Ensure headers are max 12 characters.',
    '- Ensure each question has 2-4 options.'
  ].join('\n')
}
