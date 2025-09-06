import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createContextSectionPrompt } from '../prompts'
import { ensureArrayFields } from '../utils'

const ContextSectionSchema = z.object({
  businessContext: z.string(),
  productContext: z.string(),
  marketContext: z.string().optional(),
  stakeholders: z.array(z.object({
    role: z.string(),
    interest: z.string(),
    influence: z.enum(['low', 'medium', 'high'])
  })),
  constraints: z.array(z.string()),
  assumptions: z.array(z.string())
})

export interface ContextSection {
  businessContext: string
  productContext: string
  marketContext?: string
  stakeholders: Array<{
    role: string
    interest: string
    influence: 'low' | 'medium' | 'high'
  }>
  constraints: string[]
  assumptions: string[]
}

export class ContextSectionWriter extends BaseSectionWriter {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  getSectionName(): string {
    return 'context'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<ContextSection>> {
    if (!this.shouldRegenerateSection(input)) {
      return {
        name: this.getSectionName(),
        content: input.context?.existingSection,
        shouldRegenerate: false
      }
    }

    // Use shared analysis results if available, otherwise run analyzers
    let contextResult: any
    let riskResult: any
    
    if (input.context?.sharedAnalysisResults) {
      // Use centralized analysis results to avoid duplicate LLM calls
      console.log('✓ Using shared analysis results for context section')
      
      contextResult = input.context.sharedAnalysisResults.get('contextAnalysis')
      riskResult = input.context.sharedAnalysisResults.get('riskAnalysis')
      
      if (!contextResult || !riskResult) {
        console.log('⚠ Some required analysis results missing from shared results')
      }
    } else {
      // Fallback to individual analyzer calls
      console.log('⚠ Shared analysis results not available, running individual analyzers')
      const analyzerInput = this.prepareAnalyzerInput(input)
      
      if (!this.contextAnalyzer) {
        this.initializeFallbackAnalyzers()
      }
      
      contextResult = await this.contextAnalyzer!.analyze(analyzerInput)
      riskResult = await this.riskIdentifier!.analyze({
        ...analyzerInput,
        context: {
          ...analyzerInput.context,
          previousResults: new Map([['contextAnalysis', contextResult]])
        }
      })
    }

    // Generate PRD-ready context section
    const prompt = this.createContextSectionPrompt(input, contextResult.data, riskResult.data)
    
    const rawContextSection = await this.client.generateStructured({
      model: this.settings.model,
      schema: ContextSectionSchema,
      prompt,
      temperature: 0.3
    })

    // Post-process the response to handle AI models returning JSON strings instead of arrays
    const contextSection = ensureArrayFields<ContextSection>(rawContextSection, [
      'stakeholders',
      'constraints',
      'assumptions'
    ])

    // Validate the generated content
    const validation = this.validateSectionContent(contextSection)
    
    let confidence = 0.8
    if (contextResult.confidence) confidence *= contextResult.confidence
    if (!validation.isValid) confidence *= 0.7

    const confidenceAssessment = {
      level: 'medium' as const,
      reasons: ['Legacy section writer using default confidence'],
      factors: {}
    }

    return {
      name: this.getSectionName(),
      content: contextSection as ContextSection,
      confidence: confidenceAssessment,
      metadata: {
        themes_analyzed: contextResult.data.themes?.length || 0,
        constraints_identified: contextSection.constraints.length,
        stakeholders_identified: contextSection.stakeholders.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis', 'riskAnalysis']
      },
      shouldRegenerate: true
    }
  }

  private createContextSectionPrompt(
    input: SectionWriterInput, 
    contextAnalysis: any, 
    riskAnalysis: any
  ): string {
    return createContextSectionPrompt(input, contextAnalysis, riskAnalysis)
  }
}