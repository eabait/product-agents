import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createTargetUsersSectionPrompt } from '../prompts'
import { 
  assessConfidence, 
  assessInputCompleteness, 
  assessContextRichness, 
  assessContentSpecificity 
} from '../utils/confidence-assessment'
import {
  MAX_TARGET_USERS,
  MIN_USER_DESCRIPTION_LENGTH,
  DEFAULT_TEMPERATURE
} from '../constants'

const TargetUsersSectionSchema = z.object({
  targetUsers: z.array(z.string())
})

export interface TargetUsersSection {
  targetUsers: string[]
}

export class TargetUsersSectionWriter extends BaseSectionWriter {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  getSectionName(): string {
    return 'targetUsers'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<TargetUsersSection>> {
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

    const prompt = this.createTargetUsersPrompt(input, contextData)
    
    const rawSection = await this.client.generateStructured({
      model: this.settings.model,
      schema: TargetUsersSectionSchema,
      prompt,
      temperature: DEFAULT_TEMPERATURE
    })

    const validation = this.validateTargetUsersSection(rawSection)
    
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
      content: rawSection as TargetUsersSection,
      confidence: confidenceAssessment,
      metadata: {
        target_users_count: rawSection.targetUsers.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis']
      },
      shouldRegenerate: true
    }
  }

  private createTargetUsersPrompt(input: SectionWriterInput, contextAnalysis: any): string {
    return createTargetUsersSectionPrompt(input, contextAnalysis)
  }

  private validateTargetUsersSection(section: TargetUsersSection): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    if (section.targetUsers.length === 0) {
      issues.push('No target users defined')
    }

    if (section.targetUsers.length > MAX_TARGET_USERS) {
      issues.push(`Too many target users (should be 2-${MAX_TARGET_USERS} for focus)`)
    }

    const shortUsers = section.targetUsers.filter(user => user.length < MIN_USER_DESCRIPTION_LENGTH)
    if (shortUsers.length > 0) {
      issues.push(`Some target users are too vague (should be at least ${MIN_USER_DESCRIPTION_LENGTH} characters)`)
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }
}