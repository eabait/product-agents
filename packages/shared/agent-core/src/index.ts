import { z } from 'zod'

export interface AgentSettings {
  model: string
  temperature: number
  maxTokens: number
  apiKey?: string
  advanced?: Record<string, any>
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  metadata?: {
    model?: string
    tokens?: number
    duration?: number
    confidence?: number
  }
}

export abstract class BaseAgent {
  protected settings: AgentSettings
  
  constructor(settings: Partial<AgentSettings> = {}) {
    this.settings = {
      model: 'anthropic/claude-3-5-sonnet',
      temperature: 0.7,
      maxTokens: 2000,
      ...settings
    }
  }
  
  abstract chat(message: string, context?: any): Promise<any>
  
  updateSettings(newSettings: Partial<AgentSettings>) {
    this.settings = { ...this.settings, ...newSettings }
  }
  
  getSettings(): AgentSettings {
    return { ...this.settings }
  }
}

export interface WorkerResult {
  name: string
  data: any
  confidence?: number
  metadata?: Record<string, any>
}

export abstract class WorkerAgent extends BaseAgent {
  abstract execute(input: any, context?: Map<string, any>): Promise<WorkerResult>
}

export class OrchestratorAgent extends BaseAgent {
  private workers: WorkerAgent[] = []
  
  addWorker(worker: WorkerAgent) {
    this.workers.push(worker)
  }
  
  async chat(message: string, context?: any): Promise<any> {
    return this.executeWorkflow({ message, context })
  }
  
  async executeWorkflow(input: any): Promise<Map<string, WorkerResult>> {
    const results = new Map<string, WorkerResult>()
    
    for (const worker of this.workers) {
      const result = await worker.execute(input, results)
      results.set(result.name, result)
    }
    
    return results
  }
}

export class ParallelAgent extends BaseAgent {
  private workers: WorkerAgent[] = []
  
  addWorker(worker: WorkerAgent) {
    this.workers.push(worker)
  }
  
  async chat(message: string, context?: any): Promise<any> {
    return this.executeWithVoting({ message, context })
  }
  
  async executeParallel(input: any): Promise<WorkerResult[]> {
    const promises = this.workers.map(worker => 
      worker.execute(input, new Map())
    )
    
    return Promise.all(promises)
  }
  
  async executeWithVoting(input: any, votingFn?: (results: WorkerResult[]) => WorkerResult): Promise<WorkerResult> {
    const results = await this.executeParallel(input)
    
    if (votingFn) {
      return votingFn(results)
    }
    
    // Default voting: highest confidence
    return results.reduce((best, current) => 
      (current.confidence || 0) > (best.confidence || 0) ? current : best
    )
  }
}

export * from 'zod'
