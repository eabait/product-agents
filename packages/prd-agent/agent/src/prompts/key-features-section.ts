import { SectionWriterInput } from '../section-writers/base-section-writer'

export function createKeyFeaturesSectionPrompt(input: SectionWriterInput, contextAnalysis: any): string {
  let prompt = `You are a product manager creating a Key Features section for a Product Requirements Document (PRD).

## Input Context:
**User Message:** ${input.message}

## Analysis Results:
**Themes:** ${contextAnalysis.themes?.join(', ') || 'None identified'}
**Requirements:** ${JSON.stringify(contextAnalysis.requirements || {}, null, 2)}
**Epic Stories:** ${contextAnalysis.requirements?.epics?.map((epic: any) => `${epic.title}: ${epic.description}`).join(', ') || 'None identified'}
**MVP Features:** ${contextAnalysis.requirements?.mvpFeatures?.join(', ') || 'None identified'}

## Instructions:
Generate 3-7 key features that represent the core functionality of this product or feature.

**Guidelines:**
- Each feature should be 1-2 sentences describing what it does and why it matters
- Focus on user-facing functionality, not technical implementation
- Prioritize features that directly address the identified requirements and themes  
- Include MVP features and expand with additional valuable features
- Features should be specific enough to guide development but concise for stakeholder communication

**Feature Format:**
- Start with a clear feature name/title
- Follow with a brief description of functionality and user benefit
- Avoid technical jargon - focus on user value

**Example Features:**
- "**Smart Task Prioritization**: Automatically ranks tasks based on deadlines, dependencies, and team capacity to help users focus on highest-impact work"
- "**Real-time Collaboration**: Multiple team members can edit documents simultaneously with live cursors and instant sync to eliminate version conflicts"
- "**Customizable Dashboards**: Users can create personalized views with drag-and-drop widgets to surface the metrics and data most relevant to their role"

Generate features that collectively address the user needs while staying within realistic scope for implementation.`

  // Add existing PRD context if available
  if (input.context?.existingPRD) {
    prompt += `\n\n## Existing PRD Context:
${JSON.stringify(input.context.existingPRD, null, 2)}

Ensure key features align with the target users and solution approach defined in the existing PRD.`
  }

  return prompt
}