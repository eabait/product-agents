import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { WorkerAgent, WorkerResult } from '@product-agents/agent-core'

export class RequirementsExtractionWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any, context?: Map<string, any>): Promise<WorkerResult> {
    const contextAnalysis = context?.get('contextAnalysis')?.data
    
    const requirements = await this.client.generateStructured({
      model: this.settings.model,
      schema: z.object({
        functional: z.array(z.string()),
        nonFunctional: z.array(z.string())
      }),
      prompt: `Extract functional and non-functional requirements from:
               Original request: ${input.message}
               Context analysis: ${JSON.stringify(contextAnalysis)}`,
      temperature: this.settings.temperature
    })

    return {
      name: 'requirementsExtraction',
      data: requirements,
      confidence: 0.8
    }
  }
}