import { OpenRouterClient } from '@product-agents/openrouter-client'
import { WorkerAgent, WorkerResult } from '@product-agents/agent-core'
import { PRDPatchSchema, PRDPatch } from '../schemas'
import { cleanPatchResponse } from '../utils'

export class ChangeWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any, context?: Map<string, any>): Promise<WorkerResult> {
    const { message, existingPRD } = input
    
    if (!existingPRD) {
      throw new Error('ChangeWorker requires an existing PRD to edit')
    }

    // Generate a patch for the PRD
    const rawPatchResponse = await this.client.generateStructured({
      model: this.settings.model,
      schema: PRDPatchSchema,
      prompt: `You are editing an existing Product Requirements Document. 
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
               - Example: If only constraints change, return {"mode":"patch","patch":{"constraints":["new constraint"]}}`,
      temperature: this.settings.temperature || 0.2, // Use settings temperature (fixed for consistency)
      maxTokens: this.settings.maxTokens || 2000
    })

    // Clean the patch response by removing null values to avoid schema issues
    const cleanPatch = cleanPatchResponse(rawPatchResponse as PRDPatch)

    return {
      name: 'prdPatch',
      data: cleanPatch,
      confidence: 0.95
    }
  }
}