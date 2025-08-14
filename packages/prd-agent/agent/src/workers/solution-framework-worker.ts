import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { WorkerAgent, WorkerResult } from '@product-agents/agent-core'

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
      prompt: `Design a minimal, PRD-friendly solution framework for this problem:
               Problem: ${problemStatement}
               
               You are producing content for a Product Requirements Document — be concise and return only the JSON object requested (no explanation text).
               Return exactly this structure and keep values short (one line strings or short arrays):
               {
                 "approach": "One-sentence overview",
                 "components": ["UI", "API", "Database"],
                 "technologies": ["React", "Postgres"]
               }
               
               Prefer human-readable strings/arrays. If you must return objects, keep values short and suitable for insertion into a PRD.`,
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