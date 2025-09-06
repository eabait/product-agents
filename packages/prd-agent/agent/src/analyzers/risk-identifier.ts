import { z } from 'zod'
import { BaseAnalyzer, AnalyzerResult, AnalyzerInput } from './base-analyzer'
import { createRiskAnalysisPrompt } from '../prompts'
import { ensureArrayFields } from '../utils'
import { 
  assessConfidence, 
  assessInputCompleteness, 
  assessContextRichness, 
  assessContentSpecificity 
} from '../utils/confidence-assessment'

const RiskAnalysisSchema = z.object({
  technical_risks: z.union([
    z.string(), // Accept JSON string that can be parsed to array
    z.array(z.object({
      risk: z.string(),
      impact: z.enum(['low', 'medium', 'high']),
      likelihood: z.enum(['low', 'medium', 'high']),
      mitigation: z.string()
    }))
  ]),
  business_risks: z.union([
    z.string(), // Accept JSON string that can be parsed to array
    z.array(z.object({
      risk: z.string(),
      impact: z.enum(['low', 'medium', 'high']),
      likelihood: z.enum(['low', 'medium', 'high']),
      mitigation: z.string()
    }))
  ]),
  dependencies: z.union([
    z.string(), // Accept JSON string that can be parsed to array
    z.array(z.object({
      dependency: z.string(),
      type: z.enum(['internal', 'external', 'technical', 'business']),
      criticality: z.enum(['low', 'medium', 'high']),
      timeline: z.string().optional()
    }))
  ]),
  gaps: z.union([
    z.string(), // Accept JSON string that can be parsed to array
    z.array(z.object({
      gap: z.string(),
      category: z.enum(['requirements', 'technical', 'business', 'user']),
      severity: z.enum(['low', 'medium', 'high'])
    }))
  ]),
  conflicts: z.union([
    z.string(), // Accept JSON string that can be parsed to array
    z.array(z.object({
      conflict: z.string(),
      conflicting_items: z.array(z.string()),
      resolution_suggestion: z.string()
    }))
  ])
})

export interface RiskAnalysisResult {
  technical_risks: Array<{
    risk: string
    impact: 'low' | 'medium' | 'high'
    likelihood: 'low' | 'medium' | 'high'
    mitigation: string
  }>
  business_risks: Array<{
    risk: string
    impact: 'low' | 'medium' | 'high'
    likelihood: 'low' | 'medium' | 'high'
    mitigation: string
  }>
  dependencies: Array<{
    dependency: string
    type: 'internal' | 'external' | 'technical' | 'business'
    criticality: 'low' | 'medium' | 'high'
    timeline?: string
  }>
  gaps: Array<{
    gap: string
    category: 'requirements' | 'technical' | 'business' | 'user'
    severity: 'low' | 'medium' | 'high'
  }>
  conflicts: Array<{
    conflict: string
    conflicting_items: string[]
    resolution_suggestion: string
  }>
}

export class RiskIdentifier extends BaseAnalyzer {
  async analyze(input: AnalyzerInput): Promise<AnalyzerResult<RiskAnalysisResult>> {
    const contextAnalysis = input.context?.previousResults?.get('contextAnalysis')?.data
    const requirementsAnalysis = input.context?.previousResults?.get('requirementsExtraction')?.data
    const existingPRD = input.context?.existingPRD

    const prompt = this.createRiskAnalysisPrompt(input.message, {
      contextAnalysis,
      requirementsAnalysis,
      existingPRD
    })

    const rawRiskAnalysis = await this.generateStructured({
      schema: RiskAnalysisSchema,
      prompt,
      arrayFields: [
        'technical_risks',
        'business_risks', 
        'dependencies',
        'gaps',
        'conflicts'
      ]
    })

    // Ensure all array fields are properly converted from strings if needed
    const riskAnalysis = ensureArrayFields(rawRiskAnalysis, [
      'technical_risks',
      'business_risks', 
      'dependencies',
      'gaps',
      'conflicts'
    ]) as RiskAnalysisResult

    const totalRisks = riskAnalysis.technical_risks.length + riskAnalysis.business_risks.length
    const criticalIssues = riskAnalysis.gaps.filter(g => g.severity === 'high').length + 
                          riskAnalysis.conflicts.length

    // Calculate confidence based on analysis completeness
    let confidence = 0.7
    if (totalRisks > 0) confidence += 0.1
    if (riskAnalysis.dependencies.length > 0) confidence += 0.1
    if (criticalIssues === 0) confidence += 0.1

    // Assess confidence based on actual factors
    const confidenceAssessment = assessConfidence({
      inputCompleteness: assessInputCompleteness(input.message, input.context?.contextPayload),
      contextRichness: assessContextRichness(input.context?.contextPayload),
      contentSpecificity: assessContentSpecificity(riskAnalysis),
      validationSuccess: true,
      hasErrors: false,
      contentLength: JSON.stringify(riskAnalysis).length
    })

    return {
      name: 'riskAnalysis',
      data: riskAnalysis as RiskAnalysisResult,
      confidence: confidenceAssessment,
      metadata: {
        total_risks: totalRisks,
        critical_gaps: riskAnalysis.gaps.filter(g => g.severity === 'high').length,
        high_priority_dependencies: riskAnalysis.dependencies.filter(d => d.criticality === 'high').length,
        conflicts_count: riskAnalysis.conflicts.length
      }
    }
  }

  private createRiskAnalysisPrompt(message: string, context: any): string {
    return createRiskAnalysisPrompt(message, context)
  }
}