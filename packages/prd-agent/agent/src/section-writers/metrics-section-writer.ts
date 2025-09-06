import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createMetricsSectionPrompt } from '../prompts'
import { ensureArrayFields } from '../utils'

const MetricsSectionSchema = z.object({
  successMetrics: z.array(z.object({
    metric: z.string(),
    category: z.enum(['business', 'product', 'technical', 'user']),
    target: z.string(),
    baseline: z.string().optional(),
    timeline: z.string(),
    measurement_method: z.string(),
    owner: z.string(),
    priority: z.enum(['critical', 'important', 'nice-to-have'])
  })),
  kpis: z.array(z.object({
    kpi: z.string(),
    description: z.string(),
    formula: z.string(),
    target_value: z.string(),
    frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly']),
    dashboard_location: z.string()
  })),
  acceptanceCriteria: z.array(z.object({
    criteria: z.string(),
    type: z.enum(['functional', 'performance', 'usability', 'security', 'compliance']),
    test_method: z.string(),
    pass_criteria: z.string()
  })),
  launchCriteria: z.array(z.object({
    criteria: z.string(),
    category: z.enum(['technical', 'business', 'legal', 'operational']),
    status: z.enum(['not-started', 'in-progress', 'completed', 'blocked']),
    owner: z.string(),
    due_date: z.string().optional()
  })),
  monitoringPlan: z.object({
    alerts: z.array(z.object({
      metric: z.string(),
      threshold: z.string(),
      action: z.string()
    })),
    dashboards: z.array(z.string()),
    reporting_schedule: z.string(),
    review_cadence: z.string()
  })
})

export interface MetricsSection {
  successMetrics: Array<{
    metric: string
    category: 'business' | 'product' | 'technical' | 'user'
    target: string
    baseline?: string
    timeline: string
    measurement_method: string
    owner: string
    priority: 'critical' | 'important' | 'nice-to-have'
  }>
  kpis: Array<{
    kpi: string
    description: string
    formula: string
    target_value: string
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
    dashboard_location: string
  }>
  acceptanceCriteria: Array<{
    criteria: string
    type: 'functional' | 'performance' | 'usability' | 'security' | 'compliance'
    test_method: string
    pass_criteria: string
  }>
  launchCriteria: Array<{
    criteria: string
    category: 'technical' | 'business' | 'legal' | 'operational'
    status: 'not-started' | 'in-progress' | 'completed' | 'blocked'
    owner: string
    due_date?: string
  }>
  monitoringPlan: {
    alerts: Array<{
      metric: string
      threshold: string
      action: string
    }>
    dashboards: string[]
    reporting_schedule: string
    review_cadence: string
  }
}

export class MetricsSectionWriter extends BaseSectionWriter {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  getSectionName(): string {
    return 'metrics'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<MetricsSection>> {
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
      console.log('✓ Using shared analysis results for metrics section')
      
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

    // Generate PRD-ready metrics section
    const prompt = this.createMetricsSectionPrompt(input, {
      contextAnalysis: contextResult?.data,
      contentSummary: summaryResult?.data
    })
    
    const rawMetricsSection = await this.client.generateStructured({
      model: this.settings.model,
      schema: MetricsSectionSchema,
      prompt,
      temperature: 0.25 // Lower temperature for consistent metric definitions
    })

    // Post-process the response to handle AI models returning JSON strings instead of arrays
    const metricsSection = ensureArrayFields<MetricsSection>(rawMetricsSection, [
      'successMetrics',
      'kpis',
      'acceptanceCriteria'
    ])

    // Validate the generated content
    const validation = this.validateMetricsSection(metricsSection)
    
    let confidence = 0.82
    if (contextResult?.confidence) confidence *= contextResult.confidence
    if (!validation.isValid) confidence *= 0.6

    const confidenceAssessment = {
      level: 'medium' as const,
      reasons: ['Legacy section writer using default confidence'],
      factors: {}
    }

    return {
      name: this.getSectionName(),
      content: metricsSection as MetricsSection,
      confidence: confidenceAssessment,
      metadata: {
        success_metrics_count: metricsSection.successMetrics.length,
        kpis_count: metricsSection.kpis.length,
        acceptance_criteria_count: metricsSection.acceptanceCriteria.length,
        launch_criteria_count: metricsSection.launchCriteria.length,
        critical_metrics: metricsSection.successMetrics.filter(m => m.priority === 'critical').length,
        alerts_configured: metricsSection.monitoringPlan.alerts.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis', 'contentSummary']
      },
      shouldRegenerate: true
    }
  }

  private createMetricsSectionPrompt(
    input: SectionWriterInput,
    analysisResults: any
  ): string {
    return createMetricsSectionPrompt(input, analysisResults)
  }

  private validateMetricsSection(metrics: MetricsSection): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    // Validate success metrics
    if (metrics.successMetrics.length === 0) {
      issues.push('No success metrics defined')
    }

    const criticalMetrics = metrics.successMetrics.filter(m => m.priority === 'critical')
    if (criticalMetrics.length === 0) {
      issues.push('No critical success metrics defined')
    }

    if (criticalMetrics.length > metrics.successMetrics.length * 0.4) {
      issues.push('Too many metrics marked as critical (should be <40%)')
    }

    // Check for vague targets
    const vagueTargets = metrics.successMetrics.filter(m => 
      m.target.includes('increase') && !m.target.match(/\d+/) ||
      m.target.toLowerCase().includes('improve') ||
      m.target.toLowerCase().includes('better')
    )

    if (vagueTargets.length > 0) {
      issues.push('Some success metrics have vague targets - need specific numbers')
    }

    // Check for missing measurement methods
    const missingMethods = metrics.successMetrics.filter(m => 
      !m.measurement_method || 
      m.measurement_method.length < 10 ||
      m.measurement_method.toLowerCase() === 'tbd'
    )

    if (missingMethods.length > 0) {
      issues.push('Some success metrics lack clear measurement methods')
    }

    // Validate KPIs
    if (metrics.kpis.length === 0) {
      issues.push('No KPIs defined for ongoing monitoring')
    }

    const kpisWithoutFormula = metrics.kpis.filter(k => 
      !k.formula || 
      k.formula.length < 5 ||
      k.formula.toLowerCase() === 'tbd'
    )

    if (kpisWithoutFormula.length > 0) {
      issues.push('Some KPIs lack calculation formulas')
    }

    // Validate acceptance criteria
    if (metrics.acceptanceCriteria.length === 0) {
      issues.push('No acceptance criteria defined')
    }

    const vagueAcceptanceCriteria = metrics.acceptanceCriteria.filter(c => 
      c.pass_criteria.length < 10 ||
      c.pass_criteria.toLowerCase().includes('works well') ||
      c.pass_criteria.toLowerCase().includes('acceptable')
    )

    if (vagueAcceptanceCriteria.length > 0) {
      issues.push('Some acceptance criteria have vague pass criteria')
    }

    // Validate launch criteria
    if (metrics.launchCriteria.length === 0) {
      issues.push('No launch criteria defined')
    }

    const launchCriteriaWithoutOwner = metrics.launchCriteria.filter(c => 
      !c.owner || 
      c.owner.toLowerCase() === 'tbd' ||
      c.owner.toLowerCase() === 'unknown'
    )

    if (launchCriteriaWithoutOwner.length > 0) {
      issues.push('Some launch criteria lack clear ownership')
    }

    // Validate monitoring plan
    if (metrics.monitoringPlan.alerts.length === 0) {
      issues.push('No monitoring alerts configured')
    }

    if (!metrics.monitoringPlan.reporting_schedule || 
        metrics.monitoringPlan.reporting_schedule.toLowerCase() === 'tbd') {
      issues.push('Monitoring plan lacks reporting schedule')
    }

    if (metrics.monitoringPlan.dashboards.length === 0) {
      issues.push('No dashboards specified for monitoring')
    }

    // Check metric balance across categories
    const categories = metrics.successMetrics.map(m => m.category)
    const hasBusinessMetrics = categories.includes('business')
    const hasUserMetrics = categories.includes('user')
    const hasTechnicalMetrics = categories.includes('technical')

    if (!hasBusinessMetrics) {
      issues.push('No business success metrics defined')
    }
    if (!hasUserMetrics) {
      issues.push('No user success metrics defined')
    }
    if (!hasTechnicalMetrics && metrics.successMetrics.length > 2) {
      issues.push('Consider adding technical success metrics for implementation tracking')
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }
}