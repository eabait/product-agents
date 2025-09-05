/**
 * Risk Identifier Prompt
 * 
 * Analyzes product requirements for potential risks, dependencies, gaps, and conflicts
 */

export function createRiskAnalysisPrompt(message: string, context: any): string {
  return `Analyze the following product requirements for potential risks, dependencies, gaps, and conflicts:

User Input: "${message}"

${context.contextAnalysis ? `Context Analysis:
- Themes: ${context.contextAnalysis.themes?.join(', ') || 'None'}
- Functional Requirements: ${context.contextAnalysis.requirements?.functional?.join(', ') || 'None'}
- Technical Requirements: ${context.contextAnalysis.requirements?.technical?.join(', ') || 'None'}
- Constraints: ${context.contextAnalysis.constraints?.join(', ') || 'None'}` : ''}

${context.requirementsAnalysis ? `Requirements Analysis:
- Functional: ${context.requirementsAnalysis.functional?.join(', ') || 'None'}
- Non-Functional: ${context.requirementsAnalysis.nonFunctional?.join(', ') || 'None'}` : ''}

${context.existingPRD ? `Existing PRD Context: ${JSON.stringify(context.existingPRD, null, 2)}` : ''}

Identify:
1. Technical risks that could impact implementation
2. Business risks that could affect success
3. Dependencies (internal/external) that must be managed
4. Gaps in requirements or information
5. Conflicts between requirements or constraints

For each risk, assess impact and likelihood (low/medium/high) and suggest mitigations.
For dependencies, indicate type and criticality.
For gaps, categorize and assess severity.
For conflicts, identify the conflicting items and suggest resolutions.`
}