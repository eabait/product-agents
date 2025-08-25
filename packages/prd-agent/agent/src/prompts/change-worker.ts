/**
 * Change Worker Prompts
 * 
 * Prompts for editing existing PRDs by generating JSON patches
 * that describe specific changes to make.
 */

type ContextItem = {
  title: string;
  content: string;
  priority: 'high'|'medium'|'low';
  category: string;
  isActive: boolean;
};

export function createChangeWorkerPrompt(existingPRD: any, message: string, contextPayload?: any): string {
  let prompt = `You are editing an existing Product Requirements Document. 
Return ONLY a JSON patch object that describes the changes to make.

Existing PRD:
${JSON.stringify(existingPRD, null, 2)}

User change request:
"${message}"`

  // Add context payload for comprehensive updates
  if (contextPayload?.categorizedContext?.length > 0) {
    prompt += '\n\nAdditional Context to Incorporate:\n'
    
      // Group by category for better organization
      const contextByCategory = contextPayload.categorizedContext
        .filter((item: ContextItem) => item.isActive)
        .reduce((acc: Record<string, ContextItem[]>, item: ContextItem) => {
          if (!acc[item.category]) acc[item.category] = []
          acc[item.category].push(item)
          return acc
        }, {})
    
      const entries = Object.entries(contextByCategory) as [string, ContextItem[]][];
      entries.forEach(([category, items]) => {
        // Sort by priority within each category
        const sortedItems = items.slice().sort((a: ContextItem, b: ContextItem) => {
          const priorityOrder = { high: 3, medium: 2, low: 1 } as const
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
        sortedItems.forEach((item: ContextItem) => {
          prompt += `- ${item.title}: ${item.content}\n`
        })
      })
  }

  prompt += `

Return a JSON object with this exact structure:
{
  "mode": "patch",
  "patch": {
    // ONLY include fields that need to change
    // Do NOT include fields that should remain unchanged  
    // Provide the complete new value for each field that changes
    // ENSURE all context items above are reflected in the appropriate sections
  }
}`

  prompt += `

Examples:
- To update problem statement: "problemStatement": "New problem statement text"
- To update goals: "goals": ["Updated goal 1", "Updated goal 2", "New goal 3"]  
- To update target users: "targetUsers": ["Updated user persona 1", "Updated user persona 2"]
- To update success metrics: "successMetrics": [{"metric": "Updated metric", "target": "New target", "timeline": "Updated timeline"}]
- To update constraints: "constraints": ["Updated constraint 1", "Updated constraint 2"]
- To update assumptions: "assumptions": ["Updated assumption 1", "Updated assumption 2"]

CRITICAL RULES: 
- Return ONLY the JSON patch object
- OMIT fields that don't need to change completely from the JSON
- NEVER use null values, undefined, or empty strings
- Do not use nested objects like {"replace": [...]} or {"add": [...]}
- Provide direct values: arrays for array fields, strings for string fields
- Do not include any explanation or the full PRD
- ENSURE that context items (especially technical constraints and business requirements) are incorporated into the appropriate PRD sections
- Example: If only constraints change, return {"mode":"patch","patch":{"constraints":["new constraint"]}}`

  return prompt
}
