/**
 * Mock OpenRouter Client for Testing
 * 
 * Provides controllable responses for testing agent flows
 * and tracing prompts without making actual API calls.
 */

import { z } from 'zod'
import { GenerationUsage } from '@product-agents/agent-core'

export interface MockResponse {
  workerName: string
  prompt: string
  schema?: any
  response: any
}

export interface PromptTrace {
  timestamp: number
  workerName: string
  prompt: string
  schema?: string
  response: any
  settings: any
}

export class MockOpenRouterClient {
  private responses: Map<string, any> = new Map()
  public traces: PromptTrace[] = []
  private usageOverrides: Map<string, GenerationUsage> = new Map()
  private lastUsage?: GenerationUsage

  constructor(private apiKey?: string) {}

  // Set mock responses for specific workers
  setMockResponse(workerName: string, response: any) {
    this.responses.set(workerName, response)
  }

  // Set multiple mock responses at once
  setMockResponses(responses: Record<string, any>) {
    Object.entries(responses).forEach(([workerName, response]) => {
      this.responses.set(workerName, response)
    })
  }

  setMockUsage(workerName: string, usage: GenerationUsage) {
    this.usageOverrides.set(workerName, usage)
  }

  getLastUsage(): GenerationUsage | undefined {
    return this.lastUsage ? { ...this.lastUsage } : undefined
  }

  async generateStructured<T>(params: {
    model: string
    schema: z.ZodSchema<T>
    prompt: string
    temperature?: number
    maxTokens?: number
  }): Promise<T> {
    // Determine worker name from prompt patterns
    const workerName = this.determineWorkerFromPrompt(params.prompt)
    this.lastUsage = undefined
    
    // Record the trace
    this.traces.push({
      timestamp: Date.now(),
      workerName,
      prompt: params.prompt,
      schema: params.schema.description || 'ZodSchema',
      response: this.responses.get(workerName) || {},
      settings: {
        model: params.model,
        temperature: params.temperature,
        maxTokens: params.maxTokens
      }
    })

    // Return mock response
    const mockResponse = this.responses.get(workerName)
    if (!mockResponse) {
      throw new Error(`No mock response set for worker: ${workerName}`)
    }

    // Validate against schema
    const validated = params.schema.safeParse(mockResponse)
    if (!validated.success) {
      throw new Error(`Mock response doesn't match schema for ${workerName}: ${validated.error.message}`)
    }

    this.recordUsage(workerName, params.model)
    return validated.data
  }

  async generateText(params: {
    model: string
    prompt: string
    temperature?: number
    maxTokens?: number
  }): Promise<string> {
    // Determine worker name from prompt patterns
    const workerName = this.determineWorkerFromPrompt(params.prompt)
    this.lastUsage = undefined
    
    // Record the trace
    this.traces.push({
      timestamp: Date.now(),
      workerName,
      prompt: params.prompt,
      response: this.responses.get(workerName) || '',
      settings: {
        model: params.model,
        temperature: params.temperature,
        maxTokens: params.maxTokens
      }
    })

    // Return mock response
    const mockResponse = this.responses.get(workerName)
    if (!mockResponse) {
      throw new Error(`No mock response set for worker: ${workerName}`)
    }

    if (typeof mockResponse !== 'string') {
      throw new Error(`Text generation requires string response for ${workerName}`)
    }

    this.recordUsage(workerName, params.model)
    return mockResponse
  }

  private determineWorkerFromPrompt(prompt: string): string {
    // Legacy analyzer patterns (still used)
    if (prompt.includes('Analyze this product request for PRD generation completeness') ||
        prompt.includes('You evaluate whether the following product request has enough detail')) {
      return 'clarification'
    }
    if (prompt.includes('Analyze this product request and extract key themes') || 
        prompt.includes('Analyze and extract:') ||
        prompt.includes('You analyze the product request and extract planning signals')) {
      return 'contextAnalysis'
    }
    if (prompt.includes('You are analyzing a PRD edit request to determine which sections need to be updated') ||
        prompt.includes('You review an edit request and decide which PRD sections require updates.')) {
      return 'sectionDetection'
    }
    
    // New simplified section writer patterns
    if (prompt.includes('creating a concise Target Users section') ||
        prompt.includes('Generate 2-4 specific target user personas') ||
        prompt.includes('You are a product manager updating the Target Users section')) {
      return 'targetUsers'
    }
    if (prompt.includes('creating a Solution Overview section') ||
        prompt.includes('explains WHAT we\'re building and HOW') ||
        prompt.includes('You are a product manager drafting the Solution Overview section')) {
      return 'solution'
    }
    if (prompt.includes('creating a Key Features section') ||
        prompt.includes('Generate 3-7 key features') ||
        prompt.includes('You are a product manager updating the Key Features section')) {
      return 'keyFeatures'
    }
    if (prompt.includes('creating a Success Metrics section') ||
        prompt.includes('Generate 2-4 key success metrics') ||
        prompt.includes('Provide 3-6 outcome metrics') ||
        prompt.includes('You are a product manager updating the Success Metrics section')) {
      return 'successMetrics'
    }
    if (prompt.includes('creating a Constraints section') ||
        prompt.includes('Generate key constraints and assumptions') ||
        prompt.includes('You are a product manager refining the Constraints section')) {
      return 'constraints'
    }
    
    // Legacy patterns for backward compatibility
    if (prompt.includes('Extract functional and non-functional requirements')) {
      return 'requirementsExtraction'
    }
    if (prompt.includes('Create a clear, concise problem statement')) {
      return 'problemStatement'
    }
    if (prompt.includes('Design a minimal, PRD-friendly solution framework')) {
      return 'solutionFramework'
    }
    if (prompt.includes('Synthesize a complete Product Requirements Document')) {
      return 'prdSynthesis'
    }
    if (prompt.includes('You are editing an existing Product Requirements Document')) {
      return 'changeWorker'
    }
    return 'unknown'
  }

  // Helper method to clear traces
  clearTraces() {
    this.traces = []
  }

  // Helper method to get traces for a specific worker
  getTracesForWorker(workerName: string): PromptTrace[] {
    return this.traces.filter(trace => trace.workerName === workerName)
  }

  // Helper method to print trace summary
  printTraceSummary(): void {
    console.log('\n=== PROMPT TRACE SUMMARY ===')
    this.traces.forEach((trace, index) => {
      console.log(`\n${index + 1}. ${trace.workerName.toUpperCase()} (${new Date(trace.timestamp).toISOString()})`)
      console.log(`   Model: ${trace.settings.model}`)
      console.log(`   Temperature: ${trace.settings.temperature}`)
      console.log(`   Prompt Preview: "${trace.prompt.substring(0, 100)}..."`)
      console.log(`   Response Type: ${typeof trace.response}`)
    })
    console.log(`\nTotal traces: ${this.traces.length}`)
  }

  private recordUsage(workerName: string, model: string) {
    const override = this.usageOverrides.get(workerName)

    const hasPromptTokens = override ? Object.prototype.hasOwnProperty.call(override, 'promptTokens') : false
    const promptTokens = override
      ? (hasPromptTokens ? override.promptTokens : undefined)
      : 10

    const hasCompletionTokens = override ? Object.prototype.hasOwnProperty.call(override, 'completionTokens') : false
    const completionTokens = override
      ? (hasCompletionTokens ? override.completionTokens : undefined)
      : 20

    const hasTotalTokens = override ? Object.prototype.hasOwnProperty.call(override, 'totalTokens') : false
    const totalTokens =
      override && hasTotalTokens
        ? override.totalTokens
        : (promptTokens !== undefined || completionTokens !== undefined
            ? (promptTokens ?? 0) + (completionTokens ?? 0)
            : undefined)

    const hasPromptCost = override ? Object.prototype.hasOwnProperty.call(override, 'promptCost') : false
    const promptCost = override
      ? (hasPromptCost ? override.promptCost : undefined)
      : undefined

    const hasCompletionCost = override ? Object.prototype.hasOwnProperty.call(override, 'completionCost') : false
    const completionCost = override
      ? (hasCompletionCost ? override.completionCost : undefined)
      : undefined

    const hasTotalCost = override ? Object.prototype.hasOwnProperty.call(override, 'totalCost') : false
    const totalCost =
      override && hasTotalCost
        ? override.totalCost
        : (promptCost !== undefined || completionCost !== undefined
            ? (promptCost ?? 0) + (completionCost ?? 0)
            : undefined)

    this.lastUsage = {
      model: (override && Object.prototype.hasOwnProperty.call(override, 'model') ? override.model : undefined) || model,
      provider: override && Object.prototype.hasOwnProperty.call(override, 'provider') ? override.provider : undefined,
      promptTokens,
      completionTokens,
      totalTokens,
      promptCost,
      completionCost,
      totalCost,
      currency: override && Object.prototype.hasOwnProperty.call(override, 'currency') ? override.currency : undefined,
      rawUsage: override?.rawUsage
    }
  }
}
