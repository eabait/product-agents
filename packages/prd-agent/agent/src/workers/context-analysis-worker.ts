import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { WorkerAgent, WorkerResult } from '@product-agents/agent-core'

export class ContextAnalysisWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any): Promise<WorkerResult> {
    const analysisRaw = await this.client.generateStructured({
      model: this.settings.model,
      schema: z.object({
        themes: z.array(z.string()).optional(),
        requirements: z.object({
          functional: z.array(z.string()).optional(),
          technical: z.array(z.string()).optional(),
          user_experience: z.array(z.string()).optional()
        }).optional(),
        functional: z.array(z.string()).optional(),
        technical: z.array(z.string()).optional(),
        user_experience: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional()
      }),
      prompt: `Analyze this product request and extract key themes, requirements, and constraints: ${input.message}`,
      temperature: this.settings.temperature
    })

    // Normalize the response so downstream workers always see the same shape
    const normalized = {
      themes: (analysisRaw as any).themes || [],
      requirements: (analysisRaw as any).requirements ? (analysisRaw as any).requirements : {
        functional: (analysisRaw as any).functional || [],
        technical: (analysisRaw as any).technical || [],
        user_experience: (analysisRaw as any).user_experience || []
      },
      constraints: (analysisRaw as any).constraints || []
    }

    return {
      name: 'contextAnalysis',
      data: normalized,
      confidence: 0.85
    }
  }
}