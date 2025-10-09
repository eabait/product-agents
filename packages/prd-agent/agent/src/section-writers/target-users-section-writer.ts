import { z } from 'zod'
import { BaseSectionWriter, SectionWriterInput, SectionWriterResult } from './base-section-writer'
import { createTargetUsersSectionPrompt } from '../prompts'
import {
  assessConfidence,
  assessInputCompleteness,
  assessContextRichness,
  assessContentSpecificity
} from '../utils/confidence-assessment'
import {
  MAX_TARGET_USERS,
  MIN_USER_DESCRIPTION_LENGTH,
  DEFAULT_TEMPERATURE
} from '../constants'

const TargetUserPlanOperationSchema = z.object({
  action: z.enum(['add', 'update', 'remove']).default('add'),
  referenceUser: z.string().optional(),
  user: z.string().optional(),
  rationale: z.string().optional()
})

const TargetUsersSectionPlanSchema = z.object({
  mode: z.enum(['append', 'replace', 'smart_merge']).default('smart_merge'),
  operations: z.array(TargetUserPlanOperationSchema).default([]),
  proposedUsers: z.array(z.string()).default([]),
  summary: z.string().optional()
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
    
    const plan = await this.generateStructuredWithFallback({
      schema: TargetUsersSectionPlanSchema,
      prompt,
      temperature: DEFAULT_TEMPERATURE
    })

    const mergedUsers = applyTargetUsersPlan(existingUsers, plan)

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
      metadata: {
        target_users_count: finalSection.targetUsers.length,
        validation_issues: validation.issues,
        source_analyzers: ['contextAnalysis'],
        plan_mode: plan.mode,
        operations_applied: plan.operations?.length ?? 0,
        proposed_users: plan.proposedUsers?.length ?? 0
      },
      shouldRegenerate: true
    }
  }

  private createTargetUsersPrompt(
    input: SectionWriterInput,
    contextAnalysis: any,
    existingUsers: string[]
  ): string {
    return createTargetUsersSectionPrompt(input, contextAnalysis, existingUsers)
  }

  private validateTargetUsersSection(section: TargetUsersSection): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    if (section.targetUsers.length === 0) {
      issues.push('No target users defined')
    }

    if (section.targetUsers.length > MAX_TARGET_USERS) {
      issues.push(`Too many target users (should be 2-${MAX_TARGET_USERS} for focus)`)
    }

    const shortUsers = section.targetUsers.filter(user => user.length < MIN_USER_DESCRIPTION_LENGTH)
    if (shortUsers.length > 0) {
      issues.push(`Some target users are too vague (should be at least ${MIN_USER_DESCRIPTION_LENGTH} characters)`)
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }

  private extractExistingUsers(existingSection: any): string[] {
    if (!existingSection) return []

    if (Array.isArray(existingSection)) {
      return sanitizeUsers(existingSection)
    }

    if (Array.isArray(existingSection.targetUsers)) {
      return sanitizeUsers(existingSection.targetUsers)
    }

    return []
  }
}

type TargetUsersPlan = z.infer<typeof TargetUsersSectionPlanSchema>

const sanitizeUsers = (users: any[]): string[] =>
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

export const applyTargetUsersPlan = (
  existingUsers: string[],
  plan: TargetUsersPlan
): string[] => {
  let workingUsers = sanitizeUsers(existingUsers)

  for (const operation of plan.operations ?? []) {
    const action = operation.action ?? 'add'
    const reference = operation.referenceUser ?? operation.user
    const index = findUserIndex(workingUsers, reference)

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

  const sanitizedProposed = sanitizeUsers(plan.proposedUsers ?? [])

  if (plan.mode === 'replace') {
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
