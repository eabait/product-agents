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
    try {
      return await this.client.generateStructured({
        model: this.settings.model,
        schema: params.schema,
        prompt: params.prompt,
        temperature: params.temperature || this.settings.temperature,
        arrayFields: params.arrayFields
      })
    } catch (error: any) {
      const fallbackModel = this.settings.advanced?.fallbackModel
      if (fallbackModel && fallbackModel !== this.settings.model && this.isModelNotFoundError(error)) {
        console.warn(`Model ${this.settings.model} unavailable for analyzer, falling back to ${fallbackModel}`)
        return this.client.generateStructured({
          model: fallbackModel,
          schema: params.schema,
          prompt: params.prompt,
          temperature: params.temperature || this.settings.temperature,
          arrayFields: params.arrayFields
        })
      }

      throw error
    }
  }

  protected async generateText(params: {
    prompt: string
    temperature?: number
    maxTokens?: number
  }): Promise<string> {
    return this.client.generateText({
      model: this.settings.model,
      prompt: params.prompt,
      temperature: params.temperature || this.settings.temperature,
      maxTokens: params.maxTokens
    })
  }

  protected composeMetadata(baseMetadata?: Record<string, any>): Record<string, any> | undefined {
    const usage = this.client.getLastUsage()
    if (!usage) {
      return baseMetadata
    }

    const existingUsage =
      baseMetadata && typeof baseMetadata.usage === 'object'
        ? baseMetadata.usage
        : undefined

    return {
      ...(baseMetadata || {}),
      usage: {
        ...(existingUsage || {}),
        ...usage
      }
    }
  }

  private isModelNotFoundError(error: any): boolean {
    if (!error) return false
    const statusCode = error.statusCode || error.response?.status
    if (statusCode !== 404) {
      return false
    }
    const message = typeof error.message === 'string' ? error.message : ''
    const body = typeof error.responseBody === 'string' ? error.responseBody : ''
    return message.includes('No endpoints found') || body.includes('No endpoints found')
  }
}
