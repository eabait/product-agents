import type { ArtifactKind, PlanGraph, PlanNode } from '../contracts/core'
import type {
  ToolDescriptor,
  PlanStepProposal,
  OrchestratorPlanProposal
} from '../contracts/orchestrator'
import { ALL_SECTION_NAMES } from '@product-agents/prd-shared'
import type { SectionName } from '@product-agents/prd-shared'

/**
 * Raw step from LLM output.
 */
interface RawStep {
  id: string
  toolId: string
  toolType: 'skill' | 'subagent'
  label: string
  rationale: string
  dependsOn: string[]
  outputArtifact?: string
}

/**
 * Raw plan output from LLM.
 */
interface RawPlanOutput {
  targetArtifact: string
  overallRationale: string
  confidence: number
  warnings?: string[]
  clarifications?: string[]
  steps: RawStep[]
}

/**
 * Validation result for a plan.
 */
interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

/**
 * Options for PlanTranslator.
 */
export interface PlanTranslatorOptions {
  /** Available tools for validation */
  tools: ToolDescriptor[]
  /** Run ID for the plan */
  runId: string
  /** Optional clock function for timestamps */
  clock?: () => Date
}

const PLAN_VERSION = '4.0.0'

const PRD_SKILL_TASK_KINDS: Record<string, 'clarification-check' | 'analyze-context' | 'assemble-prd'> = {
  'prd.check-clarification': 'clarification-check',
  'prd.analyze-context': 'analyze-context',
  'prd.assemble-prd': 'assemble-prd'
}

const isSectionName = (value: string): value is SectionName =>
  (ALL_SECTION_NAMES as readonly string[]).includes(value)

const resolvePrdSection = (toolId: string, tool?: ToolDescriptor): SectionName | undefined => {
  const metadataSection = tool?.metadata?.section
  if (typeof metadataSection === 'string' && isSectionName(metadataSection)) {
    return metadataSection
  }

  if (toolId.startsWith('prd.write-')) {
    const suffix = toolId.slice('prd.write-'.length)
    if (isSectionName(suffix)) {
      return suffix
    }
  }

  return undefined
}

const buildSkillTask = (step: RawStep, tool?: ToolDescriptor): Record<string, unknown> => {
  if (step.toolId.startsWith('prd.')) {
    const mappedKind = PRD_SKILL_TASK_KINDS[step.toolId]
    if (mappedKind) {
      return { kind: mappedKind }
    }

    if (step.toolId.startsWith('prd.write-')) {
      const section = resolvePrdSection(step.toolId, tool)
      return {
        kind: 'write-section',
        section: section ?? step.toolId.slice('prd.write-'.length)
      }
    }
  }

  const [, kind] = step.toolId.split('.')
  return { kind: kind ?? 'unknown' }
}

/**
 * Detect cycles in the dependency graph using DFS.
 */
const detectCycles = (steps: RawStep[]): string[] => {
  const cycles: string[] = []
  const visited = new Set<string>()
  const recursionStack = new Set<string>()
  const stepMap = new Map(steps.map(s => [s.id, s]))

  const dfs = (stepId: string, path: string[]): boolean => {
    if (recursionStack.has(stepId)) {
      const cycleStart = path.indexOf(stepId)
      const cycle = path.slice(cycleStart).concat(stepId)
      cycles.push(`Circular dependency: ${cycle.join(' → ')}`)
      return true
    }

    if (visited.has(stepId)) {
      return false
    }

    visited.add(stepId)
    recursionStack.add(stepId)

    const step = stepMap.get(stepId)
    if (step) {
      for (const dep of step.dependsOn) {
        if (dfs(dep, [...path, stepId])) {
          return true
        }
      }
    }

    recursionStack.delete(stepId)
    return false
  }

  for (const step of steps) {
    if (!visited.has(step.id)) {
      dfs(step.id, [])
    }
  }

  return cycles
}

/**
 * Validate step dependencies exist.
 */
const validateDependencies = (steps: RawStep[]): string[] => {
  const errors: string[] = []
  const stepIds = new Set(steps.map(s => s.id))

  for (const step of steps) {
    for (const dep of step.dependsOn) {
      if (!stepIds.has(dep)) {
        errors.push(`Step "${step.id}" depends on unknown step "${dep}"`)
      }
    }
  }

  return errors
}

/**
 * Validate tool references exist.
 */
const validateToolReferences = (
  steps: RawStep[],
  tools: ToolDescriptor[]
): string[] => {
  const errors: string[] = []
  const toolIds = new Set(tools.map(t => t.id))

  for (const step of steps) {
    if (!toolIds.has(step.toolId)) {
      errors.push(`Step "${step.id}" references unknown tool "${step.toolId}"`)
    }
  }

  return errors
}

/**
 * Validate step IDs are unique.
 */
const validateUniqueIds = (steps: RawStep[]): string[] => {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const step of steps) {
    if (seen.has(step.id)) {
      errors.push(`Duplicate step ID: "${step.id}"`)
    }
    seen.add(step.id)
  }

  return errors
}

/**
 * PlanTranslator converts LLM-generated plan output into executable PlanGraph
 * and validates the plan for correctness.
 */
export class PlanTranslator {
  private readonly tools: ToolDescriptor[]
  private readonly toolMap: Map<string, ToolDescriptor>
  private readonly runId: string
  private readonly clock: () => Date

  constructor(options: PlanTranslatorOptions) {
    this.tools = options.tools
    this.toolMap = new Map(options.tools.map(t => [t.id, t]))
    this.runId = options.runId
    this.clock = options.clock ?? (() => new Date())
  }

  /**
   * Parse JSON output from LLM into raw plan structure.
   */
  parseOutput(output: string): RawPlanOutput {
    // Clean up common LLM formatting issues
    let cleaned = output.trim()

    // Remove markdown code blocks if present
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.slice(7)
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.slice(3)
    }
    if (cleaned.endsWith('```')) {
      cleaned = cleaned.slice(0, -3)
    }

    cleaned = cleaned.trim()

    try {
      const parsed = JSON.parse(cleaned) as RawPlanOutput

      // Validate required fields
      if (!parsed.targetArtifact) {
        throw new Error('Missing required field: targetArtifact')
      }
      if (!parsed.overallRationale) {
        throw new Error('Missing required field: overallRationale')
      }
      if (typeof parsed.confidence !== 'number') {
        throw new Error('Missing or invalid field: confidence')
      }
      if (!Array.isArray(parsed.steps)) {
        throw new Error('Missing or invalid field: steps')
      }

      // Validate each step
      for (let i = 0; i < parsed.steps.length; i++) {
        const step = parsed.steps[i]
        if (!step.id) {
          throw new Error(`Step ${i} missing required field: id`)
        }
        if (!step.toolId) {
          throw new Error(`Step ${i} missing required field: toolId`)
        }
        if (!step.toolType) {
          throw new Error(`Step ${i} missing required field: toolType`)
        }
        if (!step.label) {
          throw new Error(`Step ${i} missing required field: label`)
        }
        if (!step.rationale) {
          throw new Error(`Step ${i} missing required field: rationale`)
        }
        if (!Array.isArray(step.dependsOn)) {
          step.dependsOn = []
        }
      }

      return parsed
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in LLM output: ${error.message}`)
      }
      throw error
    }
  }

  /**
   * Validate a raw plan for correctness.
   */
  validate(raw: RawPlanOutput): ValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    // Check for empty plan - allow it only if clarifications are provided
    if (raw.steps.length === 0) {
      if (!raw.clarifications || raw.clarifications.length === 0) {
        errors.push('Plan has no steps and no clarifications - at least one is required')
        return { valid: false, errors, warnings }
      }
      // Empty plan with clarifications is valid (e.g., request too vague to plan yet)
      return { valid: true, errors: [], warnings }
    }

    // Validate unique IDs
    errors.push(...validateUniqueIds(raw.steps))

    // Validate dependencies exist
    errors.push(...validateDependencies(raw.steps))

    // Validate tool references
    errors.push(...validateToolReferences(raw.steps, this.tools))

    // Detect cycles
    const cycles = detectCycles(raw.steps)
    errors.push(...cycles)

    // Warnings for low confidence
    if (raw.confidence < 0.5) {
      warnings.push(`Low confidence plan (${raw.confidence}). Consider clarifying requirements.`)
    }

    // Warnings for many steps
    if (raw.steps.length > 10) {
      warnings.push(`Plan has ${raw.steps.length} steps. Consider if all are necessary.`)
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    }
  }

  /**
   * Translate raw plan to PlanGraph.
   */
  translateToPlanGraph(raw: RawPlanOutput): PlanGraph {
    const nodes: Record<string, PlanNode> = {}

    for (const step of raw.steps) {
      const tool = this.toolMap.get(step.toolId)
      const isSubagent = step.toolType === 'subagent'

      nodes[step.id] = {
        id: step.id,
        label: step.label,
        task: isSubagent
          ? { kind: 'subagent', agentId: step.toolId }
          : buildSkillTask(step, tool),
        status: 'pending',
        dependsOn: step.dependsOn,
        metadata: {
          kind: step.toolType,
          toolId: step.toolId,
          rationale: step.rationale,
          ...(isSubagent
            ? {
                subagentId: step.toolId,
                artifactKind: step.outputArtifact ?? tool?.outputArtifact
              }
            : {
                skillId: step.toolId
              })
        }
      }
    }

    // Determine entry point (step with no dependencies)
    const entrySteps = raw.steps.filter(s => s.dependsOn.length === 0)
    const entryId = entrySteps.length > 0 ? entrySteps[0].id : (raw.steps[0]?.id ?? '')

    return {
      id: `plan-${this.runId}`,
      artifactKind: raw.targetArtifact as ArtifactKind,
      entryId,
      createdAt: this.clock(),
      version: PLAN_VERSION,
      nodes,
      metadata: {
        orchestrator: 'llm-orchestrator',
        confidence: raw.confidence,
        overallRationale: raw.overallRationale,
        warnings: raw.warnings,
        clarifications: raw.clarifications
      }
    }
  }

  /**
   * Translate raw plan to step proposals for UI.
   */
  translateToStepProposals(raw: RawPlanOutput): PlanStepProposal[] {
    return raw.steps.map(step => ({
      id: step.id,
      toolId: step.toolId,
      toolType: step.toolType,
      label: step.label,
      rationale: step.rationale,
      dependsOn: step.dependsOn,
      outputArtifact: step.outputArtifact as ArtifactKind | undefined
    }))
  }

  /**
   * Translate a complete raw plan to OrchestratorPlanProposal.
   */
  translate(raw: RawPlanOutput): OrchestratorPlanProposal {
    const validation = this.validate(raw)
    if (!validation.valid) {
      throw new Error(`Invalid plan: ${validation.errors.join('; ')}`)
    }

    const plan = this.translateToPlanGraph(raw)
    const steps = this.translateToStepProposals(raw)

    // Merge validation warnings with LLM warnings
    const allWarnings = [
      ...(raw.warnings ?? []),
      ...validation.warnings
    ]

    return {
      plan,
      steps,
      overallRationale: raw.overallRationale,
      confidence: raw.confidence,
      targetArtifact: raw.targetArtifact as ArtifactKind,
      warnings: allWarnings.length > 0 ? allWarnings : undefined,
      suggestedClarifications: raw.clarifications
    }
  }
}

/**
 * Create a PlanTranslator instance.
 */
export const createPlanTranslator = (options: PlanTranslatorOptions): PlanTranslator => {
  return new PlanTranslator(options)
}
