import { z } from 'zod'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createTargetUsersSectionPrompt } from '../prompts/index'
import {
  assessConfidence,
  assessInputCompleteness,
  assessContextRichness,
  assessContentSpecificity,
  MAX_TARGET_USERS,
  MIN_USER_DESCRIPTION_LENGTH,
  DEFAULT_TEMPERATURE
} from '@product-agents/prd-shared'

const normalizePlanAction = (action: string): 'add' | 'update' | 'remove' => {
  const normalized = action.toLowerCase().trim()
  if (normalized === 'modify' || normalized === 'edit' || normalized === 'keep' || normalized === 'retain') {
    return 'update'
  }
  if (normalized === 'delete') {
    return 'remove'
  }
  return normalized === 'add' || normalized === 'update' || normalized === 'remove' ? (normalized as 'add' | 'update' | 'remove') : 'add'
}

const TargetUserPlanOperationSchema = z.object({
  action: z
    .union([
      z.literal('add'),
      z.literal('update'),
      z.literal('remove'),
      z.literal('modify'),
      z.literal('edit'),
      z.literal('keep'),
      z.literal('retain'),
      z.literal('delete')
    ])
    .default('add')
    .transform(value => normalizePlanAction(value)),
  referenceUser: z.string().optional(),
  user: z.string().optional(),
  rationale: z.string().optional()
})

const extractJsonArray = (value: string): unknown[] | null => {
  const start = value.indexOf('[')
  if (start === -1) return null

  let depth = 0
  let inString = false
  let prevChar = ''

  for (let index = start; index < value.length; index++) {
    const char = value[index]
    if (char === '"' && prevChar !== '\\') {
      inString = !inString
    }

    if (!inString) {
      if (char === '[') {
        depth++
      } else if (char === ']') {
        depth--
        if (depth === 0) {
          const candidate = value.slice(start, index + 1)
          try {
            return JSON.parse(candidate)
          } catch {
            break
          }
        }
      }
    }

    prevChar = char
  }

  return null
}

const parseJsonField = (value: unknown) => {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    const withoutParamArtifacts = trimmed.replace(/<parameter[^>]*>.*$/gis, '')
    const withoutTrailingComma = withoutParamArtifacts.replace(/,+\s*$/, '')
    const normalized = withoutTrailingComma.replace(/,\s*([}\]])/g, '$1')
    try {
      return JSON.parse(normalized)
    } catch {
      const extracted = extractJsonArray(normalized)
      if (extracted) {
        return extracted
      }
      return value
    }
  }
  return value
}

const TargetUserOperationsInputSchema = z.preprocess(
  parseJsonField,
  z.array(TargetUserPlanOperationSchema).default([])
)

const TargetUserProposedInputSchema = z.preprocess(
  parseJsonField,
  z.array(z.string()).default([])
)

const TargetUsersSectionPlanSchema = z.object({
  mode: z.enum(['append', 'replace', 'smart_merge']).default('smart_merge'),
  operations: TargetUserOperationsInputSchema,
  proposedUsers: TargetUserProposedInputSchema,
  summary: z.preprocess(
    value => (typeof value === 'number' ? String(value) : value),
    z.string().optional()
  )
})

export interface TargetUsersSection {
  targetUsers: string[]
}

export class TargetUsersSectionWriter extends BaseSectionWriter {
  constructor(settings: any) {
    super(settings)
  }

  getSectionName(): string {
    return 'targetUsers'
  }

  async writeSection(input: SectionWriterInput): Promise<SectionWriterResult<TargetUsersSection>> {
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

    const existingUsers = this.extractExistingUsers(input.context?.existingSection)

    const prompt = this.createTargetUsersPrompt(input, contextData, existingUsers)

    const plan = await this.generateStructuredWithFallback<TargetUsersPlan>({
      schema: TargetUsersSectionPlanSchema,
      prompt,
      temperature: DEFAULT_TEMPERATURE,
      arrayFields: ['operations', 'proposedUsers']
    })

    const normalizedPlan = normalizeTargetUsersPlan(plan)

    const mergedUsers = applyTargetUsersPlan(existingUsers, normalizedPlan)

    const finalSection: TargetUsersSection = {
      targetUsers: mergedUsers
    }

    const validation = this.validateTargetUsersSection(finalSection)

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
        target_users_count: finalSection.targetUsers.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis'],
        plan_mode: normalizedPlan.mode,
        operations_applied: normalizedPlan.operations.length,
        proposed_users: normalizedPlan.proposedUsers.length
      }),
      shouldRegenerate: true
    }
  }

  private createTargetUsersPrompt(
    input: SectionWriterInput,
    contextAnalysis: unknown,
    existingUsers: string[]
  ): string {
    return createTargetUsersSectionPrompt(input, contextAnalysis, existingUsers)
  }

  private validateTargetUsersSection(
    section: TargetUsersSection
  ): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    if (section.targetUsers.length === 0) {
      issues.push('No target users defined')
    }

    if (section.targetUsers.length > MAX_TARGET_USERS) {
      issues.push(`Too many target users (should be 2-${MAX_TARGET_USERS} for focus)`)
    }

    const shortUsers = section.targetUsers.filter(
      user => user.length < MIN_USER_DESCRIPTION_LENGTH
    )
    if (shortUsers.length > 0) {
      issues.push(
        `Some target users are too vague (should be at least ${MIN_USER_DESCRIPTION_LENGTH} characters)`
      )
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }

  private extractExistingUsers(existingSection: unknown): string[] {
    if (!existingSection) return []

    if (Array.isArray(existingSection)) {
      return sanitizeUsers(existingSection)
    }

    if (
      typeof existingSection === 'object' &&
      existingSection !== null &&
      Array.isArray((existingSection as any).targetUsers)
    ) {
      return sanitizeUsers((existingSection as any).targetUsers)
    }

    return []
  }
}

type TargetUsersPlanInput = z.input<typeof TargetUsersSectionPlanSchema>
type TargetUsersPlan = z.output<typeof TargetUsersSectionPlanSchema>

const sanitizeUsers = (users: unknown[]): string[] =>
  users
    .map(user => (typeof user === 'string' ? user.trim() : ''))
    .filter(user => user.length > 0)

const dedupeUsers = (users: string[]): string[] => {
  const seen = new Set<string>()
  const unique: string[] = []

  for (const user of users) {
    const key = user.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(user)
  }

  return unique
}

const findUserIndex = (users: string[], reference?: string): number => {
  if (!reference) return -1
  const ref = reference.trim().toLowerCase()
  return users.findIndex(user => user.trim().toLowerCase() === ref)
}

const normalizeTargetUsersPlan = (plan: TargetUsersPlan): TargetUsersPlan => ({
  mode: plan.mode ?? 'smart_merge',
  operations: (plan.operations ?? []).map(operation => ({
    action: normalizePlanAction(operation.action ?? 'add'),
    referenceUser: operation.referenceUser,
    user: operation.user,
    rationale: operation.rationale
  })),
  proposedUsers: plan.proposedUsers ?? [],
  summary: plan.summary
})

export const applyTargetUsersPlan = (
  existingUsers: string[],
  plan: TargetUsersPlan
): string[] => {
  const normalizedPlan = normalizeTargetUsersPlan(plan)

  let workingUsers = sanitizeUsers(existingUsers)

  for (const operation of normalizedPlan.operations ?? []) {
    const action = operation.action ?? 'add'
    const reference = operation.referenceUser ?? operation.user
    const index = findUserIndex(workingUsers, reference ?? undefined)

    if (action === 'remove') {
      if (index >= 0) {
        workingUsers.splice(index, 1)
      }
      continue
    }

    const userValue = typeof operation.user === 'string' ? operation.user.trim() : ''

    if (action === 'update') {
      if (index >= 0 && userValue) {
        workingUsers[index] = userValue
      } else if (userValue) {
        workingUsers.push(userValue)
      }
      continue
    }

    if (userValue) {
      if (index >= 0) {
        workingUsers[index] = userValue
      } else {
        workingUsers.push(userValue)
      }
    }
  }

  const sanitizedProposed = sanitizeUsers(normalizedPlan.proposedUsers ?? [])

  if (normalizedPlan.mode === 'replace') {
    workingUsers = sanitizedProposed.length > 0 ? sanitizedProposed : workingUsers
  } else {
    for (const user of sanitizedProposed) {
      const index = findUserIndex(workingUsers, user)
      if (index >= 0) {
        workingUsers[index] = user
      } else {
        workingUsers.push(user)
      }
    }
  }

  workingUsers = dedupeUsers(workingUsers)

  if (workingUsers.length === 0 && sanitizedProposed.length > 0) {
    workingUsers = sanitizedProposed
  }

  return workingUsers
}
