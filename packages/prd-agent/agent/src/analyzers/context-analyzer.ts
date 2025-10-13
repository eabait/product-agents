import { z } from 'zod'
import { BaseAnalyzer, AnalyzerResult, AnalyzerInput } from './base-analyzer'
import { createContextAnalysisPrompt } from '../prompts'
import { 
  assessConfidence, 
  assessInputCompleteness, 
  assessContextRichness, 
  assessContentSpecificity 
} from '../utils/confidence-assessment'

const ContextAnalysisSchema = z.object({
  themes: z.array(z.string()).optional(),
  // Make requirements field flexible - can be object, string, or missing
  requirements: z.union([
    z.object({
      functional: z.array(z.string()).optional(),
      technical: z.array(z.string()).optional(),
      user_experience: z.array(z.string()).optional(),
      epics: z.array(z.object({
        title: z.string(),
        description: z.string()
      })).optional(),
      mvpFeatures: z.array(z.string()).optional()
    }),
    z.string() // Allow string format that AI sometimes returns
  ]).optional(),
  // Fallback flat fields for direct array responses
  functional: z.array(z.string()).optional(),
  technical: z.array(z.string()).optional(),
  user_experience: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
  mvpFeatures: z.array(z.string()).optional(),
  epics: z.array(z.object({
    title: z.string(),
    description: z.string()
  })).optional()
})

export interface ContextAnalysisResult {
  themes: string[]
  requirements: {
    functional: string[]
    technical: string[]
    user_experience: string[]
    epics?: Array<{
      title: string
      description: string
    }>
    mvpFeatures?: string[]
  }
  constraints: string[]
}

export class ContextAnalyzer extends BaseAnalyzer {
  async analyze(input: AnalyzerInput): Promise<AnalyzerResult<ContextAnalysisResult>> {
    const rawAnalysis = await this.generateStructured({
      schema: ContextAnalysisSchema,
      prompt: createContextAnalysisPrompt(input.message, input.context?.contextPayload),
      arrayFields: [ // Specify array fields for fallback post-processing
        'themes',
        'requirements.functional',
        'requirements.technical',
        'requirements.user_experience',
        'requirements.epics',
        'requirements.mvpFeatures',
        'functional',
        'technical',
        'user_experience',
        'constraints'
      ]
    })

    // The OpenRouterClient now handles array field processing automatically with fallback
    const processedAnalysis = rawAnalysis

    // Normalize the response so consumers always see the same shape
    const normalized: ContextAnalysisResult = {
      themes: processedAnalysis.themes || [],
      requirements: (() => {
        // Handle requirements field being object, string, or missing
        if (processedAnalysis.requirements && typeof processedAnalysis.requirements === 'object') {
          return {
            functional: processedAnalysis.requirements.functional || [],
            technical: processedAnalysis.requirements.technical || [],
            user_experience: processedAnalysis.requirements.user_experience || [],
            epics: processedAnalysis.requirements.epics || [],
            mvpFeatures: processedAnalysis.requirements.mvpFeatures || []
          }
        }
        // If requirements is string or missing, use fallback flat fields
        return {
          functional: processedAnalysis.functional || [],
          technical: processedAnalysis.technical || [],
          user_experience: processedAnalysis.user_experience || [],
          epics: processedAnalysis.epics || [],
          mvpFeatures: processedAnalysis.mvpFeatures || []
        }
      })(),
      constraints: processedAnalysis.constraints || []
    }

    // Assess confidence based on actual analysis results
    const confidenceAssessment = assessConfidence({
      inputCompleteness: assessInputCompleteness(input.message, input.context?.contextPayload),
      contextRichness: assessContextRichness(input.context?.contextPayload),
      contentSpecificity: assessContentSpecificity(normalized),
      validationSuccess: true, // Context analysis doesn't typically fail validation
      hasErrors: false,
      contentLength: JSON.stringify(normalized).length
    })

    return {
      name: 'contextAnalysis',
      data: normalized,
      confidence: confidenceAssessment,
      metadata: this.composeMetadata({
        themes_count: normalized.themes.length,
        functional_requirements_count: normalized.requirements.functional.length,
        technical_requirements_count: normalized.requirements.technical.length,
        constraints_count: normalized.constraints.length
      })
    }
  }
}
