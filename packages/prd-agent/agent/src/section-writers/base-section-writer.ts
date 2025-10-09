import { AgentSettings } from '@product-agents/agent-core'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { z } from 'zod'
import { 
  BaseAnalyzer, 
  AnalyzerInput,
  ContextAnalyzer,
  ClarificationAnalyzer
} from '../analyzers'
import { ConfidenceAssessment } from '../schemas'
import { CONTENT_VALIDATION } from '../utils/confidence-assessment'

export interface SectionWriterResult<T = any> {
  name: string
  content: T
  confidence?: ConfidenceAssessment
  metadata?: Record<string, any>
  shouldRegenerate?: boolean
}

export interface SectionWriterInput {
  message: string
  context?: {
    contextPayload?: any
    existingPRD?: any
    existingSection?: any
    previousResults?: Map<string, any>
    targetSection?: string
    sharedAnalysisResults?: Map<string, any>
  }
}

export abstract class BaseSectionWriter {
  protected settings: AgentSettings
  protected client!: OpenRouterClient
  
  // Fallback analyzers (only used when shared analysis results are not available)
  protected contextAnalyzer?: ContextAnalyzer
  protected clarificationAnalyzer?: ClarificationAnalyzer

  constructor(settings: AgentSettings) {
    this.settings = settings
    this.client = new OpenRouterClient(settings?.apiKey)
    
    // Lazy initialization of analyzers - only created when needed for fallbacks
    // With centralized analysis, these are rarely used
  }

  protected async generateStructuredWithFallback<T>(params: {
    schema: z.ZodSchema<T>
    prompt: string
    temperature?: number
    maxTokens?: number
    arrayFields?: string[]
  }): Promise<T> {
    try {
      return await this.client.generateStructured({
        model: this.settings.model,
        schema: params.schema,
        prompt: params.prompt,
        temperature: params.temperature ?? this.settings.temperature,
        maxTokens: params.maxTokens ?? this.settings.maxTokens,
        arrayFields: params.arrayFields
      })
    } catch (error: any) {
      const fallbackModel = this.settings.advanced?.fallbackModel
      if (fallbackModel && fallbackModel !== this.settings.model && this.isModelNotFoundError(error)) {
        console.warn(`Model ${this.settings.model} unavailable for section writer ${this.getSectionName()}, falling back to ${fallbackModel}`)
        return this.client.generateStructured({
          model: fallbackModel,
          schema: params.schema,
          prompt: params.prompt,
          temperature: params.temperature ?? this.settings.temperature,
          maxTokens: params.maxTokens ?? this.settings.maxTokens,
          arrayFields: params.arrayFields
        })
      }

      throw error
    }
  }

  abstract writeSection(input: SectionWriterInput): Promise<SectionWriterResult>
  
  abstract getSectionName(): string
  
  /**
   * Determines if this writer should regenerate its section based on the input
   */
  shouldRegenerateSection(input: SectionWriterInput): boolean {
    // Default implementation - regenerate if section doesn't exist or is being directly targeted
    return !input.context?.existingSection || 
           input.context?.targetSection === this.getSectionName()
  }

  /**
   * Prepares analyzer input from section writer input
   */
  protected prepareAnalyzerInput(input: SectionWriterInput): AnalyzerInput {
    return {
      message: input.message,
      context: {
        contextPayload: input.context?.contextPayload,
        existingPRD: input.context?.existingPRD,
        previousResults: input.context?.previousResults
      }
    }
  }

  /**
   * Common logic for running multiple analyzers and collecting their results
   */
  protected async runAnalyzers<T extends BaseAnalyzer>(
    input: AnalyzerInput, 
    analyzers: T[]
  ): Promise<Map<string, any>> {
    console.warn('⚠ Running individual analyzers - shared analysis results not available')
    this.initializeFallbackAnalyzers()
    
    const results = new Map<string, any>()
    
    for (const analyzer of analyzers) {
      try {
        const result = await analyzer.analyze(input)
        results.set(result.name, result)
        
        // Update input context with new results for subsequent analyzers
        if (!input.context?.previousResults) {
          if (!input.context) input.context = {}
          input.context.previousResults = new Map()
        }
        input.context.previousResults.set(result.name, result)
      } catch (error) {
        console.warn(`Analyzer ${analyzer.constructor.name} failed:`, error)
        // Continue with other analyzers even if one fails
      }
    }
    
    return results
  }

  /**
   * Lazy initialization of fallback analyzers when shared analysis is not available
   */
  protected initializeFallbackAnalyzers(): void {
    if (!this.contextAnalyzer) {
      this.contextAnalyzer = new ContextAnalyzer(this.settings)
    }
    if (!this.clarificationAnalyzer) {
      this.clarificationAnalyzer = new ClarificationAnalyzer(this.settings)
    }
  }

  /**
   * Validates that the generated section content meets quality standards
   */
  protected validateSectionContent(content: any): { isValid: boolean; issues: string[] } {
    const issues: string[] = []
    
    if (!content) {
      issues.push('Section content is empty or undefined')
      return { isValid: false, issues }
    }
    
    if (typeof content === 'string') {
      if (content.trim().length < CONTENT_VALIDATION.MIN_CONTENT_LENGTH) {
        issues.push('Section content is too short')
      }
      if (content.includes('TODO') || content.includes('[TBD]')) {
        issues.push('Section contains placeholder text')
      }
    }
    
    return {
      isValid: issues.length === 0,
      issues
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
