import { z } from 'zod'
import { BaseAnalyzer, AnalyzerResult, AnalyzerInput } from './base-analyzer'
import { createRequirementsExtractionPrompt } from '../prompts'
import { 
  assessConfidence, 
  assessInputCompleteness, 
  assessContextRichness, 
  assessContentSpecificity 
} from '../utils/confidence-assessment'
import { ensureArrayFields } from '../utils/post-process-structured-response'

const RequirementsExtractionSchema = z.object({
  functional: z.array(z.string()),
  nonFunctional: z.array(z.string())
})

export interface RequirementsExtractionResult {
  functional: string[]
  nonFunctional: string[]
}

export class RequirementsExtractor extends BaseAnalyzer {
  async analyze(input: AnalyzerInput): Promise<AnalyzerResult<RequirementsExtractionResult>> {
    const contextAnalysis = input.context?.previousResults?.get('contextAnalysis')?.data
    
    const rawRequirements = await this.generateStructured({
      schema: RequirementsExtractionSchema,
      prompt: createRequirementsExtractionPrompt(
        input.message, 
        contextAnalysis, 
        input.context?.contextPayload
      ),
      arrayFields: ['functional', 'nonFunctional']
    })

    // The OpenRouterClient now handles array field processing automatically with fallback
    const processedRequirements = rawRequirements

    // Ensure all required fields are present
    const validatedRequirements: RequirementsExtractionResult = {
      functional: processedRequirements.functional || [],
      nonFunctional: processedRequirements.nonFunctional || []
    }

    // Assess confidence based on actual factors
    const confidenceAssessment = assessConfidence({
      inputCompleteness: assessInputCompleteness(input.message, input.context?.contextPayload),
      contextRichness: assessContextRichness(input.context?.contextPayload),
      contentSpecificity: assessContentSpecificity(validatedRequirements),
      validationSuccess: true,
      hasErrors: false,
      contentLength: JSON.stringify(validatedRequirements).length
    })

    return {
      name: 'requirementsExtraction',
      data: validatedRequirements,
      confidence: confidenceAssessment,
      metadata: {
        functional_count: validatedRequirements.functional.length,
        non_functional_count: validatedRequirements.nonFunctional.length
      }
    }
  }
}