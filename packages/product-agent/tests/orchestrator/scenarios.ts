/**
 * Test Scenarios for the Product Agent Orchestrator
 *
 * These scenarios represent real-world use cases that the orchestrator must handle.
 * Each scenario is designed to test specific behaviors of the planning system.
 */

import type { OrchestratorInput, ToolDescriptor } from '../../src/contracts/orchestrator'
import type { ArtifactKind } from '../../src/contracts/core'

/**
 * Expected tool usage pattern for validation
 */
export interface ExpectedToolUsage {
  /** Tool IDs that MUST appear in the plan */
  required: string[]
  /** Tool IDs that SHOULD appear first (before others) */
  shouldStartWith?: string[]
  /** Tool IDs that MUST NOT appear in the plan */
  forbidden?: string[]
  /** Minimum number of steps expected */
  minSteps?: number
  /** Maximum number of steps expected */
  maxSteps?: number
}

/**
 * Test scenario definition
 */
export interface TestScenario {
  /** Unique identifier for the scenario */
  id: string
  /** Human-readable name */
  name: string
  /** Description of what this scenario tests */
  description: string
  /** The user's input message */
  userMessage: string
  /** Expected target artifact */
  expectedTarget: ArtifactKind
  /** Expected tool usage patterns */
  expectedTools: ExpectedToolUsage
  /** Expected confidence range [min, max] */
  expectedConfidence: [number, number]
  /** Whether warnings should be present */
  expectWarnings: boolean
  /** Whether clarifications should be suggested */
  expectClarifications: boolean
  /** Minimum number of clarification questions expected (optional) */
  expectMinClarifications?: number
  /** Tags for categorizing scenarios */
  tags: string[]
}

/**
 * =====================================================
 * CATEGORY 1: PRD Generation with Sufficient Context
 * =====================================================
 * These scenarios test when users provide enough detail
 * to proceed directly with PRD generation.
 */
export const PRD_SUFFICIENT_CONTEXT_SCENARIOS: TestScenario[] = [
  {
    id: 'prd-full-context',
    name: 'PRD with complete context',
    description:
      'User provides target audience, problem, differentiators, and use cases. ' +
      'Should proceed directly to PRD generation without research.',
    userMessage:
      'Create a PRD for a task management app for remote teams that integrates with Slack, ' +
      'focuses on async collaboration, and helps distributed teams track project progress ' +
      'without constant meetings. Target users are engineering teams of 10-50 people.',
    expectedTarget: 'prd',
    expectedTools: {
      required: ['prd.check-clarification', 'prd.analyze-context'],
      forbidden: ['research.core.agent'],
      minSteps: 2,
      maxSteps: 8
    },
    expectedConfidence: [0.75, 1.0],
    expectWarnings: false,
    expectClarifications: false,
    tags: ['prd', 'sufficient-context', 'direct-generation']
  },
  {
    id: 'prd-detailed-features',
    name: 'PRD with detailed feature requirements',
    description:
      'User specifies exact features and technical requirements. ' +
      'Should proceed with PRD generation using the provided details.',
    userMessage:
      'I need a PRD for a real-time collaborative document editor for legal teams. ' +
      'It should support version control, track changes, e-signatures, and integrate with ' +
      'existing document management systems. Users are paralegals and lawyers who need ' +
      'to collaborate on contracts and legal briefs.',
    expectedTarget: 'prd',
    expectedTools: {
      required: ['prd.check-clarification', 'prd.analyze-context'],
      forbidden: ['research.core.agent'],
      minSteps: 2,
      maxSteps: 8
    },
    expectedConfidence: [0.8, 1.0],
    expectWarnings: false,
    expectClarifications: false,
    tags: ['prd', 'sufficient-context', 'detailed-features']
  }
]

/**
 * =====================================================
 * CATEGORY 2: PRD Generation with Insufficient Context
 * =====================================================
 * These scenarios test when users provide vague requests
 * that require research to gather context first.
 */
export const PRD_INSUFFICIENT_CONTEXT_SCENARIOS: TestScenario[] = [
  {
    id: 'prd-vague-domain-only',
    name: 'PRD with only domain specified',
    description:
      'User provides only the product domain without any context about users, ' +
      'problems, or differentiation. Should start with research.',
    userMessage: 'Create a PRD for a mobile payment app',
    expectedTarget: 'prd',
    expectedTools: {
      required: ['research.core.agent', 'prd.analyze-context'],
      shouldStartWith: ['research.core.agent'],
      minSteps: 2,
      maxSteps: 6
    },
    expectedConfidence: [0.4, 0.75],
    expectWarnings: true,
    expectClarifications: true,
    tags: ['prd', 'insufficient-context', 'research-first', 'vague']
  },
  {
    id: 'prd-generic-product',
    name: 'PRD for generic product',
    description:
      'User asks for a PRD with extremely minimal information (just "SaaS"). ' +
      'Too vague to even propose research - should ask for basic context first.',
    userMessage: 'I need a PRD for a new SaaS product',
    expectedTarget: 'prd',
    expectedTools: {
      required: [], // Too vague to propose specific tools yet
      forbidden: ['research.core.agent'], // Don't research "SaaS" - too broad
      minSteps: 0,
      maxSteps: 2 // Allow minimal context-gathering if any
    },
    expectedConfidence: [0.2, 0.5], // Very low confidence
    expectWarnings: true,
    expectClarifications: true,
    expectMinClarifications: 3, // Should ask about market, problem/use case, and target audience
    tags: ['prd', 'insufficient-context', 'clarification-required', 'extremely-vague']
  },
  {
    id: 'prd-no-target-audience',
    name: 'PRD without target audience',
    description:
      'User describes the product but not who will use it. ' +
      'Should suggest research or clarification.',
    userMessage: 'Create a PRD for an AI-powered scheduling assistant that automatically finds meeting times',
    expectedTarget: 'prd',
    expectedTools: {
      required: ['research.core.agent', 'prd.analyze-context'],
      shouldStartWith: ['research.core.agent'],
      minSteps: 2,
      maxSteps: 6
    },
    expectedConfidence: [0.5, 0.8],
    expectWarnings: true,
    expectClarifications: true,
    tags: ['prd', 'insufficient-context', 'missing-audience']
  }
]

/**
 * =====================================================
 * CATEGORY 3: Persona Generation
 * =====================================================
 * These scenarios test persona creation workflows.
 */
export const PERSONA_SCENARIOS: TestScenario[] = [
  {
    id: 'persona-with-context',
    name: 'Personas with product context',
    description:
      'User asks for personas for a well-defined product. ' +
      'Should use persona builder directly or with minimal research.',
    userMessage:
      'Create user personas for a fitness tracking app targeting busy professionals ' +
      'who want to maintain health despite demanding work schedules',
    expectedTarget: 'persona',
    expectedTools: {
      required: ['persona.builder'],
      minSteps: 1,
      maxSteps: 3
    },
    expectedConfidence: [0.7, 1.0],
    expectWarnings: false,
    expectClarifications: false,
    tags: ['persona', 'sufficient-context']
  },
  {
    id: 'persona-vague-request',
    name: 'Personas without product context',
    description:
      'User asks for personas without specifying product details. ' +
      'Should start with research to understand the market.',
    userMessage: 'Create personas for my fitness app',
    expectedTarget: 'persona',
    expectedTools: {
      required: ['research.core.agent', 'persona.builder'],
      shouldStartWith: ['research.core.agent'],
      minSteps: 2,
      maxSteps: 4
    },
    expectedConfidence: [0.5, 0.8],
    expectWarnings: true,
    expectClarifications: true,
    tags: ['persona', 'insufficient-context', 'research-first']
  }
]

/**
 * =====================================================
 * CATEGORY 4: Research Requests
 * =====================================================
 * These scenarios test direct research workflows.
 */
export const RESEARCH_SCENARIOS: TestScenario[] = [
  {
    id: 'research-market',
    name: 'Market research request',
    description:
      'User explicitly asks for market research. ' +
      'Should use research agent directly.',
    userMessage: 'Research the market for AI writing tools and analyze the competitive landscape',
    expectedTarget: 'research',
    expectedTools: {
      required: ['research.core.agent'],
      shouldStartWith: ['research.core.agent'],
      forbidden: ['persona.builder', 'prd.check-clarification'],
      minSteps: 1,
      maxSteps: 2
    },
    expectedConfidence: [0.8, 1.0],
    expectWarnings: false,
    expectClarifications: false,
    tags: ['research', 'direct-request']
  },
  {
    id: 'research-competitors',
    name: 'Competitor analysis request',
    description:
      'User wants competitive analysis for a specific domain. ' +
      'Should use research agent.',
    userMessage: 'Analyze the main competitors in the project management software space',
    expectedTarget: 'research',
    expectedTools: {
      required: ['research.core.agent'],
      shouldStartWith: ['research.core.agent'],
      minSteps: 1,
      maxSteps: 2
    },
    expectedConfidence: [0.8, 1.0],
    expectWarnings: false,
    expectClarifications: false,
    tags: ['research', 'competitor-analysis']
  }
]

/**
 * =====================================================
 * CATEGORY 5: Complex Multi-Artifact Workflows
 * =====================================================
 * These scenarios test workflows requiring multiple artifacts.
 */
export const COMPLEX_WORKFLOW_SCENARIOS: TestScenario[] = [
  {
    id: 'full-product-definition',
    name: 'Complete product definition workflow',
    description:
      'User asks for comprehensive product documentation including research, ' +
      'personas, and PRD. Should chain multiple tools.',
    userMessage:
      'Help me define a new product: research the online education market, ' +
      'create user personas, and then write a PRD for a platform that helps ' +
      'working professionals learn new skills',
    expectedTarget: 'prd',
    expectedTools: {
      required: ['research.core.agent', 'persona.builder', 'prd.analyze-context'],
      shouldStartWith: ['research.core.agent'],
      minSteps: 3,
      maxSteps: 8
    },
    expectedConfidence: [0.6, 0.9],
    expectWarnings: false,
    expectClarifications: false,
    tags: ['complex', 'multi-artifact', 'full-workflow']
  }
]

/**
 * =====================================================
 * Mock Tool Descriptors for Testing
 * =====================================================
 */
export const MOCK_TOOLS: ToolDescriptor[] = [
  // PRD Skills
  {
    id: 'prd.check-clarification',
    type: 'skill',
    label: 'Check Clarification',
    description: 'Checks if clarification is needed from the user',
    inputArtifacts: ['prompt'],
    outputArtifact: 'prd',
    capabilities: ['clarification', 'validation']
  },
  {
    id: 'prd.analyze-context',
    type: 'skill',
    label: 'Analyze Context',
    description: 'Analyzes the product context and extracts key information',
    inputArtifacts: ['prompt', 'prd'],
    outputArtifact: 'prd',
    capabilities: ['analyzer', 'analyze']
  },
  {
    id: 'prd.write-overview',
    type: 'skill',
    label: 'Write Overview',
    description: 'Writes the product overview section',
    inputArtifacts: ['prompt', 'prd'],
    outputArtifact: 'prd',
    capabilities: ['section-writer', 'write-overview']
  },
  {
    id: 'prd.write-goals',
    type: 'skill',
    label: 'Write Goals',
    description: 'Writes the goals and objectives section',
    inputArtifacts: ['prompt', 'prd'],
    outputArtifact: 'prd',
    capabilities: ['section-writer', 'write-goals']
  },
  {
    id: 'prd.write-user-stories',
    type: 'skill',
    label: 'Write User Stories',
    description: 'Writes user stories section',
    inputArtifacts: ['prompt', 'prd'],
    outputArtifact: 'prd',
    capabilities: ['section-writer', 'write-user-stories']
  },
  {
    id: 'prd.assemble-prd',
    type: 'skill',
    label: 'Assemble PRD',
    description: 'Assembles the final PRD from all sections',
    inputArtifacts: ['prd'],
    outputArtifact: 'prd',
    capabilities: ['assembler', 'assemble']
  },
  // Subagents
  {
    id: 'research.core.agent',
    type: 'subagent',
    label: 'Research Agent',
    description: 'Conducts market research, competitor analysis, and gathers context',
    inputArtifacts: [],
    outputArtifact: 'research',
    capabilities: ['research', 'search', 'analyze', 'synthesize']
  },
  {
    id: 'persona.builder',
    type: 'subagent',
    label: 'Persona Builder',
    description: 'Creates detailed user personas based on research and context',
    inputArtifacts: ['research', 'prd'],
    outputArtifact: 'persona',
    capabilities: ['persona', 'user-research', 'synthesis']
  }
]

/**
 * Helper to create OrchestratorInput from a scenario
 */
export const createOrchestratorInput = (
  scenario: TestScenario,
  existingArtifacts?: Map<ArtifactKind, unknown[]>
): OrchestratorInput => ({
  message: scenario.userMessage,
  existingArtifacts: existingArtifacts ?? new Map(),
  targetArtifact: scenario.expectedTarget
})

/**
 * All scenarios grouped by category
 */
export const ALL_SCENARIOS = [
  ...PRD_SUFFICIENT_CONTEXT_SCENARIOS,
  ...PRD_INSUFFICIENT_CONTEXT_SCENARIOS,
  ...PERSONA_SCENARIOS,
  ...RESEARCH_SCENARIOS,
  ...COMPLEX_WORKFLOW_SCENARIOS
]

/**
 * Scenarios that should trigger research-first behavior
 */
export const RESEARCH_FIRST_SCENARIOS = ALL_SCENARIOS.filter(s =>
  s.tags.includes('research-first')
)

/**
 * Scenarios with sufficient context for direct generation
 */
export const DIRECT_GENERATION_SCENARIOS = ALL_SCENARIOS.filter(s =>
  s.tags.includes('sufficient-context')
)
