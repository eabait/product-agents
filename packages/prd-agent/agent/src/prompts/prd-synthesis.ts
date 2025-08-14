/**
 * PRD Synthesis Worker Prompts
 * 
 * Prompts for synthesizing complete Product Requirements Documents
 * from all worker analysis results.
 */

export function createPRDSynthesisPrompt(allResults: Record<string, any>): string {
  return `Synthesize a complete Product Requirements Document from this analysis:
               ${JSON.stringify(allResults)}
               
               Create a comprehensive PRD with:
               - Clear problem statement
               - Solution overview
               - Target users (be specific about user personas)
               - Goals (business and user goals)
               - Success metrics (measurable KPIs with targets and timelines)
               - Constraints (technical, business, regulatory)
               - Assumptions (key assumptions being made)`
}