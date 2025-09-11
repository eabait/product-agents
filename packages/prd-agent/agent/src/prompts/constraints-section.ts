import { SectionWriterInput } from '../section-writers/base-section-writer'

export function createConstraintsSectionPrompt(input: SectionWriterInput, contextAnalysis: any): string {
  let prompt = `You are a product manager creating a Constraints section for a Product Requirements Document (PRD).

## Input Context:
**User Message:** ${input.message}

## Analysis Results:
**Themes:** ${contextAnalysis.themes?.join(', ') || 'None identified'}
**Requirements:** ${JSON.stringify(contextAnalysis.requirements || {}, null, 2)}
**Identified Constraints:** ${contextAnalysis.constraints?.join(', ') || 'None identified'}

## Instructions:
Generate key constraints and assumptions that will guide and limit this product or feature development.

**Structure:**
1. **Constraints** (2-6 items): Hard limitations that cannot be changed
2. **Assumptions** (2-5 items): Things we believe to be true but haven't verified

**Constraint Categories to Consider:**
- **Technical**: Platform limitations, integration requirements, performance needs
- **Business**: Budget limits, timeline restrictions, resource availability  
- **Legal/Regulatory**: Compliance requirements, data privacy laws
- **User**: Accessibility needs, device limitations, skill level assumptions

**Assumption Categories to Consider:**
- **User Behavior**: How users will interact with the product
- **Market Conditions**: Competitive landscape, demand levels
- **Technical**: Infrastructure capabilities, third-party service availability
- **Business**: Organizational support, resource allocation

**Guidelines:**
- Be specific and actionable (avoid vague statements)
- Include both limitations identified from analysis and logical business constraints
- Assumptions should be testable/validatable
- Focus on constraints that meaningfully impact product decisions
- Consider dependencies on external systems, teams, or vendors

**Example Constraints:**
- "Must integrate with existing Salesforce CRM without requiring admin-level permissions"
- "Total development budget cannot exceed $500K for initial release"
- "Must comply with GDPR and SOC 2 Type II requirements"

**Example Assumptions:**
- "Users are familiar with standard project management terminology and workflows"
- "Third-party API services will maintain 99.9% uptime during business hours"
- "Marketing team will provide user onboarding content within 2 weeks of feature launch"

Generate practical constraints and assumptions that will inform realistic project planning.`

  // Add existing PRD context if available
  if (input.context?.existingPRD) {
    prompt += `\n\n## Existing PRD Context:
${JSON.stringify(input.context.existingPRD, null, 2)}

Ensure constraints and assumptions are consistent with the solution approach and success metrics defined in the existing PRD.`
  }

  return prompt
}