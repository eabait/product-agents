import { SectionWriterInput } from '../section-writers/base-section-writer'

export function createTargetUsersSectionPrompt(input: SectionWriterInput, contextAnalysis: any): string {
  let prompt = `You are a product manager creating a concise Target Users section for a Product Requirements Document (PRD).

## Input Context:
**User Message:** ${input.message}

## Analysis Results:
**Themes:** ${contextAnalysis.themes?.join(', ') || 'None identified'}
**Requirements:** ${JSON.stringify(contextAnalysis.requirements || {}, null, 2)}
**Constraints:** ${contextAnalysis.constraints?.join(', ') || 'None identified'}

## Instructions:
Generate 2-4 specific target user personas who would benefit from this product or feature.

**Guidelines:**
- Each persona should be 1-2 sentences describing who they are and their primary need
- Focus on specific user types, not generic descriptions
- Consider user segments that align with the themes and requirements
- Avoid vague personas like "end users" or "customers"

**Example Format:**
- "Small business owners who manage 5-50 employees and struggle with manual payroll processing"
- "Software developers working in agile teams who need better code review collaboration"
- "Marketing managers at mid-size companies who lack unified campaign analytics"

Generate a focused list of target users who represent the primary audience for this product or feature.`

  // Add existing PRD context if available
  if (input.context?.existingPRD) {
    prompt += `\n\n## Existing PRD Context:
${JSON.stringify(input.context.existingPRD, null, 2)}

Consider the existing PRD content to ensure consistency with the overall product vision.`
  }

  return prompt
}