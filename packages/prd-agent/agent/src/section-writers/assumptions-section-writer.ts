import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createAssumptionsSectionPrompt } from '../prompts'
import { ensureArrayFields } from '../utils'

const AssumptionsSectionSchema = z.object({
  assumptions: z.union([
    z.string(), // Accept JSON string that can be parsed to array
    z.array(z.object({
      assumption: z.string(),
      description: z.string()
    }))
  ])
})

export interface AssumptionsSection {
  assumptions: Array<{
    assumption: string
    description: string
  }>
}

export class AssumptionsSectionWriter extends BaseSectionWriter {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  getSectionName(): string {
    return 'assumptions'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<AssumptionsSection>> {
    if (!this.shouldRegenerateSection(input)) {
      return {
        name: this.getSectionName(),
        content: input.context?.existingSection,
        shouldRegenerate: false
      }
    }

    // Use shared analysis results if available, otherwise run analyzers
    let analysisResults = new Map<string, any>()
    
    if (input.context?.sharedAnalysisResults) {
      // Use centralized analysis results to avoid duplicate LLM calls
      console.log('✓ Using shared analysis results for assumptions section')
      
      // Map shared results to expected format
      const contextAnalysis = input.context.sharedAnalysisResults.get('contextAnalysis')
      if (contextAnalysis) analysisResults.set('contextAnalysis', contextAnalysis)
    } else {
      // Fallback to individual analyzer calls
      console.log('⚠ Shared analysis results not available, running individual analyzers')
      const analyzerInput = this.prepareAnalyzerInput(input)
      this.initializeFallbackAnalyzers()
      analysisResults = await this.runAnalyzers(analyzerInput, [
        this.contextAnalyzer!
      ])
    }

    const contextResult = analysisResults.get('contextAnalysis')

    // Generate PRD-ready assumptions section
    const prompt = this.createAssumptionsSectionPrompt(input, {
      contextAnalysis: contextResult?.data
    })
    
    const rawAssumptionsSection = await this.client.generateStructured({
      model: this.settings.model,
      schema: AssumptionsSectionSchema,
      prompt,
      temperature: 0.3,
      arrayFields: ['assumptions']
    })

    // Post-process the response to handle AI models returning JSON strings instead of arrays
    const assumptionsSection = ensureArrayFields<AssumptionsSection>(rawAssumptionsSection, [
      'assumptions'
    ])

    // Validate the generated content
    const validation = this.validateAssumptionsSection(assumptionsSection)
    
    let confidence = 0.85
    if (contextResult?.confidence) confidence *= contextResult.confidence
    if (!validation.isValid) confidence *= 0.7

    return {
      name: this.getSectionName(),
      content: assumptionsSection as AssumptionsSection,
      confidence,
      metadata: {
        assumptions_count: assumptionsSection.assumptions.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis']
      },
      shouldRegenerate: true
    }
  }

  private createAssumptionsSectionPrompt(
    input: SectionWriterInput,
    analysisResults: any
  ): string {
    return createAssumptionsSectionPrompt(input, analysisResults)
  }

  private validateAssumptionsSection(assumptions: AssumptionsSection): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    // Check for minimum assumptions
    if (assumptions.assumptions.length === 0) {
      issues.push('No assumptions defined - every project has assumptions')
    }

    // Check for minimum assumption content quality
    const weakAssumptions = assumptions.assumptions.filter(a => 
      !a.assumption || 
      !a.description ||
      a.assumption.length < 10 ||
      a.description.length < 15
    )

    if (weakAssumptions.length > 0) {
      issues.push(`${weakAssumptions.length} assumptions are too brief or incomplete`)
    }

    // Check for assumptions that are actually requirements or facts
    const nonAssumptions = assumptions.assumptions.filter(a => 
      a.assumption.toLowerCase().includes('must ') ||
      a.assumption.toLowerCase().includes('will ') ||
      a.assumption.toLowerCase().includes('shall ')
    )

    if (nonAssumptions.length > 0) {
      issues.push('Some items appear to be requirements rather than assumptions')
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }

}