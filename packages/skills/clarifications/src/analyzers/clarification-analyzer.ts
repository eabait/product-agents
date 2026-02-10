import { z } from 'zod'
import {
  BaseAnalyzer,
  type AnalyzerResult,
  type AnalyzerInput
} from '@product-agents/skill-analyzer-core'
import { createClarificationPrompt, createStructuredQuestionPrompt } from '../prompts'
import {
  ClarificationResult,
  assessConfidence,
  assessInputCompleteness,
  assessContextRichness,
  CONFIDENCE_THRESHOLDS,
  CONTENT_VALIDATION,
  type AskUserQuestionRequest
} from '@product-agents/prd-shared'
import { ensureArrayFields } from '../utils/structured-response'

// Temporary schema that accepts numeric confidence from AI
const ClarificationResultRawSchema = z.object({
  needsClarification: z.boolean(),
  confidence: z.number().min(0).max(100),
  missingCritical: z.array(z.string()),
  questions: z.array(z.string())
})

// Schema for structured question generation
const StructuredQuestionResultSchema = z.object({
  questions: z.array(
    z.object({
      id: z.string(),
      header: z.string(),
      question: z.string(),
      options: z.array(
        z.object({
          label: z.string(),
          description: z.string()
        })
      ),
      multiSelect: z.boolean().optional()
    })
  ),
  context: z.string().optional(),
  canSkip: z.boolean().optional()
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

    // Generate structured questions if clarification is needed
    let structuredQuestions: AskUserQuestionRequest | undefined

    if (rawResult.needsClarification && rawResult.missingCritical.length > 0) {
      try {
        const structuredResult = await this.generateStructured({
          schema: StructuredQuestionResultSchema,
          prompt: createStructuredQuestionPrompt(input.message, rawResult.missingCritical)
        })

        // Transform to AskUserQuestionRequest format
        structuredQuestions = {
          questions: structuredResult.questions.map((q, index) => ({
            id: q.id || `question-${index}`,
            header: q.header.slice(0, 12), // Ensure max 12 chars
            question: q.question,
            options: q.options.slice(0, 4).map((opt) => ({
              label: opt.label,
              description: opt.description
            })),
            multiSelect: q.multiSelect ?? false,
            required: true
          })),
          context: structuredResult.context,
          canSkip: structuredResult.canSkip ?? false
        }
      } catch (error) {
        // Fallback to legacy questions if structured generation fails
        console.warn(
          'ClarificationAnalyzer: Failed to generate structured questions, using legacy format',
          error
        )
      }
    }

    // Build the final result with new confidence format
    const result: ClarificationResult = {
      needsClarification: rawResult.needsClarification,
      confidence: confidenceAssessment,
      missingCritical: rawResult.missingCritical,
      questions: rawResult.questions,
      structuredQuestions
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
        has_structured_questions: !!structuredQuestions,
        original_ai_confidence: rawResult.confidence
      })
    }
  }
}
