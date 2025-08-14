/**
 * Change Worker Prompts
 * 
 * Prompts for editing existing PRDs by generating JSON patches
 * that describe specific changes to make.
 */

export function createChangeWorkerPrompt(existingPRD: any, message: string): string {
  return `You are editing an existing Product Requirements Document. 
               Return ONLY a JSON patch object that describes the changes to make.
               
               Existing PRD:
               ${JSON.stringify(existingPRD, null, 2)}
               
               User change request:
               "${message}"
               
               Return a JSON object with this exact structure:
               {
                 "mode": "patch",
                 "patch": {
                   // ONLY include fields that need to change
                   // Do NOT include fields that should remain unchanged
                   // Provide the complete new value for each field that changes
                 }
               }
               
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
               - Example: If only constraints change, return {"mode":"patch","patch":{"constraints":["new constraint"]}}`
}