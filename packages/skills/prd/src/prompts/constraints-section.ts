import { SectionWriterInput } from '../section-writers/base-section-writer.ts'
import {
  buildAnalysisSummaryBlock,
  buildExistingSectionBlock,
  buildUserContextBlock,
  formatExistingItemsList,
  formatReturnJsonOnly,
  formatStructuredOutputRequirement
} from './prompt-helpers.ts'

export function createConstraintsSectionPrompt(
  input: SectionWriterInput,
  contextAnalysis: any,
  existingConstraints: string[],
  existingAssumptions: string[]
): string {
  const lines: string[] = [
    'You are a product manager refining the Constraints section of a PRD. Apply minimal edits while preserving strong existing content.',
    '',
    buildUserContextBlock(input.message),
    buildAnalysisSummaryBlock(contextAnalysis, { includeConstraints: true }),
    ''
  ]

  const existingSection = buildExistingSectionBlock(input, 'constraints', { assumptions: true })
  if (existingSection) {
    lines.push(existingSection, '')
  }

  const currentConstraints = formatExistingItemsList('## Current Constraints', existingConstraints)
  if (currentConstraints) {
    lines.push(currentConstraints, '')
  }

  const currentAssumptions = formatExistingItemsList('## Current Assumptions', existingAssumptions)
  if (currentAssumptions) {
    lines.push(currentAssumptions, '')
  }

  lines.push(
    '## Instructions',
    '- Produce 2-6 constraints (non-negotiable limits) and 2-5 assumptions (items to validate).',
    '- Keep statements specific, actionable, and ≤ 200 characters.',
    '- When modifying or removing existing items, reference them directly.',
    '- Incorporate insights from the analysis summary and provided context.',
    '',
    formatStructuredOutputRequirement([
      'mode: "smart_merge" | "append" | "replace"',
      'constraints.operations: array of { action, reference, value?, rationale? } for targeted edits',
      'constraints.proposed: array of fully written constraints to add when appending',
      'assumptions.operations: same structure as constraints.operations',
      'assumptions.proposed: array of fully written assumptions for append actions',
      'summary: optional string explaining notable decisions'
    ]),
    '',
    formatReturnJsonOnly()
  )

  return lines.join('\n')
}
