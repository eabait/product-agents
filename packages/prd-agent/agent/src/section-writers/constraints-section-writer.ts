import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createConstraintsSectionPrompt } from '../prompts'
import { 
  assessConfidence, 
  assessInputCompleteness, 
  assessContextRichness, 
  assessContentSpecificity 
} from '../utils/confidence-assessment'
import {
  DEFAULT_TEMPERATURE,
  MAX_CONSTRAINTS,
  MIN_CONSTRAINTS,
  MAX_ASSUMPTIONS,
  MIN_ASSUMPTIONS,
  MIN_CONSTRAINT_LENGTH,
  MIN_ASSUMPTION_LENGTH
} from '../constants'

const ConstraintsSectionSchema = z.object({
  constraints: z.array(z.string()),
  assumptions: z.array(z.string())
})

export interface ConstraintsSection {
  constraints: string[]
  assumptions: string[]
}

export class ConstraintsSectionWriter extends BaseSectionWriter {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  getSectionName(): string {
    return 'constraints'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<ConstraintsSection>> {
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

    const prompt = this.createConstraintsPrompt(input, contextData)
    
    const rawSection = await this.client.generateStructured({
      model: this.settings.model,
      schema: ConstraintsSectionSchema,
      prompt,
      temperature: DEFAULT_TEMPERATURE
    })

    const validation = this.validateConstraintsSection(rawSection)
    
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
      content: rawSection as ConstraintsSection,
      confidence: confidenceAssessment,
      metadata: {
        constraints_count: rawSection.constraints.length,
        assumptions_count: rawSection.assumptions.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis']
      },
      shouldRegenerate: true
    }
  }

  private createConstraintsPrompt(input: SectionWriterInput, contextAnalysis: any): string {
    return createConstraintsSectionPrompt(input, contextAnalysis)
  }

  private validateConstraintsSection(section: ConstraintsSection): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    if (section.constraints.length < MIN_CONSTRAINTS) {
      issues.push('No constraints defined - every project has constraints')
    }

    if (section.constraints.length > MAX_CONSTRAINTS) {
      issues.push(`Too many constraints (should focus on ${MIN_CONSTRAINTS}-${MAX_CONSTRAINTS} key limitations)`)
    }

    if (section.assumptions.length < MIN_ASSUMPTIONS) {
      issues.push('No assumptions defined - every project has assumptions')
    }

    if (section.assumptions.length > MAX_ASSUMPTIONS) {
      issues.push(`Too many assumptions (should focus on ${MIN_ASSUMPTIONS}-${MAX_ASSUMPTIONS} key assumptions)`)
    }

    const shortConstraints = section.constraints.filter(constraint => constraint.length < MIN_CONSTRAINT_LENGTH)
    if (shortConstraints.length > 0) {
      issues.push(`Some constraints are too vague (should be at least ${MIN_CONSTRAINT_LENGTH} characters)`)
    }

    const shortAssumptions = section.assumptions.filter(assumption => assumption.length < MIN_ASSUMPTION_LENGTH)
    if (shortAssumptions.length > 0) {
      issues.push(`Some assumptions are too vague (should be at least ${MIN_ASSUMPTION_LENGTH} characters)`)
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }
}