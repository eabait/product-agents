import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createScopeSectionPrompt } from '../prompts'
import { ensureArrayFields } from '../utils'

const ScopeSectionSchema = z.object({
  inScope: z.union([
    z.string(), // Accept JSON string that can be parsed to array
    z.array(z.object({
      feature: z.string(),
      description: z.string(),
      priority: z.enum(['must-have', 'should-have', 'could-have']),
      rationale: z.string()
    }))
  ]),
  outOfScope: z.union([
    z.string(), // Accept JSON string that can be parsed to array
    z.array(z.object({
      item: z.string(),
      rationale: z.string(),
      futureConsideration: z.boolean()
    }))
  ]),
  mvpFeatures: z.union([
    z.string(), // Accept JSON string that can be parsed to array
    z.array(z.string())
  ]),
  futurePhases: z.union([
    z.string(), // Accept JSON string that can be parsed to array
    z.array(z.object({
      phase: z.string(),
      timeline: z.string(),
      features: z.union([
        z.string(), // Accept JSON string that can be parsed to array
        z.array(z.string())
      ]),
      objectives: z.union([
        z.string(), // Accept JSON string that can be parsed to array
        z.array(z.string())
      ])
    }))
  ]),
  boundaries: z.object({
    functional: z.union([
      z.string(), // Accept JSON string that can be parsed to array
      z.array(z.string())
    ]),
    technical: z.union([
      z.string(), // Accept JSON string that can be parsed to array
      z.array(z.string())
    ]),
    business: z.union([
      z.string(), // Accept JSON string that can be parsed to array
      z.array(z.string())
    ])
  })
})

export interface ScopeSection {
  inScope: Array<{
    feature: string
    description: string
    priority: 'must-have' | 'should-have' | 'could-have'
    rationale: string
  }>
  outOfScope: Array<{
    item: string
    rationale: string
    futureConsideration: boolean
  }>
  mvpFeatures: string[]
  futurePhases: Array<{
    phase: string
    timeline: string
    features: string[]
    objectives: string[]
  }>
  boundaries: {
    functional: string[]
    technical: string[]
    business: string[]
  }
}

export class ScopeSectionWriter extends BaseSectionWriter {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  getSectionName(): string {
    return 'scope'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<ScopeSection>> {
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
      console.log('✓ Using shared analysis results for scope section')
      
      // Map shared results to expected format
      const contextAnalysis = input.context.sharedAnalysisResults.get('contextAnalysis')
      const contentSummary = input.context.sharedAnalysisResults.get('contentSummary')
      
      if (contextAnalysis) analysisResults.set('contextAnalysis', contextAnalysis)
      if (contentSummary) analysisResults.set('contentSummary', contentSummary)
      
      // Requirements extraction might be needed for scope section
      const requirementsExtraction = input.context.sharedAnalysisResults.get('requirementsExtraction')
      if (!requirementsExtraction) {
        // Run only requirements extraction if not available in shared results
        const analyzerInput = this.prepareAnalyzerInput(input)
        const requirementsResult = await this.requirementsExtractor.analyze(analyzerInput)
        analysisResults.set('requirementsExtraction', requirementsResult)
      } else {
        analysisResults.set('requirementsExtraction', requirementsExtraction)
      }
    } else {
      // Fallback to individual analyzer calls
      console.log('⚠ Shared analysis results not available, running individual analyzers')
      const analyzerInput = this.prepareAnalyzerInput(input)
      analysisResults = await this.runAnalyzers(analyzerInput, [
        this.contextAnalyzer,
        this.requirementsExtractor,
        this.contentSummarizer
      ])
    }

    const contextResult = analysisResults.get('contextAnalysis')
    const requirementsResult = analysisResults.get('requirementsExtraction')
    const summaryResult = analysisResults.get('contentSummary')

    // Generate PRD-ready scope section
    const prompt = this.createScopeSectionPrompt(input, {
      contextAnalysis: contextResult?.data,
      requirementsExtraction: requirementsResult?.data,
      contentSummary: summaryResult?.data
    })
    
    const rawScopeSection = await this.client.generateStructured({
      model: this.settings.model,
      schema: ScopeSectionSchema,
      prompt,
      temperature: 0.25 // Lower temperature for consistent scope definition
    })

    // Post-process the response to handle AI models returning JSON strings instead of arrays
    const scopeSection = ensureArrayFields<ScopeSection>(rawScopeSection, [
      'inScope',
      'outOfScope',
      'mvpFeatures',
      'futurePhases',
      'boundaries.functional',
      'boundaries.technical',
      'boundaries.business'
    ])

    // Validate the generated content
    const validation = this.validateScopeSection(scopeSection)
    
    let confidence = 0.8
    if (contextResult?.confidence) confidence *= contextResult.confidence
    if (requirementsResult?.confidence) confidence *= requirementsResult.confidence
    if (!validation.isValid) confidence *= 0.6

    return {
      name: this.getSectionName(),
      content: scopeSection as ScopeSection,
      confidence,
      metadata: {
        in_scope_count: scopeSection.inScope.length,
        out_of_scope_count: scopeSection.outOfScope.length,
        mvp_features_count: scopeSection.mvpFeatures.length,
        future_phases_count: scopeSection.futurePhases.length,
        must_have_features: scopeSection.inScope.filter(f => f.priority === 'must-have').length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis', 'requirementsExtraction', 'contentSummary']
      },
      shouldRegenerate: true
    }
  }

  private createScopeSectionPrompt(
    input: SectionWriterInput,
    analysisResults: any
  ): string {
    return createScopeSectionPrompt(input, analysisResults)
  }

  private validateScopeSection(scope: ScopeSection): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    // Validate in-scope items
    if (scope.inScope.length === 0) {
      issues.push('No in-scope features defined')
    }

    const mustHaveFeatures = scope.inScope.filter(f => f.priority === 'must-have')
    if (mustHaveFeatures.length === 0) {
      issues.push('No must-have features defined - MVP will be unclear')
    }

    if (mustHaveFeatures.length > scope.inScope.length * 0.6) {
      issues.push('Too many features marked as must-have - should be more selective')
    }

    // Validate MVP alignment
    if (scope.mvpFeatures.length === 0) {
      issues.push('No MVP features defined')
    }

    // Check if MVP features align with must-have priorities
    const mustHaveNames = mustHaveFeatures.map(f => f.feature.toLowerCase())
    const mvpMisaligned = scope.mvpFeatures.filter(mvp => 
      !mustHaveNames.some(mustHave => mvp.toLowerCase().includes(mustHave.toLowerCase()))
    )
    
    if (mvpMisaligned.length > 0) {
      issues.push('Some MVP features don\'t align with must-have priorities')
    }

    // Validate out-of-scope rationales
    const weakRationales = scope.outOfScope.filter(item => 
      !item.rationale || 
      item.rationale.length < 10 || 
      item.rationale.toLowerCase().includes('not important')
    )
    
    if (weakRationales.length > 0) {
      issues.push('Some out-of-scope items have weak or missing rationales')
    }

    // Validate boundaries
    if (scope.boundaries.functional.length === 0 && 
        scope.boundaries.technical.length === 0 && 
        scope.boundaries.business.length === 0) {
      issues.push('No boundaries defined - scope may be unclear')
    }

    // Validate future phases
    if (scope.futurePhases.length > 0) {
      const phasesWithoutTimelines = scope.futurePhases.filter(p => !p.timeline || p.timeline.length === 0)
      if (phasesWithoutTimelines.length > 0) {
        issues.push('Some future phases lack timeline information')
      }

      const phasesWithoutFeatures = scope.futurePhases.filter(p => p.features.length === 0)
      if (phasesWithoutFeatures.length > 0) {
        issues.push('Some future phases have no features defined')
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }
}