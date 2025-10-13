import { z } from 'zod'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createConstraintsSectionPrompt } from '../prompts'
import {
  assessConfidence,
  assessInputCompleteness,
  assessContextRichness,
  assessContentSpecificity
} from '../utils/confidence-assessment'
import {
  DEFAULT_TEMPERATURE,
  MAX_CONSTRAINTS,
  MIN_CONSTRAINTS,
  MAX_ASSUMPTIONS,
  MIN_ASSUMPTIONS,
  MIN_CONSTRAINT_LENGTH,
  MIN_ASSUMPTION_LENGTH
} from '../constants'

const ConstraintsPlanOperationSchema = z.object({
  action: z.enum(['add', 'update', 'remove']).default('add'),
  reference: z.string().optional(),
  value: z.string().optional(),
  rationale: z.string().optional()
})

const StringListPlanSchema = z.object({
  operations: z.array(ConstraintsPlanOperationSchema).default([]),
  proposed: z.array(z.string()).default([])
})

const ConstraintsSectionPlanSchema = z.object({
  mode: z.enum(['append', 'replace', 'smart_merge']).default('smart_merge'),
  constraints: StringListPlanSchema.default({ operations: [], proposed: [] }),
  assumptions: StringListPlanSchema.default({ operations: [], proposed: [] }),
  summary: z.string().optional()
})

export interface ConstraintsSection {
  constraints: string[]
  assumptions: string[]
}

export class ConstraintsSectionWriter extends BaseSectionWriter {
  constructor(settings: any) {
    super(settings)
  }

  getSectionName(): string {
    return 'constraints'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<ConstraintsSection>> {
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

    const existingConstraints = this.extractExistingList(input.context?.existingSection, 'constraints')
    const existingAssumptions = this.extractExistingList(input.context?.existingSection, 'assumptions')

    const prompt = this.createConstraintsPrompt(input, contextData, existingConstraints, existingAssumptions)
    
    const plan = await this.generateStructuredWithFallback({
      schema: ConstraintsSectionPlanSchema,
      prompt,
      temperature: DEFAULT_TEMPERATURE
    })

    const normalizedPlan: ConstraintsPlan = {
      mode: plan.mode ?? 'smart_merge',
      constraints: normalizeStringListPlan(plan.constraints),
      assumptions: normalizeStringListPlan(plan.assumptions),
      summary: plan.summary
    }

    const merged = applyConstraintsPlan(existingConstraints, existingAssumptions, normalizedPlan)

    const finalSection: ConstraintsSection = {
      constraints: merged.constraints,
      assumptions: merged.assumptions
    }

    const validation = this.validateConstraintsSection(finalSection)
    
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
      metadata: this.composeMetadata({
        constraints_count: finalSection.constraints.length,
        assumptions_count: finalSection.assumptions.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis'],
        plan_mode: normalizedPlan.mode,
        constraint_operations: normalizedPlan.constraints.operations.length,
        assumption_operations: normalizedPlan.assumptions.operations.length
      }),
      shouldRegenerate: true
    }
  }

  private createConstraintsPrompt(
    input: SectionWriterInput,
    contextAnalysis: any,
    existingConstraints: string[],
    existingAssumptions: string[]
  ): string {
    return createConstraintsSectionPrompt(input, contextAnalysis, existingConstraints, existingAssumptions)
  }

  private validateConstraintsSection(section: ConstraintsSection): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    if (section.constraints.length < MIN_CONSTRAINTS) {
      issues.push('No constraints defined - every project has constraints')
    }

    if (section.constraints.length > MAX_CONSTRAINTS) {
      issues.push(`Too many constraints (should focus on ${MIN_CONSTRAINTS}-${MAX_CONSTRAINTS} key limitations)`)
    }

    if (section.assumptions.length < MIN_ASSUMPTIONS) {
      issues.push('No assumptions defined - every project has assumptions')
    }

    if (section.assumptions.length > MAX_ASSUMPTIONS) {
      issues.push(`Too many assumptions (should focus on ${MIN_ASSUMPTIONS}-${MAX_ASSUMPTIONS} key assumptions)`)
    }

    const shortConstraints = section.constraints.filter(constraint => constraint.length < MIN_CONSTRAINT_LENGTH)
    if (shortConstraints.length > 0) {
      issues.push(`Some constraints are too vague (should be at least ${MIN_CONSTRAINT_LENGTH} characters)`)
    }

    const shortAssumptions = section.assumptions.filter(assumption => assumption.length < MIN_ASSUMPTION_LENGTH)
    if (shortAssumptions.length > 0) {
      issues.push(`Some assumptions are too vague (should be at least ${MIN_ASSUMPTION_LENGTH} characters)`)
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }

  private extractExistingList(existingSection: any, key: 'constraints' | 'assumptions'): string[] {
    if (!existingSection) return []

    if (Array.isArray(existingSection)) {
      return sanitizeEntries(existingSection)
    }

    if (Array.isArray(existingSection[key])) {
      return sanitizeEntries(existingSection[key])
    }

    return []
  }
}

type StringListPlanInput = z.input<typeof StringListPlanSchema>
type StringListPlan = z.output<typeof StringListPlanSchema>
type ConstraintsPlanInput = z.input<typeof ConstraintsSectionPlanSchema>
type ConstraintsPlan = z.output<typeof ConstraintsSectionPlanSchema>

const sanitizeEntries = (entries: any[]): string[] =>
  entries
    .map(entry => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(entry => entry.length > 0)

const dedupeEntries = (entries: string[]): string[] => {
  const seen = new Set<string>()
  const unique: string[] = []

  for (const entry of entries) {
    const key = entry.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(entry)
  }

  return unique
}

const findEntryIndex = (entries: string[], reference?: string): number => {
  if (!reference) return -1
  const ref = reference.trim().toLowerCase()
  return entries.findIndex(entry => entry.trim().toLowerCase() === ref)
}

const normalizeStringListPlan = (plan?: StringListPlanInput): StringListPlan => ({
  operations: (plan?.operations ?? []).map(operation => ({
    action: operation.action ?? 'add',
    reference: operation.reference,
    value: operation.value,
    rationale: operation.rationale
  })),
  proposed: plan?.proposed ?? []
})

const applyStringListPlan = (existing: string[], plan: StringListPlanInput): string[] => {
  const normalizedPlan = normalizeStringListPlan(plan)

  let working = sanitizeEntries(existing)

  for (const operation of normalizedPlan.operations ?? []) {
    const action = operation.action ?? 'add'
    const reference = operation.reference ?? operation.value
    const index = findEntryIndex(working, reference)
    const value = typeof operation.value === 'string' ? operation.value.trim() : ''

    if (action === 'remove') {
      if (index >= 0) {
        working.splice(index, 1)
      }
      continue
    }

    if (action === 'update') {
      if (index >= 0 && value) {
        working[index] = value
      } else if (value) {
        working.push(value)
      }
      continue
    }

    if (value) {
      if (index >= 0) {
        working[index] = value
      } else {
        working.push(value)
      }
    }
  }

  const sanitizedProposed = sanitizeEntries(normalizedPlan.proposed ?? [])

  if (sanitizedProposed.length > 0) {
    for (const entry of sanitizedProposed) {
      const index = findEntryIndex(working, entry)
      if (index >= 0) {
        working[index] = entry
      } else {
        working.push(entry)
      }
    }
  }

  return dedupeEntries(working)
}

export const applyConstraintsPlan = (
  existingConstraints: string[],
  existingAssumptions: string[],
  plan: ConstraintsPlanInput
): { constraints: string[]; assumptions: string[] } => {
  const normalizedPlan: ConstraintsPlan = {
    mode: plan.mode ?? 'smart_merge',
    constraints: normalizeStringListPlan(plan.constraints),
    assumptions: normalizeStringListPlan(plan.assumptions),
    summary: plan.summary
  }

  const constraints = applyStringListPlan(existingConstraints, normalizedPlan.constraints)
  const assumptions = applyStringListPlan(existingAssumptions, normalizedPlan.assumptions)

  if (normalizedPlan.mode === 'replace') {
    const proposedConstraints = sanitizeEntries(normalizedPlan.constraints.proposed ?? [])
    const proposedAssumptions = sanitizeEntries(normalizedPlan.assumptions.proposed ?? [])

    return {
      constraints: proposedConstraints.length > 0 ? proposedConstraints : constraints,
      assumptions: proposedAssumptions.length > 0 ? proposedAssumptions : assumptions
    }
  }

  return {
    constraints,
    assumptions
  }
}
