declare module '@product-agents/agent-core' {
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
}

declare module '@product-agents/prd-agent' {
  import type { AgentSettings } from '@product-agents/agent-core'

  export interface ConfidenceAssessment {
    level: 'high' | 'medium' | 'low'
    reasons?: string[]
    factors?: Record<string, unknown>
  }

  export interface SectionRoutingRequest {
    message: string
    context?: Record<string, unknown>
    settings?: Record<string, unknown>
    targetSections?: string[]
  }

  export interface SectionRoutingResponse {
    sections: Record<string, unknown>
    metadata: Record<string, any>
    validation: {
      is_valid: boolean
      issues: string[]
      warnings: string[]
    }
  }

  export class PRDOrchestratorAgent {
    constructor(settings?: Partial<AgentSettings>)
    generateSectionsWithProgress(
      request: SectionRoutingRequest,
      onProgress?: (event: unknown) => void
    ): Promise<SectionRoutingResponse>
  }
}
