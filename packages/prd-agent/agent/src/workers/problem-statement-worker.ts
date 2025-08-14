import { OpenRouterClient } from '@product-agents/openrouter-client'
import { WorkerAgent, WorkerResult } from '@product-agents/agent-core'
import { createProblemStatementPrompt } from '../prompts'

export class ProblemStatementWorker extends WorkerAgent {
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
    const requirements = context?.get('requirementsExtraction')?.data

    const statement = await this.client.generateText({
      model: this.settings.model,
      prompt: createProblemStatementPrompt(input.message, contextAnalysis, requirements),
      temperature: this.settings.temperature
    })

    return {
      name: 'problemStatement',
      data: statement,
      confidence: 0.9
    }
  }
}