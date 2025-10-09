import { z } from 'zod'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createSuccessMetricsSectionPrompt } from '../prompts'
import {
  assessConfidence,
  assessInputCompleteness,
  assessContextRichness,
  assessContentSpecificity
} from '../utils/confidence-assessment'
import {
  MIN_SUCCESS_METRICS,
  MAX_SUCCESS_METRICS
} from '../constants'

const SuccessMetricSchema = z.object({
  metric: z.string().min(3, 'Metric name should be descriptive'),
  target: z.string().min(3, 'Target must be specific'),
  timeline: z.string().min(3, 'Timeline is required')
})

const SuccessMetricOperationSchema = z.object({
  action: z.enum(['add', 'update', 'remove']).default('add'),
  referenceMetric: z.string().optional(),
  metric: z.string().optional(),
  target: z.string().optional(),
  timeline: z.string().optional(),
  rationale: z.string().optional()
})

const SuccessMetricsPlanSchema = z.object({
  mode: z.enum(['append', 'replace', 'smart_merge']).default('smart_merge'),
  operations: z.array(SuccessMetricOperationSchema).default([]),
  proposedMetrics: z.array(SuccessMetricSchema).default([]),
  summary: z.string().optional()
})

export interface SuccessMetricsSection {
  successMetrics: Array<{
    metric: string
    target: string
    timeline: string
  }>
}

export class SuccessMetricsSectionWriter extends BaseSectionWriter {
  constructor(settings: any) {
    super(settings)
  }

  getSectionName(): string {
    return 'successMetrics'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<SuccessMetricsSection>> {
    if (!this.shouldRegenerateSection(input)) {
      return {
        name: this.getSectionName(),
        content: input.context?.existingSection,
        shouldRegenerate: false
      }
    }

    // Use shared context analysis results with fallback
    const contextAnalysis = input.context?.sharedAnalysisResults?.get('contextAnalysis')
    
    // If context analysis failed, create a minimal fallback
    const contextData = contextAnalysis?.data || {
      themes: [],
      requirements: {
        functional: [],
        technical: [],
        user_experience: [],
        epics: [],
        mvpFeatures: []
      },
      constraints: []
    }

    const prompt = this.createSuccessMetricsPrompt(input, contextData)
    
    const existingMetrics = this.extractExistingMetrics(input.context?.existingSection)

    const plan = await this.generateStructuredWithFallback({
      schema: SuccessMetricsPlanSchema,
      prompt,
      temperature: 0.25 // Lower temperature for consistent metrics
    })

    const mergedMetrics = applySuccessMetricsPlan(existingMetrics, plan)

    const finalSection: SuccessMetricsSection = {
      successMetrics: mergedMetrics
    }

    const validation = this.validateSuccessMetricsSection(finalSection)
    
    // Assess confidence based on actual factors
    const confidenceAssessment = assessConfidence({
      inputCompleteness: assessInputCompleteness(input.message, input.context?.contextPayload),
      contextRichness: assessContextRichness(input.context?.contextPayload),
      contentSpecificity: assessContentSpecificity(finalSection),
      validationSuccess: validation.isValid,
      hasErrors: false,
      contentLength: JSON.stringify(finalSection).length
    })

    return {
      name: this.getSectionName(),
      content: finalSection,
      confidence: confidenceAssessment,
      metadata: {
        success_metrics_count: finalSection.successMetrics.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis'],
        plan_mode: plan.mode,
        operations_applied: plan.operations?.length ?? 0,
        proposed_metrics: plan.proposedMetrics?.length ?? 0
      },
      shouldRegenerate: true
    }
  }

  private createSuccessMetricsPrompt(input: SectionWriterInput, contextAnalysis: any): string {
    return createSuccessMetricsSectionPrompt(input, contextAnalysis)
  }

  private extractExistingMetrics(existingSection: any): SuccessMetricsSection['successMetrics'] {
    if (!existingSection) return []

    if (Array.isArray(existingSection)) {
      return existingSection
        .map(this.sanitizeMetric)
        .filter((metric): metric is NonNullable<ReturnType<typeof this.sanitizeMetric>> => Boolean(metric))
    }

    if (existingSection.successMetrics && Array.isArray(existingSection.successMetrics)) {
      return existingSection.successMetrics
        .map(this.sanitizeMetric)
        .filter((metric): metric is NonNullable<ReturnType<typeof this.sanitizeMetric>> => Boolean(metric))
    }

    return []
  }

  private sanitizeMetric = (metric: any) => {
    if (!metric) return null
    const cleaned = {
      metric: typeof metric.metric === 'string' ? metric.metric.trim() : '',
      target: typeof metric.target === 'string' ? metric.target.trim() : '',
      timeline: typeof metric.timeline === 'string' ? metric.timeline.trim() : ''
    }
    if (cleaned.metric && cleaned.target && cleaned.timeline) {
      return cleaned
    }
    return null
  }

  private validateSuccessMetricsSection(section: SuccessMetricsSection): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    if (section.successMetrics.length === 0) {
      issues.push('No success metrics defined')
    }

    if (section.successMetrics.length < MIN_SUCCESS_METRICS) {
      issues.push(`Too few success metrics (should have ${MIN_SUCCESS_METRICS}-${MAX_SUCCESS_METRICS} key metrics)`)
    }

    if (section.successMetrics.length > MAX_SUCCESS_METRICS) {
      issues.push(`Too many success metrics (should focus on ${MIN_SUCCESS_METRICS}-${MAX_SUCCESS_METRICS} key metrics)`)
    }

    // Check for vague targets
    const vagueTargets = section.successMetrics.filter(m => 
      !m.target.match(/\d+/) || 
      m.target.toLowerCase().includes('increase') && !m.target.match(/\d+%/) ||
      m.target.toLowerCase().includes('improve') ||
      m.target.toLowerCase().includes('better')
    )

    if (vagueTargets.length > 0) {
      issues.push('Some success metrics have vague targets - need specific numbers or percentages')
    }

    // Check for missing timelines
    const missingTimelines = section.successMetrics.filter(m => 
      !m.timeline || 
      m.timeline.length < 5 ||
      m.timeline.toLowerCase() === 'tbd'
    )

    if (missingTimelines.length > 0) {
      issues.push('Some success metrics lack clear timelines')
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }
}

type SuccessMetric = SuccessMetricsSection['successMetrics'][number]
type SuccessMetricsPlan = z.infer<typeof SuccessMetricsPlanSchema>

const sanitizeMetric = (metric: SuccessMetric | null | undefined): SuccessMetric | null => {
  if (!metric) return null
  const cleaned: SuccessMetric = {
    metric: typeof metric.metric === 'string' ? metric.metric.trim() : '',
    target: typeof metric.target === 'string' ? metric.target.trim() : '',
    timeline: typeof metric.timeline === 'string' ? metric.timeline.trim() : ''
  }
  return cleaned.metric && cleaned.target && cleaned.timeline ? cleaned : null
}

const sanitizeMetricFields = (metric?: Partial<SuccessMetric>) =>
  sanitizeMetric({
    metric: metric?.metric ?? '',
    target: metric?.target ?? '',
    timeline: metric?.timeline ?? ''
  })

const dedupeMetrics = (metrics: SuccessMetric[]): SuccessMetric[] => {
  const seen = new Set<string>()
  const unique: SuccessMetric[] = []
  for (const metric of metrics) {
    const key = metric.metric.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    unique.push(metric)
  }
  return unique
}

const findMetricIndex = (metrics: SuccessMetric[], name?: string): number => {
  if (!name) return -1
  const targetName = name.trim().toLowerCase()
  return metrics.findIndex(m => m.metric.trim().toLowerCase() === targetName)
}

export const applySuccessMetricsPlan = (
  existingMetrics: SuccessMetric[],
  plan: SuccessMetricsPlan
): SuccessMetric[] => {
  const sanitizedExisting = existingMetrics
    .map(sanitizeMetric)
    .filter((metric): metric is SuccessMetric => metric !== null)

  const sanitizedProposed = plan.proposedMetrics
    ?.map(sanitizeMetric)
    .filter((metric): metric is SuccessMetric => metric !== null) ?? []

  let workingMetrics = [...sanitizedExisting]

  for (const operation of plan.operations ?? []) {
    const action = operation.action ?? 'add'
    const reference = operation.referenceMetric ?? operation.metric
    const index = findMetricIndex(workingMetrics, reference)

    if (action === 'remove') {
      if (index >= 0) {
        workingMetrics.splice(index, 1)
      }
      continue
    }

    if (action === 'update') {
      if (index >= 0) {
        const updated = sanitizeMetric({
          metric: operation.metric ?? workingMetrics[index].metric,
          target: operation.target ?? workingMetrics[index].target,
          timeline: operation.timeline ?? workingMetrics[index].timeline
        })
        if (updated) {
          workingMetrics[index] = updated
        }
      } else {
        const newMetric = sanitizeMetricFields({
          metric: operation.metric ?? reference,
          target: operation.target,
          timeline: operation.timeline
        })
        if (newMetric) {
          workingMetrics.push(newMetric)
        }
      }
      continue
    }

    // Default add behavior
    const newMetric = sanitizeMetricFields({
      metric: operation.metric ?? reference,
      target: operation.target,
      timeline: operation.timeline
    })
    if (newMetric) {
      const existingIndex = findMetricIndex(workingMetrics, newMetric.metric)
      if (existingIndex >= 0) {
        workingMetrics[existingIndex] = newMetric
      } else {
        workingMetrics.push(newMetric)
      }
    }
  }

  if (plan.mode === 'replace') {
    workingMetrics = sanitizedProposed.length > 0 ? sanitizedProposed : workingMetrics
  } else {
    for (const metric of sanitizedProposed) {
      const index = findMetricIndex(workingMetrics, metric.metric)
      if (index >= 0) {
        workingMetrics[index] = metric
      } else {
        workingMetrics.push(metric)
      }
    }
  }

  workingMetrics = dedupeMetrics(workingMetrics)

  if (workingMetrics.length === 0 && sanitizedProposed.length > 0) {
    workingMetrics = sanitizedProposed
  }

  return workingMetrics
}
