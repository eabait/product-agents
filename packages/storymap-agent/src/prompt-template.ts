import type { StoryMapContext } from './context-resolver'

const formatList = (label: string, values?: string[], max = 8): string => {
  const items = (values ?? []).filter(Boolean).slice(0, max)
  if (items.length === 0) return ''
  return `- ${label}: ${items.join('; ')}`
}

export const buildStoryMapPrompt = (
  context: StoryMapContext,
  requestMessage?: string,
  conversationSummary?: string
): string => {
  const lines: string[] = []
  lines.push('You are a product strategist creating a hierarchical user story map.')
  lines.push('Return a concise story map with epics and user stories. Each story must include acceptanceCriteria and optional effort/confidence.')
  lines.push('Link stories to personas when relevant (use persona ids).')
  lines.push('Surface risks/assumptions under roadmapNotes. Do not invent PII; keep names generic.')

  if (requestMessage) {
    lines.push('\nUser request:')
    lines.push(requestMessage)
  }

  lines.push('\nContext:')
  if (context.prdSummary) {
    lines.push(`- PRD summary: ${context.prdSummary}`)
  }
  if (conversationSummary) {
    lines.push(`- Conversation highlights: ${conversationSummary}`)
  }
  if (context.prdSections) {
    const keys = Object.keys(context.prdSections).slice(0, 6)
    if (keys.length > 0) {
      lines.push(`- PRD sections available: ${keys.join(', ')}`)
    }
  }
  if (context.personas && context.personas.length > 0) {
    const personaStrings = context.personas.map(p => `${p.id}${p.name ? ` (${p.name})` : ''}`)
    lines.push(`- Personas: ${personaStrings.join('; ')}`)
  }
  if (context.research) {
    lines.push(formatList('Research findings', context.research.findings))
    lines.push(formatList('Recommendations', context.research.recommendations))
    lines.push(formatList('Limitations', context.research.limitations, 5))
  }
  if (context.existingStoryMap) {
    lines.push('- Existing story map present: prefer incremental improvements, avoid duplication.')
  }

  lines.push('\nOutput JSON shape:')
  lines.push(`{
  "version": "1.0.0",
  "label": "Story Map",
  "personasReferenced": ["persona-1"],
  "epics": [
    {
      "id": "epic-1",
      "name": "Concise epic name",
      "outcome": "User/business outcome",
      "stories": [
        {
          "id": "story-1",
          "title": "Short title",
          "asA": "persona id or role",
          "iWant": "what the user wants",
          "soThat": "why it matters",
          "acceptanceCriteria": ["observable acceptance"],
          "effort": "s|m|l|xl",
          "confidence": 0.6,
          "personas": [ { "personaId": "persona-1", "goal": "goal or scenario" } ]
        }
      ],
      "dependencies": ["epic-2"],
      "metrics": ["activation rate", "cycle time"]
    }
  ],
  "roadmapNotes": {
    "releaseRings": [ { "label": "MVP", "epicIds": ["epic-1"] } ],
    "risks": ["key risk"],
    "assumptions": ["key assumption"]
  }
}`)

  lines.push('\nInstructions:')
  lines.push('- Keep 3-6 epics, 3-6 stories per epic, concise wording.')
  lines.push('- Reflect personas/goals/pain points; tag sources in titles when helpful (e.g., "(persona:ops)").')
  lines.push('- Fold research findings into acceptanceCriteria when they imply success signals or constraints.')
  lines.push('- If context is sparse, add assumptions explaining gaps.')

  return lines.filter(Boolean).join('\n')
}
