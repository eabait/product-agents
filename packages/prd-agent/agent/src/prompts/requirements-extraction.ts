/**
 * Requirements Extraction Worker Prompts
 * 
 * Prompts for extracting functional and non-functional requirements
 * from user requests and context analysis.
 */

export function createRequirementsExtractionPrompt(
  message: string, 
  contextAnalysis: any,
  contextPayload?: any
): string {
  let prompt = `Extract functional and non-functional requirements from:
Original request: ${message}
Context analysis: ${JSON.stringify(contextAnalysis)}`
  
  // Add specific requirements from context payload
  if (contextPayload?.categorizedContext?.length > 0) {
    const requirements = contextPayload.categorizedContext
      .filter((item: any) => item.category === 'requirement' && item.isActive)
      .sort((a: any, b: any) => {
        const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 }
        return (priorityOrder[b.priority] || 1) - (priorityOrder[a.priority] || 1)
      })
    
    if (requirements.length > 0) {
      prompt += '\n\nAdditional Business Requirements:\n'
      requirements.forEach((item: any) => {
        prompt += `- ${item.title}: ${item.content}\n`
      })
    }
  }
  
  prompt += '\n\nPlease extract comprehensive functional and non-functional requirements, incorporating both the context analysis and any additional requirements provided.'
  
  return prompt
}