/**
 * Mock OpenRouter Client for Testing
 * 
 * Provides controllable responses for testing agent flows
 * and tracing prompts without making actual API calls.
 */

import { z } from 'zod'

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

  async generateStructured<T>(params: {
    model: string
    schema: z.ZodSchema<T>
    prompt: string
    temperature?: number
    maxTokens?: number
  }): Promise<T> {
    // Determine worker name from prompt patterns
    const workerName = this.determineWorkerFromPrompt(params.prompt)
    
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

    return mockResponse
  }

  private determineWorkerFromPrompt(prompt: string): string {
    // Legacy analyzer patterns (still used)
    if (prompt.includes('Analyze this product request for PRD generation completeness')) {
      return 'clarification'
    }
    if (prompt.includes('Analyze this product request and extract key themes') || 
        prompt.includes('Analyze and extract:')) {
      return 'contextAnalysis'
    }
    if (prompt.includes('You are analyzing a PRD edit request to determine which sections need to be updated')) {
      return 'sectionDetection'
    }
    
    // New simplified section writer patterns
    if (prompt.includes('creating a concise Target Users section') ||
        prompt.includes('Generate 2-4 specific target user personas')) {
      return 'targetUsers'
    }
    if (prompt.includes('creating a Solution Overview section') ||
        prompt.includes('explains WHAT we\'re building and HOW')) {
      return 'solution'
    }
    if (prompt.includes('creating a Key Features section') ||
        prompt.includes('Generate 3-7 key features')) {
      return 'keyFeatures'
    }
    if (prompt.includes('creating a Success Metrics section') ||
        prompt.includes('Generate 2-4 key success metrics')) {
      return 'successMetrics'
    }
    if (prompt.includes('creating a Constraints section') ||
        prompt.includes('Generate key constraints and assumptions')) {
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
}