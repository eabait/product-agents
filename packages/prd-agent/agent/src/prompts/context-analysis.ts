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
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        return priorityOrder[b.priority] - priorityOrder[a.priority]
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
        const priorityOrder = { high: 3, medium: 2, low: 1 }
        return priorityOrder[b.priority] - priorityOrder[a.priority]
      })
    
    if (requirements.length > 0) {
      prompt += '\nBusiness Requirements:\n'
      requirements.forEach((item: any) => {
        prompt += `- ${item.title}: ${item.content}\n`
      })
    }
  }
  
  prompt += '\n\nPlease analyze and extract themes, requirements (functional, technical, user_experience), and constraints from both the message and the provided context.'
  
  return prompt
}