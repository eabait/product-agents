import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateObject, generateText, streamText } from 'ai'
import { z } from 'zod'

export class OpenRouterClient {
  private provider: any
  
  constructor(apiKey?: string) {
    this.provider = createOpenRouter({
      apiKey: apiKey || process.env.OPENROUTER_API_KEY || '',
      baseURL: 'https://openrouter.ai/api/v1'
    })
  }
  
  getModel(modelName: string = 'anthropic/claude-3-5-sonnet') {
    return this.provider(modelName)
  }
  
  async generateStructured<T>(params: {
    model: string
    schema: z.ZodSchema<T>
    prompt: string
    temperature?: number
    maxTokens?: number
  }): Promise<T> {
    const { object } = await generateObject({
      model: this.getModel(params.model),
      schema: params.schema,
      prompt: params.prompt,
      temperature: params.temperature || 0.3,
      maxTokens: params.maxTokens || 4000
    })
    
    return object
  }
  
  async generateText(params: {
    model: string
    prompt: string
    temperature?: number
    maxTokens?: number
  }): Promise<string> {
    const { text } = await generateText({
      model: this.getModel(params.model),
      prompt: params.prompt,
      temperature: params.temperature || 0.7,
      maxTokens: params.maxTokens || 2000
    })
    
    return text
  }
  
  async *streamText(params: {
    model: string
    prompt: string
    temperature?: number
  }) {
    const { textStream } = await streamText({
      model: this.getModel(params.model),
      prompt: params.prompt,
      temperature: params.temperature || 0.7
    })
    
    for await (const chunk of textStream) {
      yield chunk
    }
  }
}

export * from 'zod'
