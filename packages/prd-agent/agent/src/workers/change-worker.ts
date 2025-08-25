import { OpenRouterClient } from '@product-agents/openrouter-client'
import { WorkerAgent, WorkerResult } from '@product-agents/agent-core'
import { PRDPatchSchema, PRDPatch } from '../schemas'
import { cleanPatchResponse } from '../utils'
import { createChangeWorkerPrompt } from '../prompts'

export class ChangeWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any, _context?: Map<string, any>): Promise<WorkerResult> {
    const { message, existingPRD } = input
    
    if (!existingPRD) {
      throw new Error('ChangeWorker requires an existing PRD to edit')
    }

    // Generate a patch for the PRD, including context payload
    const rawPatchResponse = await this.client.generateStructured({
      model: this.settings.model,
      schema: PRDPatchSchema,
      prompt: createChangeWorkerPrompt(existingPRD, message, input.contextPayload),
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