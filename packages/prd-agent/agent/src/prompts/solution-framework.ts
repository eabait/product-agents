/**
 * Solution Framework Worker Prompts
 * 
 * Prompts for designing minimal, PRD-friendly solution frameworks
 * with specific technical components and approaches.
 */

export function createSolutionFrameworkPrompt(problemStatement: string, contextPayload?: any): string {
  let prompt = `Design a minimal, PRD-friendly solution framework for this problem:
Problem: ${problemStatement}`

  // Add technical constraints from context payload
  if (contextPayload?.categorizedContext?.length > 0) {
    const constraints = contextPayload.categorizedContext
      .filter((item: any) => item.category === 'constraint' && item.isActive)
      .sort((a: any, b: any) => {
        const priorityOrder: { [key: string]: number } = { high: 3, medium: 2, low: 1 }
        const aKey = String((a as any).priority ?? 'low')
        const bKey = String((b as any).priority ?? 'low')
        const ap = priorityOrder[aKey]
        const bp = priorityOrder[bKey]
        return bp - ap
      })
    
    if (constraints.length > 0) {
      prompt += '\n\nTechnical Constraints to Incorporate:\n'
      constraints.forEach((item: any) => {
        prompt += `- ${item.title}: ${item.content}\n`
      })
    }

    // Add stakeholder context for additional guidance  
    const stakeholder = contextPayload.categorizedContext
      .filter((item: any) => item.category === 'stakeholder' && item.isActive)
    
    if (stakeholder.length > 0) {
      prompt += '\nStakeholder Context:\n'
      stakeholder.forEach((item: any) => {
        prompt += `- ${item.title}: ${item.content}\n`
      })
    }
  }

  prompt += `

You are producing content for a Product Requirements Document — be concise and return only the JSON object requested (no explanation text).
Return exactly this structure and keep values short (one line strings or short arrays):
{
  "approach": "One-sentence overview incorporating the constraints",
  "components": ["UI", "API", "Database"],
  "technologies": ["Specific technologies mentioned in constraints or appropriate alternatives"]
}

IMPORTANT: Ensure the approach, components, and technologies reflect the technical constraints provided above.
Prefer human-readable strings/arrays. If you must return objects, keep values short and suitable for insertion into a PRD.`

  return prompt
}
