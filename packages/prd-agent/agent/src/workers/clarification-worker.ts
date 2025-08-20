import { OpenRouterClient } from '@product-agents/openrouter-client'
import { WorkerAgent, WorkerResult } from '@product-agents/agent-core'
import { createClarificationPrompt } from '../prompts'
import { ClarificationResultSchema, ClarificationResult } from '../schemas'

export class ClarificationWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any): Promise<WorkerResult> {
    const clarificationResult = await this.client.generateStructured({
      model: this.settings.model,
      schema: ClarificationResultSchema,
      prompt: createClarificationPrompt(input.message),
      temperature: this.settings.temperature
    })

    const result = clarificationResult as ClarificationResult

    // Enhanced confidence scoring based on the AI's own confidence assessment
    // and the presence of critical gaps
    let workerConfidence = result.confidence / 100 // Convert 0-100 to 0-1

    // Adjust confidence based on critical gaps
    if (result.missingCritical.length > 0) {
      workerConfidence = Math.min(workerConfidence, 0.4) // Cap at 0.4 if critical gaps exist
    }

    // If clarification is not needed but confidence is low, flag for review
    if (!result.needsClarification && result.confidence < 70) {
      console.warn(`ClarificationWorker: Proceeding with low confidence (${result.confidence}%) for message: "${input.message}"`)
    }

    return {
      name: 'clarification',
      data: result,
      confidence: workerConfidence
    }
  }
}