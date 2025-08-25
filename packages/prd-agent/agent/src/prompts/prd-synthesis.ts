/**
 * PRD Synthesis Worker Prompts
 * 
 * Prompts for synthesizing complete Product Requirements Documents
 * from all worker analysis results.
 */

export function createPRDSynthesisPrompt(allResults: Record<string, any>, contextPayload?: any): string {
  let prompt = `Synthesize a complete Product Requirements Document from this analysis:
${JSON.stringify(allResults)}`

  // Add context payload requirements and constraints
  if (contextPayload?.categorizedContext?.length > 0) {
    prompt += '\n\nAdditional Context to Incorporate:\n'
    
    // Group by category for better organization
    const contextByCategory = contextPayload.categorizedContext
      .filter((item: any) => item.isActive)
      .reduce((acc: any, item: any) => {
        if (!acc[item.category]) acc[item.category] = []
        acc[item.category].push(item)
        return acc
      }, {})
    
    Object.entries(contextByCategory).forEach(([category, items]: [string, any]) => {
      // Sort by priority within each category
      const sortedItems = (items as any[]).sort((a: any, b: any) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      })
      
      const categoryLabels = {
        constraint: 'Technical Constraints',
        requirement: 'Business Requirements', 
        assumption: 'Business Assumptions',
        stakeholder: 'Stakeholder Needs',
        custom: 'Additional Context'
      }
      
      prompt += `\n${categoryLabels[category as keyof typeof categoryLabels] || category}:\n`
      sortedItems.forEach((item: any) => {
        prompt += `- ${item.title}: ${item.content}\n`
      })
    })
  }

  prompt += `

Create a comprehensive PRD that fully incorporates the analysis results AND the additional context above:
- Clear problem statement
- Solution overview (must reflect technical constraints like architecture patterns and platforms)
- Target users (be specific about user personas)
- Goals (business and user goals)
- Success metrics (measurable KPIs with targets and timelines)
- Constraints (incorporate all technical constraints from context - architecture, platforms, compliance requirements)
- Assumptions (key assumptions being made)

CRITICAL: Ensure that all context items (especially technical constraints and business requirements) are explicitly reflected in the appropriate sections of the PRD.`

  return prompt
}