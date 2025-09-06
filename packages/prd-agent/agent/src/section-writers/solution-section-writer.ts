import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createSolutionSectionPrompt } from '../prompts'
import { 
  assessConfidence, 
  assessInputCompleteness, 
  assessContextRichness, 
  assessContentSpecificity 
} from '../utils/confidence-assessment'

const SolutionSectionSchema = z.object({
  solutionOverview: z.string(),
  approach: z.string()
})

export interface SolutionSection {
  solutionOverview: string
  approach: string
}

export class SolutionSectionWriter extends BaseSectionWriter {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  getSectionName(): string {
    return 'solution'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<SolutionSection>> {
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

    const prompt = this.createSolutionPrompt(input, contextData)
    
    const rawSection = await this.client.generateStructured({
      model: this.settings.model,
      schema: SolutionSectionSchema,
      prompt,
      temperature: 0.25 // Lower temperature for consistent solution approach
    })

    const validation = this.validateSolutionSection(rawSection)
    
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
      content: rawSection as SolutionSection,
      confidence: confidenceAssessment,
      metadata: {
        solution_overview_length: rawSection.solutionOverview.length,
        approach_length: rawSection.approach.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis']
      },
      shouldRegenerate: true
    }
  }

  private createSolutionPrompt(input: SectionWriterInput, contextAnalysis: any): string {
    return createSolutionSectionPrompt(input, contextAnalysis)
  }

  private validateSolutionSection(section: SolutionSection): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    if (!section.solutionOverview || section.solutionOverview.length < 50) {
      issues.push('Solution overview is too short (should be 1-2 paragraphs)')
    }

    if (!section.approach || section.approach.length < 30) {
      issues.push('Solution approach is too brief (should describe how we will solve the problem)')
    }

    if (section.solutionOverview.toLowerCase().includes('tbd') || 
        section.solutionOverview.toLowerCase().includes('to be determined')) {
      issues.push('Solution overview contains placeholder text')
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }
}