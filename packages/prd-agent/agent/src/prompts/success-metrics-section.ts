import { SectionWriterInput } from '../section-writers/base-section-writer'

export function createSuccessMetricsSectionPrompt(input: SectionWriterInput, contextAnalysis: any): string {
  let prompt = `You are a product manager creating a Success Metrics section for a Product Requirements Document (PRD).

## Input Context:
**User Message:** ${input.message}

## Analysis Results:
**Themes:** ${contextAnalysis.themes?.join(', ') || 'None identified'}
**Requirements:** ${JSON.stringify(contextAnalysis.requirements || {}, null, 2)}
**Constraints:** ${contextAnalysis.constraints?.join(', ') || 'None identified'}

## Instructions:
Generate 2-4 key success metrics that will measure whether this product or feature achieves its goals.

**Guidelines:**
- Focus on outcome metrics, not activity metrics (e.g., "user retention" not "features built")
- Each metric must have a specific, measurable target (numbers, percentages, or concrete thresholds)
- Include realistic timelines for achieving targets (e.g., "within 6 months", "by Q2 2024")
- Balance business metrics (revenue, cost savings) with user metrics (satisfaction, adoption)
- Ensure metrics can actually be measured with available data/tools

**Metric Structure:**
- **Metric**: Clear name of what we're measuring
- **Target**: Specific, measurable goal (with numbers)
- **Timeline**: When we expect to achieve this target

**Example Success Metrics:**
- **Metric**: "Monthly Active Users", **Target**: "5,000+ MAU within 6 months", **Timeline**: "6 months post-launch"
- **Metric**: "Customer Support Ticket Reduction", **Target**: "30% decrease in support volume", **Timeline**: "3 months post-implementation" 
- **Metric**: "User Task Completion Rate", **Target**: "85% of users complete primary workflow", **Timeline**: "First month of usage"

**Avoid These Common Mistakes:**
- Vague targets like "increase engagement" or "improve satisfaction"
- Metrics that can't be realistically measured
- Too many metrics (focus on 2-4 most important)
- Activity metrics instead of outcome metrics

Generate metrics that clearly indicate product success and can guide decision-making.`

  // Add existing PRD context if available
  if (input.context?.existingPRD) {
    prompt += `\n\n## Existing PRD Context:
${JSON.stringify(input.context.existingPRD, null, 2)}

Ensure success metrics align with the target users, solution, and key features defined in the existing PRD.`
  }

  return prompt
}