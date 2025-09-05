/**
 * Context Analysis Worker Prompts
 * 
 * Prompts for analyzing product requests and extracting key themes,
 * requirements, and constraints.
 */

export function createContextAnalysisPrompt(message: string, contextPayload?: any): string {
  let prompt = `Analyze this product request and extract key themes, requirements, and constraints:\n\n${message}`
  
  // Add context from categorized context items if available
  if (contextPayload?.categorizedContext?.length > 0) {
    prompt += '\n\nAdditional Context:\n'
    
    // Process constraints (high priority first)
    const constraints = contextPayload.categorizedContext
      .filter((item: any) => item.category === 'constraint' && item.isActive)
      .sort((a: any, b: any) => {
        const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 }
        return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1)
      })
    
    if (constraints.length > 0) {
      prompt += '\nTechnical Constraints:\n'
      constraints.forEach((item: any) => {
        prompt += `- ${item.title}: ${item.content}\n`
      })
    }
    
    // Process requirements
    const requirements = contextPayload.categorizedContext
      .filter((item: any) => item.category === 'requirement' && item.isActive)
      .sort((a: any, b: any) => {
        const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 }
        return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1)
      })
    
    if (requirements.length > 0) {
      prompt += '\nBusiness Requirements:\n'
      requirements.forEach((item: any) => {
        prompt += `- ${item.title}: ${item.content}\n`
      })
    }
  }
  
  prompt += `\n\nAnalyze and extract:

1. **Themes**: Key product themes and focus areas
2. **Requirements**: Core requirements including:
   - Functional requirements (what the system should do)
   - Technical requirements (performance, platform, integration needs)
   - User experience requirements (usability, accessibility)
   - Epic user stories (3-8 high-level user stories)
   - MVP features (essential features for validation)
3. **Constraints**: Technical, business, timeline, and resource constraints

**Epic Story Guidelines:**
- Title: Concise epic name (under 100 characters)
- Description: 1-2 sentences describing user goal and value

Generate a focused analysis that captures core product requirements.`
  
  return prompt
}