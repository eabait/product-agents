import { SectionWriterInput } from '../section-writers/base-section-writer'

export function createKeyFeaturesSectionPrompt(
  input: SectionWriterInput,
  contextAnalysis: any,
  existingFeatures: string[]
): string {
  let prompt = `You are a product manager updating the Key Features section of a Product Requirements Document (PRD). Respect well-written existing features and apply user edits with the smallest necessary change.

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

  if (existingFeatures.length > 0) {
    prompt += `\n\n## Existing Key Features:
${JSON.stringify(existingFeatures, null, 2)}

Preserve these features unless the user explicitly requests changes. Favor appending or refining individual entries over replacing the entire list.`
  }

  prompt += `\n\n## Structured Output Requirement:
Return JSON with the following structure:
\`\`\`json
{
  "mode": "smart_merge | append | replace",
  "operations": [
    {
      "action": "add | update | remove",
      "referenceFeature": "Existing feature to reference when updating/removing",
      "feature": "Full feature description (required for add/update)",
      "rationale": "Brief explanation (optional)"
    }
  ],
  "proposedFeatures": ["List of fully written new features to append"],
  "summary": "Brief explanation of the applied changes (optional)"
}
\`\`\`

- Use \`mode: "replace"\` only if a complete rewrite is required.
- Use \`operations\` for precise modifications.
- Include fully phrased features in \`proposedFeatures\` when adding new ones.`

  return prompt
}
