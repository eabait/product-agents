import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { AgentSettings } from '@product-agents/agent-core'
import { ConfidenceAssessment } from '../schemas'

export interface AnalyzerResult<T = any> {
  name: string
  data: T
  confidence?: ConfidenceAssessment
  metadata?: Record<string, any>
}

export interface AnalyzerInput {
  message: string
  context?: {
    contextPayload?: any
    existingPRD?: any
    previousResults?: Map<string, any>
  }
}

export abstract class BaseAnalyzer {
  protected client: OpenRouterClient
  protected settings: AgentSettings

  constructor(settings: AgentSettings) {
    this.settings = settings
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  abstract analyze(input: AnalyzerInput): Promise<AnalyzerResult>

  protected async generateStructured<T>(params: {
    schema: z.ZodSchema<T>
    prompt: string
    temperature?: number
    arrayFields?: string[]
  }): Promise<T> {
    return this.client.generateStructured({
      model: this.settings.model,
      schema: params.schema,
      prompt: params.prompt,
      temperature: params.temperature || this.settings.temperature,
      arrayFields: params.arrayFields
    })
  }

  protected async generateText(params: {
    prompt: string
    temperature?: number
  }): Promise<string> {
    return this.client.generateText({
      model: this.settings.model,
      prompt: params.prompt,
      temperature: params.temperature || this.settings.temperature
    })
  }
}