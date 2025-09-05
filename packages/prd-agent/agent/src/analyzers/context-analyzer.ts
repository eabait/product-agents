import { z } from 'zod'
import { BaseAnalyzer, AnalyzerResult, AnalyzerInput } from './base-analyzer'
import { createContextAnalysisPrompt } from '../prompts'
import { ensureArrayFields } from '../utils/post-process-structured-response'

const ContextAnalysisSchema = z.object({
  themes: z.array(z.string()).optional(),
  requirements: z.object({
    functional: z.array(z.string()).optional(),
    technical: z.array(z.string()).optional(),
    user_experience: z.array(z.string()).optional(),
    epics: z.array(z.object({
      title: z.string(),
      description: z.string()
    })).optional(),
    mvpFeatures: z.array(z.string()).optional()
  }).optional(),
  functional: z.array(z.string()).optional(),
  technical: z.array(z.string()).optional(),
  user_experience: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional()
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
      requirements: processedAnalysis.requirements ? {
        functional: processedAnalysis.requirements.functional || [],
        technical: processedAnalysis.requirements.technical || [],
        user_experience: processedAnalysis.requirements.user_experience || [],
        epics: processedAnalysis.requirements.epics || [],
        mvpFeatures: processedAnalysis.requirements.mvpFeatures || []
      } : {
        functional: processedAnalysis.functional || [],
        technical: processedAnalysis.technical || [],
        user_experience: processedAnalysis.user_experience || [],
        epics: [],
        mvpFeatures: []
      },
      constraints: processedAnalysis.constraints || []
    }

    return {
      name: 'contextAnalysis',
      data: normalized,
      confidence: 0.85,
      metadata: {
        themes_count: normalized.themes.length,
        functional_requirements_count: normalized.requirements.functional.length,
        technical_requirements_count: normalized.requirements.technical.length,
        constraints_count: normalized.constraints.length
      }
    }
  }
}