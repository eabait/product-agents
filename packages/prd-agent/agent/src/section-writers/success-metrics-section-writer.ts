import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createSuccessMetricsSectionPrompt } from '../prompts'
import { 
  assessConfidence, 
  assessInputCompleteness, 
  assessContextRichness, 
  assessContentSpecificity 
} from '../utils/confidence-assessment'
import {
  MIN_SUCCESS_METRICS,
  MAX_SUCCESS_METRICS
} from '../constants'

const SuccessMetricsSectionSchema = z.object({
  successMetrics: z.array(z.object({
    metric: z.string(),
    target: z.string(),
    timeline: z.string()
  }))
})

export interface SuccessMetricsSection {
  successMetrics: Array<{
    metric: string
    target: string
    timeline: string
  }>
}

export class SuccessMetricsSectionWriter extends BaseSectionWriter {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  getSectionName(): string {
    return 'successMetrics'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<SuccessMetricsSection>> {
    if (!this.shouldRegenerateSection(input)) {
      return {
        name: this.getSectionName(),
        content: input.context?.existingSection,
        shouldRegenerate: false
      }
    }

    // Use shared context analysis results with fallback
    const contextAnalysis = input.context?.sharedAnalysisResults?.get('contextAnalysis')
    
    // If context analysis failed, create a minimal fallback
    const contextData = contextAnalysis?.data || {
      themes: [],
      requirements: {
        functional: [],
        technical: [],
        user_experience: [],
        epics: [],
        mvpFeatures: []
      },
      constraints: []
    }

    const prompt = this.createSuccessMetricsPrompt(input, contextData)
    
    const rawSection = await this.client.generateStructured({
      model: this.settings.model,
      schema: SuccessMetricsSectionSchema,
      prompt,
      temperature: 0.25 // Lower temperature for consistent metrics
    })

    const validation = this.validateSuccessMetricsSection(rawSection)
    
    // Assess confidence based on actual factors
    const confidenceAssessment = assessConfidence({
      inputCompleteness: assessInputCompleteness(input.message, input.context?.contextPayload),
      contextRichness: assessContextRichness(input.context?.contextPayload),
      contentSpecificity: assessContentSpecificity(rawSection),
      validationSuccess: validation.isValid,
      hasErrors: false,
      contentLength: JSON.stringify(rawSection).length
    })

    return {
      name: this.getSectionName(),
      content: rawSection as SuccessMetricsSection,
      confidence: confidenceAssessment,
      metadata: {
        success_metrics_count: rawSection.successMetrics.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis']
      },
      shouldRegenerate: true
    }
  }

  private createSuccessMetricsPrompt(input: SectionWriterInput, contextAnalysis: any): string {
    return createSuccessMetricsSectionPrompt(input, contextAnalysis)
  }

  private validateSuccessMetricsSection(section: SuccessMetricsSection): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    if (section.successMetrics.length === 0) {
      issues.push('No success metrics defined')
    }

    if (section.successMetrics.length < MIN_SUCCESS_METRICS) {
      issues.push(`Too few success metrics (should have ${MIN_SUCCESS_METRICS}-${MAX_SUCCESS_METRICS} key metrics)`)
    }

    if (section.successMetrics.length > MAX_SUCCESS_METRICS) {
      issues.push(`Too many success metrics (should focus on ${MIN_SUCCESS_METRICS}-${MAX_SUCCESS_METRICS} key metrics)`)
    }

    // Check for vague targets
    const vagueTargets = section.successMetrics.filter(m => 
      !m.target.match(/\d+/) || 
      m.target.toLowerCase().includes('increase') && !m.target.match(/\d+%/) ||
      m.target.toLowerCase().includes('improve') ||
      m.target.toLowerCase().includes('better')
    )

    if (vagueTargets.length > 0) {
      issues.push('Some success metrics have vague targets - need specific numbers or percentages')
    }

    // Check for missing timelines
    const missingTimelines = section.successMetrics.filter(m => 
      !m.timeline || 
      m.timeline.length < 5 ||
      m.timeline.toLowerCase() === 'tbd'
    )

    if (missingTimelines.length > 0) {
      issues.push('Some success metrics lack clear timelines')
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }
}