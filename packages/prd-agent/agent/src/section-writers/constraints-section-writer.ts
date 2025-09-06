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
      temperature: 0.3
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

    if (section.constraints.length === 0) {
      issues.push('No constraints defined - every project has constraints')
    }

    if (section.constraints.length > 8) {
      issues.push('Too many constraints (should focus on 2-6 key limitations)')
    }

    if (section.assumptions.length === 0) {
      issues.push('No assumptions defined - every project has assumptions')
    }

    if (section.assumptions.length > 6) {
      issues.push('Too many assumptions (should focus on 2-5 key assumptions)')
    }

    const shortConstraints = section.constraints.filter(constraint => constraint.length < 15)
    if (shortConstraints.length > 0) {
      issues.push('Some constraints are too vague (should be specific limitations)')
    }

    const shortAssumptions = section.assumptions.filter(assumption => assumption.length < 15)
    if (shortAssumptions.length > 0) {
      issues.push('Some assumptions are too vague (should be specific assumptions)')
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }
}