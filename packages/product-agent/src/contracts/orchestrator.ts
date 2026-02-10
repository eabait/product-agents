import type { Artifact, ArtifactKind, PlanGraph, RunContext } from './core'
import type { AskUserQuestionRequest } from '@product-agents/prd-shared'

/**
 * Describes a tool (skill or subagent) available to the Orchestrator.
 */
export interface ToolDescriptor {
  /** Unique identifier for this tool */
  id: string
  /** Whether this is a skill or subagent */
  type: 'skill' | 'subagent'
  /** Human-readable name */
  label: string
  /** Description of what this tool does */
  description: string
  /** Artifact kinds this tool can consume as input */
  inputArtifacts: ArtifactKind[]
  /** Artifact kind this tool produces */
  outputArtifact: ArtifactKind
  /** Capabilities this tool provides (e.g., 'plan', 'search', 'synthesize') */
  capabilities: string[]
  /** Additional metadata about the tool */
  metadata?: Record<string, unknown>
}

/**
 * Input provided to the Orchestrator for plan generation.
 */
export interface OrchestratorInput {
  /** The user's request message */
  message: string
  /** Existing artifacts available in context, keyed by kind */
  existingArtifacts: Map<ArtifactKind, Artifact[]>
  /** Conversation history for context */
  conversationHistory?: Array<{ role: string; content: string }>
  /** Additional context payload */
  contextPayload?: Record<string, unknown>
  /** Optional hint for target artifact type */
  targetArtifact?: ArtifactKind
}

/**
 * A single step in the proposed plan, with rationale for UI display.
 */
export interface PlanStepProposal {
  /** Unique identifier for this step */
  id: string
  /** The tool to invoke */
  toolId: string
  /** Whether this is a skill or subagent */
  toolType: 'skill' | 'subagent'
  /** Human-readable label for this step */
  label: string
  /** Explanation of why this tool was chosen for this step */
  rationale: string
  /** Step IDs this step depends on */
  dependsOn: string[]
  /** Expected output artifact kind */
  outputArtifact?: ArtifactKind
  /** Estimated importance (1-10) for prioritization */
  priority?: number
}

/**
 * The Orchestrator's proposed execution plan.
 */
export interface OrchestratorPlanProposal {
  /** The executable plan graph */
  plan: PlanGraph
  /** Step proposals with rationales for UI display */
  steps: PlanStepProposal[]
  /** Overall explanation of why this plan was chosen */
  overallRationale: string
  /** Confidence score (0-1) in this plan */
  confidence: number
  /** Target artifact kind this plan will produce */
  targetArtifact: ArtifactKind
  /** Warnings about potential issues */
  warnings?: string[]
  /** Questions to clarify with the user before proceeding (legacy string format) */
  suggestedClarifications?: string[]
  /** Structured questions with selectable options (new format) */
  structuredClarifications?: AskUserQuestionRequest
}

/**
 * Request to refine an existing plan based on user feedback.
 */
export interface OrchestratorRefineInput {
  /** The current plan to refine */
  currentPlan: PlanGraph
  /** Current step proposals */
  currentSteps: PlanStepProposal[]
  /** User's feedback on what to change */
  feedback: string
  /** Original orchestrator input for context */
  originalInput: OrchestratorInput
}

/**
 * Configuration for the Orchestrator.
 */
export interface OrchestratorConfig {
  /** Model to use for planning */
  model: string
  /** Temperature for LLM generation */
  temperature: number
  /** Maximum tokens for plan generation */
  maxTokens: number
  /** Whether to include detailed rationales */
  includeRationales: boolean
  /** Maximum number of steps in a plan */
  maxPlanSteps?: number
}

/**
 * The Orchestrator is responsible for analyzing user requests and generating
 * execution plans by composing available tools (skills and subagents).
 *
 * It replaces both IntentClassifier and IntelligentPlanner with a unified
 * LLM-driven approach that provides per-step rationales and supports
 * plan approval workflows.
 */
export interface Orchestrator {
  /**
   * Discover all available tools (skills and subagents).
   * @returns Array of tool descriptors
   */
  discoverTools(): Promise<ToolDescriptor[]>

  /**
   * Generate a plan proposal for the given input.
   * Does NOT execute the plan - returns it for user approval.
   *
   * @param input The orchestrator input with user request and context
   * @param context Optional run context for additional information
   * @returns A plan proposal with rationales
   */
  propose(input: OrchestratorInput, context?: RunContext): Promise<OrchestratorPlanProposal>

  /**
   * Refine an existing plan based on user feedback.
   *
   * @param input The refinement request with current plan and feedback
   * @returns An updated plan proposal
   */
  refine(input: OrchestratorRefineInput): Promise<OrchestratorPlanProposal>
}

/**
 * Factory function type for creating Orchestrator instances.
 */
export type OrchestratorFactory = (config: OrchestratorConfig) => Orchestrator
