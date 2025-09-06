import { z } from 'zod'
import { BaseAnalyzer, AnalyzerResult, AnalyzerInput } from './base-analyzer'
import { createContentSummarizerPrompt, type SummaryOptions } from '../prompts'
import { ensureArrayFields } from '../utils/post-process-structured-response'
import { 
  assessConfidence, 
  assessInputCompleteness, 
  assessContextRichness, 
  assessContentSpecificity 
} from '../utils/confidence-assessment'

const SummarySchema = z.object({
  executive_summary: z.string(),
  key_points: z.array(z.string()),
  priorities: z.array(z.object({
    item: z.string(),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    rationale: z.string()
  })),
  themes: z.array(z.string()),
  word_count_original: z.number(),
  word_count_summary: z.number()
})

export interface SummaryResult {
  executive_summary: string
  key_points: string[]
  priorities: Array<{
    item: string
    priority: 'low' | 'medium' | 'high' | 'critical'
    rationale: string
  }>
  themes: string[]
  word_count_original: number
  word_count_summary: number
}

export class ContentSummarizer extends BaseAnalyzer {
  async analyze(
    input: AnalyzerInput, 
    options: Partial<SummaryOptions> = {}
  ): Promise<AnalyzerResult<SummaryResult>> {
    const {
      target_length = 'medium',
      focus_area = 'balanced',
      include_priorities = true
    } = options

    const fullOptions: SummaryOptions = {
      target_length,
      focus_area,
      include_priorities
    }

    // Combine all available content for summarization
    const contentToSummarize = this.prepareContent(input)
    
    const prompt = this.createSummaryPrompt(contentToSummarize, fullOptions)

    const rawSummary = await this.generateStructured({
      schema: SummarySchema,
      prompt,
      temperature: 0.3 // Lower temperature for consistent summarization
    })

    // Post-process the response to handle AI models returning JSON strings instead of arrays
    const summary = ensureArrayFields<SummaryResult>(rawSummary, [
      'key_points',
      'priorities',
      'themes'
    ])

    // Calculate compression ratio
    const compressionRatio = summary.word_count_summary / summary.word_count_original
    
    // Confidence based on content comprehensiveness and compression quality
    let confidence = 0.8
    if (compressionRatio > 0.1 && compressionRatio < 0.5) confidence += 0.1 // Good compression
    if (summary.key_points.length >= 3) confidence += 0.05 // Sufficient key points
    if (summary.themes.length > 0) confidence += 0.05 // Themes identified

    // Assess confidence based on actual factors
    const confidenceAssessment = assessConfidence({
      inputCompleteness: assessInputCompleteness(input.message, input.context?.contextPayload),
      contextRichness: assessContextRichness(input.context?.contextPayload),
      contentSpecificity: assessContentSpecificity(summary),
      validationSuccess: true,
      hasErrors: false,
      contentLength: JSON.stringify(summary).length
    })

    return {
      name: 'contentSummary',
      data: summary as SummaryResult,
      confidence: confidenceAssessment,
      metadata: {
        compression_ratio: compressionRatio,
        target_length,
        focus_area,
        key_points_count: summary.key_points.length,
        themes_count: summary.themes.length,
        priorities_count: summary.priorities.length
      }
    }
  }

  private prepareContent(input: AnalyzerInput): string {
    let content = `Primary Input: ${input.message}\n\n`

    if (input.context?.contextPayload) {
      content += `Additional Context:\n${JSON.stringify(input.context.contextPayload, null, 2)}\n\n`
    }

    if (input.context?.existingPRD) {
      content += `Existing PRD:\n${JSON.stringify(input.context.existingPRD, null, 2)}\n\n`
    }

    if (input.context?.previousResults) {
      content += `Previous Analysis Results:\n`
      for (const [key, result] of Array.from(input.context.previousResults.entries())) {
        content += `${key}: ${JSON.stringify(result, null, 2)}\n`
      }
    }

    return content
  }

  private createSummaryPrompt(content: string, options: SummaryOptions): string {
    return createContentSummarizerPrompt(content, options)
  }
}