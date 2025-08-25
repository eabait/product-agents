import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { WorkerAgent, WorkerResult } from '@product-agents/agent-core'
import { createSolutionFrameworkPrompt } from '../prompts'

export class SolutionFrameworkWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any, context?: Map<string, any>): Promise<WorkerResult> {
    const problemStatement = context?.get('problemStatement')?.data

    const frameworkRaw = await this.client.generateStructured({
      model: this.settings.model,
      schema: z.object({
        approach: z.string().optional(),
        components: z.array(z.string()).optional(),
        technologies: z.array(z.string()).optional()
      }),
      prompt: createSolutionFrameworkPrompt(problemStatement, input.context?.contextPayload),
      temperature: this.settings.temperature
    })

    // Normalize so downstream workers always receive the same shape
    const framework = {
      approach: (frameworkRaw as any).approach || '',
      components: (frameworkRaw as any).components || [],
      technologies: (frameworkRaw as any).technologies || []
    }

    return {
      name: 'solutionFramework',
      data: framework,
      confidence: 0.85
    }
  }
}