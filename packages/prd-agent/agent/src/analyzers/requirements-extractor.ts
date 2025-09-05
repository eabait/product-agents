import { z } from 'zod'
import { BaseAnalyzer, AnalyzerResult, AnalyzerInput } from './base-analyzer'
import { createRequirementsExtractionPrompt } from '../prompts'
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

    return {
      name: 'requirementsExtraction',
      data: validatedRequirements,
      confidence: 0.8,
      metadata: {
        functional_count: validatedRequirements.functional.length,
        non_functional_count: validatedRequirements.nonFunctional.length
      }
    }
  }
}