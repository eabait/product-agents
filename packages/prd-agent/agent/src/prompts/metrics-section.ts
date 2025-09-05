/**
 * Metrics Section Writer Prompt
 * 
 * Generates comprehensive Metrics & Success Criteria section for PRDs
 */

import type { SectionWriterInput } from '../section-writers'

export function createMetricsSectionPrompt(
  input: SectionWriterInput,
  analysisResults: {
    contextAnalysis?: any
    contentSummary?: any
  }
): string {
  const { contextAnalysis, contentSummary } = analysisResults

  return `Generate a comprehensive Metrics & Success Criteria section for a PRD based on the following analysis:

User Input: "${input.message}"

Context Analysis:
- Themes: ${contextAnalysis?.themes?.join(', ') || 'None'}
- Functional Requirements: ${contextAnalysis?.requirements?.functional?.join(', ') || 'None'}
- Technical Requirements: ${contextAnalysis?.requirements?.technical?.join(', ') || 'None'}

Content Summary:
- Key Points: ${contentSummary?.key_points?.join(', ') || 'None'}
- Priorities: ${contentSummary?.priorities?.map((p: any) => `${p.item} (${p.priority})`).join(', ') || 'None'}

${input.context?.contextPayload ? `Additional Context: ${JSON.stringify(input.context.contextPayload)}` : ''}

Generate a metrics section with:

1. **Success Metrics**:
   - Key metrics that define project success
   - Categorized as business, product, technical, or user metrics
   - Specific, measurable targets with baselines where possible
   - Timeline for achieving targets
   - Clear measurement method and owner
   - Priority level for each metric

2. **KPIs (Key Performance Indicators)**:
   - Core KPIs to monitor ongoing performance
   - Clear description and calculation formula
   - Target values and measurement frequency
   - Dashboard location for tracking

3. **Acceptance Criteria**:
   - Specific criteria that must be met before launch
   - Categorized by type (functional, performance, usability, security, compliance)
   - Test methods and pass criteria for each
   - Measurable and verifiable

4. **Launch Criteria**:
   - Go/no-go criteria for product launch
   - Technical, business, legal, and operational requirements
   - Current status and ownership
   - Due dates where applicable

5. **Monitoring Plan**:
   - Alerts for critical thresholds
   - Dashboard requirements
   - Reporting schedule and review cadence
   - Proactive monitoring approach

Guidelines:
- Metrics should be SMART (Specific, Measurable, Achievable, Relevant, Time-bound)
- Balance leading and lagging indicators
- Include both quantitative and qualitative measures where appropriate
- Consider the full user journey and business impact
- Ensure metrics align with business objectives and user value

Generate realistic, actionable metrics that teams can implement and track effectively.`
}