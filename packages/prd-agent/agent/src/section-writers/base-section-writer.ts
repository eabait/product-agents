import { AgentSettings } from '@product-agents/agent-core'
import { 
  BaseAnalyzer, 
  AnalyzerInput,
  ContextAnalyzer,
  ClarificationAnalyzer
} from '../analyzers'
import { ConfidenceAssessment } from '../schemas'

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
  
  // Fallback analyzers (only used when shared analysis results are not available)
  protected contextAnalyzer?: ContextAnalyzer
  protected clarificationAnalyzer?: ClarificationAnalyzer

  constructor(settings: AgentSettings) {
    this.settings = settings
    
    // Lazy initialization of analyzers - only created when needed for fallbacks
    // With centralized analysis, these are rarely used
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
      if (content.trim().length < 10) {
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
}