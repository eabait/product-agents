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

const KeyFeaturePlanOperationSchema = z.object({
  action: z.enum(['add', 'update', 'remove']).default('add'),
  referenceFeature: z.string().optional(),
  feature: z.string().optional(),
  rationale: z.string().optional()
})

const KeyFeaturesSectionPlanSchema = z.object({
  mode: z.enum(['append', 'replace', 'smart_merge']).default('smart_merge'),
  operations: z.array(KeyFeaturePlanOperationSchema).default([]),
  proposedFeatures: z.array(z.string()).default([]),
  summary: z.string().optional()
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

    const existingFeatures = this.extractExistingFeatures(input.context?.existingSection)

    const prompt = this.createKeyFeaturesPrompt(input, contextData, existingFeatures)
    
    const plan = await this.generateStructuredWithFallback({
      schema: KeyFeaturesSectionPlanSchema,
      prompt,
      temperature: DEFAULT_TEMPERATURE
    })

    const mergedFeatures = applyKeyFeaturesPlan(existingFeatures, plan)

    const finalSection: KeyFeaturesSection = {
      keyFeatures: mergedFeatures
    }

    const validation = this.validateKeyFeaturesSection(finalSection)
    
    // Assess confidence based on actual factors
    const confidenceAssessment = assessConfidence({
      inputCompleteness: assessInputCompleteness(input.message, input.context?.contextPayload),
      contextRichness: assessContextRichness(input.context?.contextPayload),
      contentSpecificity: assessContentSpecificity(finalSection),
      validationSuccess: validation.isValid,
      hasErrors: false,
      contentLength: JSON.stringify(finalSection).length
    })

    return {
      name: this.getSectionName(),
      content: finalSection,
      confidence: confidenceAssessment,
      metadata: {
        key_features_count: finalSection.keyFeatures.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis'],
        plan_mode: plan.mode,
        operations_applied: plan.operations?.length ?? 0,
        proposed_features: plan.proposedFeatures?.length ?? 0
      },
      shouldRegenerate: true
    }
  }

  private createKeyFeaturesPrompt(
    input: SectionWriterInput,
    contextAnalysis: any,
    existingFeatures: string[]
  ): string {
    return createKeyFeaturesSectionPrompt(input, contextAnalysis, existingFeatures)
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

  private extractExistingFeatures(existingSection: any): string[] {
    if (!existingSection) return []

    if (Array.isArray(existingSection)) {
      return sanitizeFeatures(existingSection)
    }

    if (Array.isArray(existingSection.keyFeatures)) {
      return sanitizeFeatures(existingSection.keyFeatures)
    }

    return []
  }
}

type KeyFeaturesPlan = z.infer<typeof KeyFeaturesSectionPlanSchema>

const sanitizeFeatures = (features: any[]): string[] =>
  features
    .map(feature => (typeof feature === 'string' ? feature.trim() : ''))
    .filter(feature => feature.length > 0)

const getFeatureKey = (feature: string): string =>
  feature.split(':')[0].trim().toLowerCase()

const dedupeFeatures = (features: string[]): string[] => {
  const seen = new Set<string>()
  const unique: string[] = []

  for (const feature of features) {
    const key = getFeatureKey(feature)
    if (seen.has(key)) {
      const index = unique.findIndex(existing => getFeatureKey(existing) === key)
      if (index >= 0) {
        unique[index] = feature
      }
      continue
    }
    seen.add(key)
    unique.push(feature)
  }

  return unique
}

const findFeatureIndex = (features: string[], reference?: string): number => {
  if (!reference) return -1
  const refKey = getFeatureKey(reference)
  return features.findIndex(feature => getFeatureKey(feature) === refKey)
}

export const applyKeyFeaturesPlan = (
  existingFeatures: string[],
  plan: KeyFeaturesPlan
): string[] => {
  let workingFeatures = sanitizeFeatures(existingFeatures)

  for (const operation of plan.operations ?? []) {
    const action = operation.action ?? 'add'
    const reference = operation.referenceFeature ?? operation.feature
    const index = findFeatureIndex(workingFeatures, reference)

    if (action === 'remove') {
      if (index >= 0) {
        workingFeatures.splice(index, 1)
      }
      continue
    }

    const featureValue = typeof operation.feature === 'string' ? operation.feature.trim() : ''

    if (action === 'update') {
      if (index >= 0 && featureValue) {
        workingFeatures[index] = featureValue
      } else if (featureValue) {
        workingFeatures.push(featureValue)
      }
      continue
    }

    if (featureValue) {
      if (index >= 0) {
        workingFeatures[index] = featureValue
      } else {
        workingFeatures.push(featureValue)
      }
    }
  }

  const sanitizedProposed = sanitizeFeatures(plan.proposedFeatures ?? [])

  if (plan.mode === 'replace') {
    workingFeatures = sanitizedProposed.length > 0 ? sanitizedProposed : workingFeatures
  } else {
    for (const feature of sanitizedProposed) {
      const index = findFeatureIndex(workingFeatures, feature)
      if (index >= 0) {
        workingFeatures[index] = feature
      } else {
        workingFeatures.push(feature)
      }
    }
  }

  workingFeatures = dedupeFeatures(workingFeatures)

  if (workingFeatures.length === 0 && sanitizedProposed.length > 0) {
    workingFeatures = sanitizedProposed
  }

  return workingFeatures
}
