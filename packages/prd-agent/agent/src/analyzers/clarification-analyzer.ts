import { BaseAnalyzer, AnalyzerResult, AnalyzerInput } from './base-analyzer'
import { createClarificationPrompt } from '../prompts'
import { ClarificationResultSchema, ClarificationResult } from '../schemas'
import { ensureArrayFields } from '../utils/post-process-structured-response'

export class ClarificationAnalyzer extends BaseAnalyzer {
  async analyze(input: AnalyzerInput): Promise<AnalyzerResult<ClarificationResult>> {
    const rawClarificationResult = await this.generateStructured({
      schema: ClarificationResultSchema,
      prompt: createClarificationPrompt(input.message)
    })

    // Post-process the response to handle AI models returning JSON strings instead of arrays
    const result = ensureArrayFields<ClarificationResult>(rawClarificationResult, [
      'missingCritical',
      'questions'
    ])

    // Enhanced confidence scoring based on the AI's own confidence assessment
    // and the presence of critical gaps
    let workerConfidence = result.confidence / 100 // Convert 0-100 to 0-1

    // Adjust confidence based on critical gaps
    if (result.missingCritical.length > 0) {
      workerConfidence = Math.min(workerConfidence, 0.4) // Cap at 0.4 if critical gaps exist
    }

    // If clarification is not needed but confidence is low, flag for review
    if (!result.needsClarification && result.confidence < 70) {
      console.warn(`ClarificationAnalyzer: Proceeding with low confidence (${result.confidence}%) for message: "${input.message}"`)
    }

    return {
      name: 'clarification',
      data: result,
      confidence: workerConfidence,
      metadata: {
        missing_critical_count: result.missingCritical.length,
        missing_helpful_count: result.questions.length, // Use questions count since missingHelpful doesn't exist
        ai_confidence: result.confidence
      }
    }
  }
}