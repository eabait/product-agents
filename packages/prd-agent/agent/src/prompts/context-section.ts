/**
 * Context Section Writer Prompt
 * 
 * Generates comprehensive Business/Product Context section for PRDs
 */

import type { SectionWriterInput } from '../section-writers'

export function createContextSectionPrompt(
  input: SectionWriterInput,
  contextAnalysis: any,
  riskAnalysis: any
): string {
  return `Generate a comprehensive Business/Product Context section for a PRD based on the following analysis:

User Input: "${input.message}"

Context Analysis Results:
- Themes: ${contextAnalysis.themes?.join(', ') || 'None identified'}
- Requirements: ${JSON.stringify(contextAnalysis.requirements || {})}
- Constraints: ${contextAnalysis.constraints?.join(', ') || 'None identified'}

Risk Analysis Results:
- Dependencies: ${riskAnalysis.dependencies?.map((d: any) => d.dependency).join(', ') || 'None identified'}
- Business Risks: ${riskAnalysis.business_risks?.map((r: any) => r.risk).join(', ') || 'None identified'}

${input.context?.contextPayload ? `Additional Context: ${JSON.stringify(input.context.contextPayload)}` : ''}

Generate a context section that includes:

1. **Business Context**: Clear explanation of the business problem, opportunity, and strategic rationale
2. **Product Context**: How this fits within the broader product ecosystem and strategy
3. **Market Context** (if applicable): Relevant market conditions, competitive landscape, or user trends
4. **Stakeholders**: Key stakeholders with their interests and influence levels
5. **Constraints**: Technical, business, timeline, and resource constraints
6. **Assumptions**: Key assumptions being made about the solution, market, or implementation

The context should be:
- Clear and actionable for development teams
- Comprehensive enough for stakeholders to understand the "why"
- Specific to this particular product/feature
- Free of generic statements or placeholders

Focus on providing concrete, specific information that will inform decision-making throughout the project.`
}