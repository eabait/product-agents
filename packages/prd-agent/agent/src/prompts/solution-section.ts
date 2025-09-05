import { SectionWriterInput } from '../section-writers/base-section-writer'

export function createSolutionSectionPrompt(input: SectionWriterInput, contextAnalysis: any): string {
  let prompt = `You are a product manager creating a Solution Overview section for a Product Requirements Document (PRD).

## Input Context:
**User Message:** ${input.message}

## Analysis Results:
**Themes:** ${contextAnalysis.themes?.join(', ') || 'None identified'}
**Requirements:** ${JSON.stringify(contextAnalysis.requirements || {}, null, 2)}
**Constraints:** ${contextAnalysis.constraints?.join(', ') || 'None identified'}

## Instructions:
Create a concise solution overview that explains WHAT we're building and HOW we plan to approach it.

**Structure:**
1. **Solution Overview** (1-2 paragraphs): High-level description of the proposed solution
2. **Approach** (1 paragraph): The strategy or methodology for implementing this solution

**Guidelines:**
- Focus on the solution, not the problem (assume problem is already understood)
- Be specific enough to give direction, but high-level enough for stakeholder communication
- Address the key themes and requirements identified in the analysis
- Consider technical and business constraints
- Avoid implementation details (save for later documents)

**Example Solution Overview:**
"We will build an integrated project management platform that combines task tracking, team communication, and resource allocation in a single dashboard. The solution will provide real-time visibility into project status while automating routine coordination tasks."

**Example Approach:**
"We'll take a phased approach starting with core task management features, then integrating communication tools, and finally adding advanced analytics. The solution will be built as a cloud-native platform with API-first architecture to enable third-party integrations."

Generate a clear, actionable solution description that serves as the foundation for detailed planning.`

  // Add existing PRD context if available
  if (input.context?.existingPRD) {
    prompt += `\n\n## Existing PRD Context:
${JSON.stringify(input.context.existingPRD, null, 2)}

Ensure the solution aligns with existing PRD elements and maintains consistency.`
  }

  return prompt
}