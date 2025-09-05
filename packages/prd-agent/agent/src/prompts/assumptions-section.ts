/**
 * Assumptions Section Writer Prompt
 * 
 * Generates comprehensive Assumptions & Dependencies section for PRDs
 */

import type { SectionWriterInput } from '../section-writers'

export function createAssumptionsSectionPrompt(
  input: SectionWriterInput,
  analysisResults: {
    contextAnalysis?: any
    riskAnalysis?: any
  }
): string {
  const { contextAnalysis, riskAnalysis } = analysisResults

  return `Generate a comprehensive Assumptions & Dependencies section for a PRD based on the following analysis:

User Input: "${input.message}"

Context Analysis:
- Themes: ${contextAnalysis?.themes?.join(', ') || 'None'}
- Constraints: ${contextAnalysis?.constraints?.join(', ') || 'None'}

Risk Analysis:
- Dependencies: ${riskAnalysis?.dependencies?.map((d: any) => `${d.dependency} (${d.type})`).join(', ') || 'None'}
- Business Risks: ${riskAnalysis?.business_risks?.map((r: any) => r.risk).join(', ') || 'None'}
- Technical Risks: ${riskAnalysis?.technical_risks?.map((r: any) => r.risk).join(', ') || 'None'}

${input.context?.contextPayload ? `Additional Context: ${JSON.stringify(input.context.contextPayload)}` : ''}

Generate an assumptions & dependencies section with:

1. **Business Assumptions**:
   - Market conditions, user behavior, business model assumptions
   - Each with rationale for why we believe this assumption
   - Risk level if assumption proves incorrect
   - Validation method, timeline, and success criteria

2. **Technical Assumptions**:
   - Technology capabilities, performance, integration assumptions
   - Architecture and implementation assumptions
   - Risk assessment and validation approach

3. **User Assumptions**:
   - User needs, behaviors, preferences, and capabilities
   - Usage patterns and adoption assumptions
   - Methods to validate user assumptions

4. **Dependencies**:
   - Internal dependencies (other teams, systems, resources)
   - External dependencies (third parties, vendors, APIs)
   - Clear owner, timeline, and risk assessment
   - Mitigation strategies for each dependency

5. **Constraints**:
   - Technical, business, regulatory, timeline, and resource constraints
   - Impact on the project and potential workarounds
   - Difference between assumptions (beliefs) and constraints (facts)

Each assumption should include:
- Clear statement of what we're assuming
- Evidence or rationale supporting the assumption
- Risk level (high assumptions could sink the project)
- Specific validation method with timeline
- Success criteria to validate or invalidate

Each dependency should include:
- What we depend on and who owns it
- Timeline and criticality
- Risk if dependency fails
- Mitigation or contingency plans

Generate realistic, specific assumptions and dependencies that teams can act upon.

**IMPORTANT OUTPUT FORMAT:**
- Return ONLY valid JSON in the exact schema format
- Do NOT include any XML tags, parameter names, or formatting instructions
- Do NOT include any text before or after the JSON object
- ALL array fields must be proper JSON arrays, not JSON strings
- Ensure all enum values match exactly: 'low', 'medium', 'high' for risk/criticality levels
- Use proper boolean values (true/false) not strings`
}