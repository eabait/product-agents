import type { StoryMapContext } from './context-resolver'

export const buildStoryMapPrompt = (
  context: StoryMapContext,
  requestMessage?: string,
  conversationSummary?: string
): string => {
  const lines: string[] = []

  lines.push('You are a product strategist creating a user story map from product artifacts.')
  lines.push('')
  lines.push('Task: Generate epics and user stories based on the provided PRD, personas, and research.')

  if (requestMessage) {
    lines.push('')
    lines.push('User request:')
    lines.push(requestMessage)
  }

  lines.push('')
  lines.push('=== CONTEXT ===')

  if (context.prdSummary) {
    lines.push('')
    lines.push('PRD Summary:')
    lines.push(context.prdSummary)
  }

  if (context.prdSections) {
    const sections = context.prdSections as Record<string, unknown>
    if (sections.targetUsers) {
      lines.push('')
      lines.push('Target Users:')
      lines.push(formatValue(sections.targetUsers))
    }
    if (sections.keyFeatures) {
      lines.push('')
      lines.push('Key Features:')
      lines.push(formatValue(sections.keyFeatures))
    }
    if (sections.solution) {
      lines.push('')
      lines.push('Solution:')
      lines.push(formatValue(sections.solution))
    }
  }

  if (context.personas && context.personas.length > 0) {
    lines.push('')
    lines.push('Personas:')
    for (const p of context.personas) {
      lines.push(`- ${p.id}${p.name ? ` (${p.name})` : ''}`)
      if (p.goals?.length) lines.push(`  Goals: ${p.goals.join('; ')}`)
      if (p.frustrations?.length) lines.push(`  Frustrations: ${p.frustrations.join('; ')}`)
    }
  }

  if (context.research?.findings?.length) {
    lines.push('')
    lines.push('Research Findings:')
    context.research.findings.forEach(f => lines.push(`- ${f}`))
  }

  if (context.research?.recommendations?.length) {
    lines.push('')
    lines.push('Recommendations:')
    context.research.recommendations.forEach(r => lines.push(`- ${r}`))
  }

  if (conversationSummary) {
    lines.push('')
    lines.push('Conversation context:')
    lines.push(conversationSummary)
  }

  if (context.existingStoryMap) {
    lines.push('')
    lines.push('Note: An existing story map is present. Prefer incremental improvements over duplication.')
  }

  lines.push('')
  lines.push('=== INSTRUCTIONS ===')
  lines.push('- Create one epic per major feature or user goal from the PRD')
  lines.push('- Add stories to cover each persona\'s needs within the epic')
  lines.push('- Keep stories focused and split large ones')
  lines.push('- Write acceptance criteria that are specific and testable')
  lines.push('- Use persona IDs in the "asA" field when applicable')
  lines.push('- Estimate effort: xs (hours), s (1-2 days), m (3-5 days), l (1-2 weeks), xl (2+ weeks)')
  lines.push('- Do not invent PII or fake data')

  lines.push('')
  lines.push('Output JSON:')
  lines.push(`{
  "version": "1.0.0",
  "label": "Story Map",
  "personasReferenced": ["persona-1"],
  "epics": [
    {
      "id": "epic-1",
      "name": "Epic name based on feature/goal",
      "outcome": "Business or user outcome this epic delivers",
      "stories": [
        {
          "id": "story-1",
          "title": "Descriptive title",
          "asA": "persona-id or role",
          "iWant": "specific capability or action",
          "soThat": "measurable benefit or outcome",
          "acceptanceCriteria": ["Given X, when Y, then Z", "User can see confirmation"],
          "effort": "m",
          "personas": [{ "personaId": "persona-1", "goal": "their specific goal" }]
        }
      ]
    }
  ]
}`)

  return lines.join('\n')
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) {
    return value.map(v => typeof v === 'string' ? `- ${v}` : `- ${JSON.stringify(v)}`).join('\n')
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 2)
  }
  return String(value)
}
