import { OpenRouterClient } from '@product-agents/openrouter-client'
import { WorkerAgent, WorkerResult } from '@product-agents/agent-core'
import { PRDSchema } from '../schemas'
import { createPRDSynthesisPrompt } from '../prompts'

export class PRDSynthesisWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any, context?: Map<string, any>): Promise<WorkerResult> {
    const allResults = Object.fromEntries(context || new Map())

    const prd = await this.client.generateStructured({
      model: this.settings.model,
      schema: PRDSchema,
      prompt: createPRDSynthesisPrompt(allResults, input.context?.contextPayload),
      temperature: this.settings.temperature,
      maxTokens: this.settings.maxTokens
    })

    return {
      name: 'prdSynthesis',
      data: prd,
      confidence: 0.9
    }
  }
}