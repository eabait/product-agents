import { z } from 'zod'
import { BaseAnalyzer, AnalyzerResult, AnalyzerInput } from './base-analyzer'
import { createSectionDetectionPrompt } from '../prompts/section-detection'
import { ConfidenceAssessment } from '../schemas'
import { 
  assessConfidence, 
  assessInputCompleteness, 
  assessContextRichness 
} from '../utils/confidence-assessment'

// Schema for section detection response
const SectionDetectionResultSchema = z.object({
  affectedSections: z.array(z.enum(['targetUsers', 'solution', 'keyFeatures', 'successMetrics', 'constraints'])),
  reasoning: z.record(z.string()), // section name -> reason
  confidence: z.enum(['high', 'medium', 'low'])
})

export type SectionDetectionResult = z.infer<typeof SectionDetectionResultSchema>

export class SectionDetectionAnalyzer extends BaseAnalyzer {
  async analyze(input: AnalyzerInput & { existingPRD?: any }): Promise<AnalyzerResult<SectionDetectionResult>> {
    const result = await this.generateStructured({
      schema: SectionDetectionResultSchema,
      prompt: createSectionDetectionPrompt(input.message, input.existingPRD || input.context?.existingPRD),
      temperature: 0.1 // Low temperature for consistent section detection
    })

    // Build confidence assessment
    const confidenceAssessment = assessConfidence({
      inputCompleteness: assessInputCompleteness(input.message, input.context?.contextPayload),
      contextRichness: assessContextRichness(input.context?.contextPayload),
      validationSuccess: result.affectedSections.length > 0,
      hasErrors: result.affectedSections.length === 0,
      contentSpecificity: result.confidence === 'high' ? 'high' : result.confidence === 'medium' ? 'medium' : 'low'
    })

    // If no sections detected, this might be an error - provide fallback logic
    if (result.affectedSections.length === 0) {
      console.warn('SectionDetectionAnalyzer: No sections detected, using fallback logic')
      
      // Conservative fallback - only update keyFeatures if it mentions features/functionality
      const message = input.message.toLowerCase()
      const fallbackSections: string[] = []
      
      if (message.includes('feature') || message.includes('function') || message.includes('capability')) {
        fallbackSections.push('keyFeatures')
      }
      
      return {
        name: 'sectionDetection',
        data: {
          affectedSections: fallbackSections as any,
          reasoning: { 
            fallback: 'Used fallback logic due to unclear section detection' 
          },
          confidence: 'low' as const
        },
        confidence: {
          level: 'low',
          reasons: ['Fallback logic used due to unclear input'],
          factors: {
            inputCompleteness: 'low',
            contextRichness: 'low',
            validationSuccess: false,
            contentSpecificity: 'low'
          }
        },
        metadata: {
          sections_count: fallbackSections.length,
          used_fallback: true
        }
      }
    }

    return {
      name: 'sectionDetection',
      data: result,
      confidence: confidenceAssessment,
      metadata: {
        sections_count: result.affectedSections.length,
        ai_confidence: result.confidence,
        used_fallback: false
      }
    }
  }
}