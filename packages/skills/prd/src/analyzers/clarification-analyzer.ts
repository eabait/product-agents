import { z } from 'zod'
import { BaseAnalyzer, AnalyzerResult, AnalyzerInput } from './base-analyzer'
import { createClarificationPrompt } from '../prompts/index'
import { ClarificationResult, assessConfidence, assessInputCompleteness, assessContextRichness, CONFIDENCE_THRESHOLDS, CONTENT_VALIDATION } from '@product-agents/prd-shared'
import { ensureArrayFields } from '../utils/post-process-structured-response'

// Temporary schema that accepts numeric confidence from AI
const ClarificationResultRawSchema = z.object({
  needsClarification: z.boolean(),
  confidence: z.number().min(0).max(100),
  missingCritical: z.array(z.string()),
  questions: z.array(z.string())
})

export class ClarificationAnalyzer extends BaseAnalyzer {
  async analyze(input: AnalyzerInput): Promise<AnalyzerResult<ClarificationResult>> {
    const rawClarificationResult = await this.generateStructured({
      schema: ClarificationResultRawSchema,
      prompt: createClarificationPrompt(input.message)
    })

    // Post-process the response to handle AI models returning JSON strings instead of arrays
    const rawResult = ensureArrayFields(rawClarificationResult, [
      'missingCritical',
      'questions'
    ]) as {
      needsClarification: boolean
      confidence: number
      missingCritical: string[]
      questions: string[]
    }

    // Convert numeric confidence to categorical assessment
    const confidenceAssessment = assessConfidence({
      inputCompleteness: assessInputCompleteness(input.message, input.context?.contextPayload),
      contextRichness: assessContextRichness(input.context?.contextPayload),
      validationSuccess: !rawResult.needsClarification,
      hasErrors: rawResult.missingCritical.length > 0,
      contentSpecificity:
        rawResult.missingCritical.length === CONTENT_VALIDATION.MAX_MISSING_ITEMS_FOR_HIGH
          ? 'high'
          : rawResult.missingCritical.length <= CONTENT_VALIDATION.MAX_MISSING_ITEMS_FOR_MEDIUM
            ? 'medium'
            : 'low'
    })

    // Build the final result with new confidence format
    const result: ClarificationResult = {
      needsClarification: rawResult.needsClarification,
      confidence: confidenceAssessment,
      missingCritical: rawResult.missingCritical,
      questions: rawResult.questions
    }

    // If clarification is not needed but original confidence was low, log warning
    if (
      !result.needsClarification &&
      rawResult.confidence < CONFIDENCE_THRESHOLDS.LOW_AI_CONFIDENCE_WARNING
    ) {
      console.warn(
        `ClarificationAnalyzer: Proceeding with low AI confidence (${rawResult.confidence}%) for message: "${input.message}"`
      )
    }

    return {
      name: 'clarification',
      data: result,
      confidence: confidenceAssessment,
      metadata: this.composeMetadata({
        missing_critical_count: result.missingCritical.length,
        missing_helpful_count: result.questions.length,
        original_ai_confidence: rawResult.confidence
      })
    }
  }
}
