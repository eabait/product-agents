import { OpenRouterClient } from '@product-agents/openrouter-client'
import { WorkerAgent, WorkerResult } from '@product-agents/agent-core'
import { PRDSchema } from '../schemas'

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
      prompt: `Synthesize a complete Product Requirements Document from this analysis:
               ${JSON.stringify(allResults)}
               
               Create a comprehensive PRD with:
               - Clear problem statement
               - Solution overview
               - Target users (be specific about user personas)
               - Goals (business and user goals)
               - Success metrics (measurable KPIs with targets and timelines)
               - Constraints (technical, business, regulatory)
               - Assumptions (key assumptions being made)`,
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