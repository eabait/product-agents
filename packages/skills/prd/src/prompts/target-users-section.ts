import { SectionWriterInput } from '../section-writers/base-section-writer.ts'
import {
  buildAnalysisSummaryBlock,
  buildExistingSectionBlock,
  buildUserContextBlock,
  formatExistingItemsList,
  formatReturnJsonOnly,
  formatStructuredOutputRequirement
} from './prompt-helpers.ts'

export function createTargetUsersSectionPrompt(
  input: SectionWriterInput,
  contextAnalysis: any,
  existingUsers: string[]
): string {
  const lines: string[] = [
    'You are a product manager updating the Target Users section of a PRD. Preserve strong personas and apply only necessary edits.',
    '',
    buildUserContextBlock(input.message),
    buildAnalysisSummaryBlock(contextAnalysis, { includeConstraints: true }),
    ''
  ]

  const existingSection = buildExistingSectionBlock(input, 'targetUsers')
  if (existingSection) {
    lines.push(existingSection, '')
  }

  const currentUsers = formatExistingItemsList('## Current Personas to Respect', existingUsers)
  if (currentUsers) {
    lines.push(currentUsers, '')
  }

  lines.push(
    '## Instructions',
    '- Produce 2-4 personas. Each persona should be 1-2 sentences describing who they are and their primary need.',
    '- Focus on specific user segments that align with the themes and requirements.',
    '- Avoid generic labels (e.g., "end users"); highlight context such as role, company size, or pain point.',
    '- Reference existing personas when updating or removing them.',
    '',
    formatStructuredOutputRequirement([
      'mode: "smart_merge" | "append" | "replace"',
      'operations: array of { action, referenceUser?, user?, rationale? } describing targeted edits',
      'proposedUsers: array of fully written personas to append',
      'summary: optional string explaining key decisions'
    ]),
    '',
    formatReturnJsonOnly()
  )

  return lines.join('\n')
}
