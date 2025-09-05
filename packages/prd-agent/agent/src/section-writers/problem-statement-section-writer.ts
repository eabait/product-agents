import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createProblemStatementSectionPrompt } from '../prompts'
import { ensureArrayFields } from '../utils'

const ProblemStatementSectionSchema = z.object({
  problemStatement: z.string(),
  problemContext: z.string(),
  impactStatement: z.string(),
  targetUsers: z.array(z.object({
    persona: z.string(),
    painPoints: z.array(z.string()),
    currentSolutions: z.array(z.string()),
    unmetNeeds: z.array(z.string())
  })),
  rootCauses: z.array(z.object({
    cause: z.string(),
    evidence: z.string(),
    impact: z.enum(['low', 'medium', 'high'])
  })),
  successCriteria: z.array(z.string())
})

export interface ProblemStatementSection {
  problemStatement: string
  problemContext: string
  impactStatement: string
  targetUsers: Array<{
    persona: string
    painPoints: string[]
    currentSolutions: string[]
    unmetNeeds: string[]
  }>
  rootCauses: Array<{
    cause: string
    evidence: string
    impact: 'low' | 'medium' | 'high'
  }>
  successCriteria: string[]
}

export class ProblemStatementSectionWriter extends BaseSectionWriter {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  getSectionName(): string {
    return 'problemStatement'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<ProblemStatementSection>> {
    if (!this.shouldRegenerateSection(input)) {
      return {
        name: this.getSectionName(),
        content: input.context?.existingSection,
        shouldRegenerate: false
      }
    }

    // Use shared analysis results if available, otherwise run analyzers
    let analysisResults = new Map<string, any>()
    
    if (input.context?.sharedAnalysisResults) {
      // Use centralized analysis results to avoid duplicate LLM calls
      console.log('✓ Using shared analysis results for problem statement section')
      
      // Map shared results to expected format
      const contextAnalysis = input.context.sharedAnalysisResults.get('contextAnalysis')
      const contentSummary = input.context.sharedAnalysisResults.get('contentSummary')
      
      if (contextAnalysis) analysisResults.set('contextAnalysis', contextAnalysis)
      if (contentSummary) analysisResults.set('contentSummary', contentSummary)
    } else {
      // Fallback to individual analyzer calls
      console.log('⚠ Shared analysis results not available, running individual analyzers')
      const analyzerInput = this.prepareAnalyzerInput(input)
      this.initializeFallbackAnalyzers()
      analysisResults = await this.runAnalyzers(analyzerInput, [
        this.contextAnalyzer!,
        this.contentSummarizer!
      ])
    }

    const contextResult = analysisResults.get('contextAnalysis')
    const summaryResult = analysisResults.get('contentSummary')

    // Generate PRD-ready problem statement section
    const prompt = this.createProblemStatementPrompt(input, {
      contextAnalysis: contextResult?.data,
      contentSummary: summaryResult?.data
    })
    
    const rawProblemStatementSection = await this.client.generateStructured({
      model: this.settings.model,
      schema: ProblemStatementSectionSchema,
      prompt,
      temperature: 0.3
    })

    // Post-process the response to handle AI models returning JSON strings instead of arrays
    const problemStatementSection = ensureArrayFields<ProblemStatementSection>(rawProblemStatementSection, [
      'targetUsers',
      'rootCauses',
      'successCriteria'
    ])

    // Validate the generated content
    const validation = this.validateProblemStatementSection(problemStatementSection)
    
    let confidence = 0.82
    if (contextResult?.confidence) confidence *= contextResult.confidence
    if (!validation.isValid) confidence *= 0.7

    return {
      name: this.getSectionName(),
      content: problemStatementSection as ProblemStatementSection,
      confidence,
      metadata: {
        target_users_count: problemStatementSection.targetUsers.length,
        root_causes_count: problemStatementSection.rootCauses.length,
        success_criteria_count: problemStatementSection.successCriteria.length,
        high_impact_causes: problemStatementSection.rootCauses.filter(c => c.impact === 'high').length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis', 'contentSummary']
      },
      shouldRegenerate: true
    }
  }

  private createProblemStatementPrompt(
    input: SectionWriterInput,
    analysisResults: any
  ): string {
    const { contextAnalysis, contentSummary } = analysisResults
    return createProblemStatementSectionPrompt(input, contextAnalysis, contentSummary)
  }

  private validateProblemStatementSection(problemStatement: ProblemStatementSection): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    // Validate core problem statement
    if (!problemStatement.problemStatement || problemStatement.problemStatement.length < 20) {
      issues.push('Problem statement is too short or missing')
    }

    if (problemStatement.problemStatement.toLowerCase().includes('solution') || 
        problemStatement.problemStatement.toLowerCase().includes('implement')) {
      issues.push('Problem statement contains solution language - should focus on the problem only')
    }

    // Validate target users
    if (problemStatement.targetUsers.length === 0) {
      issues.push('No target users defined')
    }

    for (const user of problemStatement.targetUsers) {
      if (user.painPoints.length === 0) {
        issues.push(`Target user ${user.persona} has no pain points defined`)
      }
      if (user.unmetNeeds.length === 0) {
        issues.push(`Target user ${user.persona} has no unmet needs defined`)
      }
    }

    // Validate root causes
    if (problemStatement.rootCauses.length === 0) {
      issues.push('No root causes identified')
    }

    const highImpactCauses = problemStatement.rootCauses.filter(c => c.impact === 'high')
    if (problemStatement.rootCauses.length > 0 && highImpactCauses.length === 0) {
      issues.push('No high-impact root causes identified - problem may not be significant enough')
    }

    // Validate success criteria
    if (problemStatement.successCriteria.length === 0) {
      issues.push('No success criteria defined')
    }

    if (problemStatement.successCriteria.length < 2) {
      issues.push('Too few success criteria - should have multiple measurable outcomes')
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }
}