import { z } from 'zod'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createKeyFeaturesSectionPrompt } from '../prompts'
import { 
  assessConfidence, 
  assessInputCompleteness, 
  assessContextRichness, 
  assessContentSpecificity 
} from '../utils/confidence-assessment'
import {
  DEFAULT_TEMPERATURE,
  MIN_KEY_FEATURES,
  MAX_KEY_FEATURES,
  MIN_FEATURE_DESCRIPTION_LENGTH
} from '../constants'

const KeyFeaturesSectionSchema = z.object({
  keyFeatures: z.array(z.string())
})

export interface KeyFeaturesSection {
  keyFeatures: string[]
}

export class KeyFeaturesSectionWriter extends BaseSectionWriter {
  constructor(settings: any) {
    super(settings)
  }

  getSectionName(): string {
    return 'keyFeatures'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<KeyFeaturesSection>> {
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

    const prompt = this.createKeyFeaturesPrompt(input, contextData)
    
    const rawSection = await this.generateStructuredWithFallback({
      schema: KeyFeaturesSectionSchema,
      prompt,
      temperature: DEFAULT_TEMPERATURE
    })

    const validation = this.validateKeyFeaturesSection(rawSection)
    
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
      content: rawSection as KeyFeaturesSection,
      confidence: confidenceAssessment,
      metadata: {
        key_features_count: rawSection.keyFeatures.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis']
      },
      shouldRegenerate: true
    }
  }

  private createKeyFeaturesPrompt(input: SectionWriterInput, contextAnalysis: any): string {
    return createKeyFeaturesSectionPrompt(input, contextAnalysis)
  }

  private validateKeyFeaturesSection(section: KeyFeaturesSection): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    if (section.keyFeatures.length === 0) {
      issues.push('No key features defined')
    }

    if (section.keyFeatures.length < MIN_KEY_FEATURES) {
      issues.push(`Too few key features (should have ${MIN_KEY_FEATURES}-${MAX_KEY_FEATURES} core features)`)
    }

    if (section.keyFeatures.length > MAX_KEY_FEATURES) {
      issues.push(`Too many key features (should focus on ${MIN_KEY_FEATURES}-${MAX_KEY_FEATURES} core features)`)
    }

    const shortFeatures = section.keyFeatures.filter(feature => feature.length < MIN_FEATURE_DESCRIPTION_LENGTH)
    if (shortFeatures.length > 0) {
      issues.push(`Some key features are too vague (should be at least ${MIN_FEATURE_DESCRIPTION_LENGTH} characters)`)
    }

    const duplicateFeatures = section.keyFeatures.filter((feature, index, array) => 
      array.findIndex(f => f.toLowerCase().includes(feature.toLowerCase().substring(0, 10))) !== index
    )
    if (duplicateFeatures.length > 0) {
      issues.push('Some key features appear to be duplicates or very similar')
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }
}
