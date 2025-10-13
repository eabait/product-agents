import { z } from 'zod'

export interface AgentRuntimeSettings {
  model: string
  temperature: number
  maxTokens: number
  apiKey?: string
  advanced?: Record<string, any>
}

export interface AgentSettings extends AgentRuntimeSettings {
  subAgentSettings?: Record<string, AgentRuntimeSettings>
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
    const { subAgentSettings, ...rest } = settings || {}
    this.settings = {
      model: 'anthropic/claude-3-5-sonnet',
      temperature: 0.7,
      maxTokens: 2000,
      ...rest,
      ...(subAgentSettings ? { subAgentSettings: { ...subAgentSettings } } : {})
    }
  }
  
  abstract chat(message: string, context?: any): Promise<any>
  
  updateSettings(newSettings: Partial<AgentSettings>) {
    const { subAgentSettings, ...rest } = newSettings || {}
    this.settings = {
      ...this.settings,
      ...rest,
      ...(subAgentSettings
        ? {
            subAgentSettings: {
              ...(this.settings.subAgentSettings || {}),
              ...Object.entries(subAgentSettings).reduce<Record<string, AgentRuntimeSettings>>(
                (acc, [key, value]) => {
                  acc[key] = {
                    ...(this.settings.subAgentSettings?.[key] || {
                      model: this.settings.model,
                      temperature: this.settings.temperature,
                      maxTokens: this.settings.maxTokens
                    }),
                    ...value
                  }
                  return acc
                },
                {}
              )
            }
          }
        : {})
    }
  }
  
  getSettings(): AgentSettings {
    return {
      ...this.settings,
      ...(this.settings.subAgentSettings
        ? {
            subAgentSettings: Object.entries(this.settings.subAgentSettings).reduce<
              Record<string, AgentRuntimeSettings>
            >((acc, [key, value]) => {
              acc[key] = { ...value }
              return acc
            }, {})
          }
        : {})
    }
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

export * from './usage'
export * from 'zod'
