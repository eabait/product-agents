/**
 * Context Analysis Worker Prompts
 * 
 * Prompts for analyzing product requests and extracting key themes,
 * requirements, and constraints.
 */

export function createContextAnalysisPrompt(message: string, contextPayload?: any): string {
  const trimmedMessage = message.trim()
  const lines: string[] = [
    'You analyze the product request and extract planning signals for a PRD.',
    '',
    '## User Input',
    trimmedMessage.length > 0 ? trimmedMessage : 'No specific request provided.',
    ''
  ]

  const supplemental = formatSupplementalContext(contextPayload)
  if (supplemental.length > 0) {
    lines.push('## Provided Context')
    lines.push(...supplemental, '')
  }

  lines.push(
    '## Tasks',
    '- Themes: identify the main product goals or focus areas (string array).',
    '- Requirements: capture functional, technical, and UX requirements as arrays of concise statements.',
    '- Epic stories: include 3-8 epic level user stories (title + description) when possible.',
    '- MVP features: list essential launch capabilities.',
    '- Constraints: highlight technical, business, or compliance limitations.',
    '',
    '## Output JSON Shape',
    '- themes: string[]',
    '- requirements: { functional: string[]; technical: string[]; user_experience: string[]; epics?: { title: string; description: string }[]; mvpFeatures?: string[] }',
    '- constraints: string[]',
    '',
    '## Output Rules',
    '- Use empty arrays when information is unavailable.',
    '- Keep entries concise (≤ 200 characters).',
    '- Return strict JSON only with the keys above. No additional commentary or code fences.'
  )

  return lines.join('\n')
}

function formatSupplementalContext(contextPayload?: any): string[] {
  if (!contextPayload?.categorizedContext || contextPayload.categorizedContext.length === 0) {
    return []
  }

  const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 }

  const activeItems = contextPayload.categorizedContext
    .filter((item: any) => item?.isActive)
    .sort((a: any, b: any) => (priorityOrder[b?.priority] || 1) - (priorityOrder[a?.priority] || 1))

  const constraintLines = activeItems
    .filter((item: any) => item.category === 'constraint')
    .slice(0, 5)
    .map((item: any) => `- Constraint: ${item.title ?? 'Untitled'} — ${truncate(item.content)}`)

  const requirementLines = activeItems
    .filter((item: any) => item.category === 'requirement')
    .slice(0, 5)
    .map((item: any) => `- Requirement: ${item.title ?? 'Untitled'} — ${truncate(item.content)}`)

  const summary: string[] = []
  if (constraintLines.length > 0) {
    summary.push(...constraintLines)
  }
  if (requirementLines.length > 0) {
    summary.push(...requirementLines)
  }

  return summary
}

function truncate(value: unknown, maxChars = 240): string {
  if (typeof value !== 'string') {
    return String(value ?? '').slice(0, maxChars)
  }
  return value.length > maxChars ? `${value.slice(0, maxChars - 3)}...` : value
}
