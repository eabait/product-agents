import test from 'node:test'
import assert from 'node:assert/strict'

import { LLMOrchestrator, createLLMOrchestrator } from '../../src/orchestrator/llm-orchestrator'
import { SkillCatalog } from '../../src/planner/skill-catalog'
import { SubagentRegistry } from '../../src/subagents/subagent-registry'
import { getDefaultProductAgentConfig } from '../../src/config/product-agent.config'
import type { OrchestratorInput, OrchestratorPlanProposal } from '../../src/contracts/orchestrator'
import type { SubagentManifest } from '../../src/contracts/subagent'
import {
  MOCK_TOOLS,
  ALL_SCENARIOS,
  RESEARCH_FIRST_SCENARIOS,
  DIRECT_GENERATION_SCENARIOS,
  type TestScenario,
  type ExpectedToolUsage
} from './scenarios'

const fixedClock = () => new Date('2024-01-15T10:00:00.000Z')

/**
 * Mock subagent manifests for testing
 */
const MOCK_SUBAGENT_MANIFESTS: SubagentManifest[] = [
  {
    id: 'research.core.agent',
    label: 'Research Agent',
    version: '1.0.0',
    package: '@product-agents/research-agent',
    entry: '@product-agents/research-agent',
    creates: 'research',
    consumes: [],
    capabilities: ['research', 'search', 'analyze'],
    description: 'Conducts market research and competitive analysis'
  },
  {
    id: 'persona.builder',
    label: 'Persona Builder',
    version: '1.0.0',
    package: '@product-agents/persona-agent',
    entry: '@product-agents/persona-agent',
    creates: 'persona',
    consumes: ['research', 'prd'],
    capabilities: ['persona', 'user-research'],
    description: 'Creates detailed user personas'
  }
]

/**
 * Create a mock text generator that returns predefined responses
 */
const createMockTextGenerator = (response: string) => {
  return async () => ({ text: response })
}

/**
 * Create a mock response for a given scenario that follows expected patterns
 */
const createMockPlanResponse = (scenario: TestScenario): string => {
  const steps: Array<{
    id: string
    toolId: string
    toolType: string
    label: string
    rationale: string
    dependsOn: string[]
    outputArtifact?: string
  }> = []

  // Build steps based on expected tool usage
  const { required, shouldStartWith } = scenario.expectedTools

  // Add steps that should come first
  if (shouldStartWith) {
    shouldStartWith.forEach((toolId, index) => {
      const tool = MOCK_TOOLS.find(t => t.id === toolId)
      steps.push({
        id: `step-${index + 1}`,
        toolId,
        toolType: tool?.type ?? 'skill',
        label: tool?.label ?? toolId,
        rationale: `Required first step for ${scenario.name}`,
        dependsOn: index > 0 ? [`step-${index}`] : [],
        outputArtifact: tool?.outputArtifact
      })
    })
  }

  // Add remaining required steps
  required
    .filter(toolId => !shouldStartWith?.includes(toolId))
    .forEach((toolId, index) => {
      const tool = MOCK_TOOLS.find(t => t.id === toolId)
      const stepNumber = steps.length + 1
      steps.push({
        id: `step-${stepNumber}`,
        toolId,
        toolType: tool?.type ?? 'skill',
        label: tool?.label ?? toolId,
        rationale: `Required step for ${scenario.name}`,
        dependsOn: steps.length > 0 ? [`step-${steps.length}`] : [],
        outputArtifact: tool?.outputArtifact
      })
    })

  // Generate clarifications based on expectations
  const clarifications: string[] = []
  if (scenario.expectClarifications) {
    const minClarifications = Math.max(scenario.expectMinClarifications ?? 1, 3)
    const clarificationTemplates = [
      'What specific market or industry is this product targeting?',
      'What problem or pain point will this product solve?',
      'Who are the intended users or target audience?',
      'Are there any similar products or competitors you\'re aware of?',
      'What makes this product unique?'
    ]
    clarifications.push(...clarificationTemplates.slice(0, minClarifications))
  }

  const response = {
    targetArtifact: scenario.expectedTarget,
    overallRationale: `Plan for: ${scenario.name}`,
    confidence: (scenario.expectedConfidence[0] + scenario.expectedConfidence[1]) / 2,
    warnings: scenario.expectWarnings ? ['Limited context provided'] : [],
    clarifications,
    steps
  }

  return JSON.stringify(response)
}

/**
 * Create test fixtures for orchestrator tests
 */
const createTestFixtures = (mockResponse?: string) => {
  const config = getDefaultProductAgentConfig()
  config.runtime.defaultModel = 'test-model'

  // Create a minimal skill catalog
  const skillCatalog = new SkillCatalog([{ id: 'prd-skill-pack', version: '1.0.0' }])

  // Override listSkills to return mock skills
  ;(skillCatalog as any).loaded = true
  ;(skillCatalog as any).skills = new Map(
    MOCK_TOOLS.filter(t => t.type === 'skill').map(t => [
      t.id,
      {
        id: t.id,
        label: t.label,
        version: '1.0.0',
        category: t.capabilities[0] ?? 'general',
        description: t.description,
        packId: 'prd-skill-pack'
      }
    ])
  )

  // Create subagent registry with mock manifests
  const subagentRegistry = new SubagentRegistry(
    MOCK_SUBAGENT_MANIFESTS.map(manifest => ({
      manifest,
      loader: async () => ({
        createSubagent: () => ({
          metadata: { id: manifest.id, label: manifest.label, version: manifest.version, artifactKind: manifest.creates, sourceKinds: manifest.consumes },
          execute: async () => ({ artifact: { id: 'mock', kind: manifest.creates, version: '1.0', data: {} } })
        })
      })
    }))
  )

  // Mock provider factory - returns a function that mimics the OpenRouter provider
  // The provider is called with a model ID and returns a model object
  const providerFactory = () => ((modelId: string) => ({ modelId })) as any

  // Default mock response
  const defaultResponse = JSON.stringify({
    targetArtifact: 'prd',
    overallRationale: 'Default test plan',
    confidence: 0.8,
    steps: [
      { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill', label: 'Analyze', rationale: 'Test', dependsOn: [] }
    ]
  })

  const textGenerator = createMockTextGenerator(mockResponse ?? defaultResponse)

  return {
    config,
    skillCatalog,
    subagentRegistry,
    providerFactory,
    textGenerator
  }
}

/**
 * Validate a plan proposal against expected tool usage
 */
const validatePlanAgainstExpectations = (
  proposal: OrchestratorPlanProposal,
  expected: ExpectedToolUsage,
  scenarioName: string
): void => {
  const stepToolIds = proposal.steps.map(s => s.toolId)

  // Check required tools are present
  for (const required of expected.required) {
    assert.ok(
      stepToolIds.includes(required),
      `[${scenarioName}] Missing required tool: ${required}. Got: ${stepToolIds.join(', ')}`
    )
  }

  // Check tools that should start the plan
  if (expected.shouldStartWith && expected.shouldStartWith.length > 0) {
    const firstToolId = stepToolIds[0]
    assert.ok(
      expected.shouldStartWith.includes(firstToolId),
      `[${scenarioName}] Plan should start with one of: ${expected.shouldStartWith.join(', ')}. Got: ${firstToolId}`
    )
  }

  // Check forbidden tools are absent
  if (expected.forbidden) {
    for (const forbidden of expected.forbidden) {
      assert.ok(
        !stepToolIds.includes(forbidden),
        `[${scenarioName}] Forbidden tool present: ${forbidden}`
      )
    }
  }

  // Check step count bounds
  if (expected.minSteps !== undefined) {
    assert.ok(
      proposal.steps.length >= expected.minSteps,
      `[${scenarioName}] Too few steps: ${proposal.steps.length} < ${expected.minSteps}`
    )
  }
  if (expected.maxSteps !== undefined) {
    assert.ok(
      proposal.steps.length <= expected.maxSteps,
      `[${scenarioName}] Too many steps: ${proposal.steps.length} > ${expected.maxSteps}`
    )
  }
}

test('LLMOrchestrator', async (t) => {
  await t.test('discoverTools', async (t) => {
    await t.test('discovers both skills and subagents', async () => {
      const fixtures = createTestFixtures()
      const orchestrator = createLLMOrchestrator({
        config: fixtures.config,
        skillCatalog: fixtures.skillCatalog,
        subagentRegistry: fixtures.subagentRegistry,
        providerFactory: fixtures.providerFactory,
        textGenerator: fixtures.textGenerator as any,
        clock: fixedClock
      })

      const tools = await orchestrator.discoverTools()

      const skillCount = tools.filter(t => t.type === 'skill').length
      const subagentCount = tools.filter(t => t.type === 'subagent').length

      assert.ok(skillCount > 0, 'Should discover skills')
      assert.ok(subagentCount > 0, 'Should discover subagents')

      // Verify specific tools
      const researchAgent = tools.find(t => t.id === 'research.core.agent')
      assert.ok(researchAgent, 'Should discover research.core.agent')
      assert.equal(researchAgent?.type, 'subagent')

      const analyzeContext = tools.find(t => t.id === 'prd.analyze-context')
      assert.ok(analyzeContext, 'Should discover prd.analyze-context')
      assert.equal(analyzeContext?.type, 'skill')
    })
  })

  await t.test('propose', async (t) => {
    await t.test('generates valid plan proposal', async () => {
      const mockResponse = JSON.stringify({
        targetArtifact: 'prd',
        overallRationale: 'Generate PRD for task management app',
        confidence: 0.9,
        steps: [
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill', label: 'Analyze Context', rationale: 'Extract key info', dependsOn: [] }
        ]
      })

      const fixtures = createTestFixtures(mockResponse)
      const orchestrator = createLLMOrchestrator({
        config: fixtures.config,
        skillCatalog: fixtures.skillCatalog,
        subagentRegistry: fixtures.subagentRegistry,
        providerFactory: fixtures.providerFactory,
        textGenerator: fixtures.textGenerator as any,
        clock: fixedClock
      })

      const input: OrchestratorInput = {
        message: 'Create a PRD for a task management app for remote teams',
        existingArtifacts: new Map()
      }

      const proposal = await orchestrator.propose(input)

      assert.ok(proposal.plan)
      assert.equal(proposal.targetArtifact, 'prd')
      assert.equal(proposal.steps.length, 1)
      assert.ok(proposal.confidence >= 0 && proposal.confidence <= 1)
      assert.ok(proposal.overallRationale.length > 0)
    })

    await t.test('includes warnings and clarifications when present', async () => {
      const mockResponse = JSON.stringify({
        targetArtifact: 'prd',
        overallRationale: 'Plan with limited context',
        confidence: 0.5,
        warnings: ['Limited context provided'],
        clarifications: [
          'Who is your target audience?',
          'What market or region should we focus on?',
          'How will this product differentiate?'
        ],
        steps: [
          { id: 'step-1', toolId: 'research.core.agent', toolType: 'subagent', label: 'Research', rationale: 'Gather context', dependsOn: [] }
        ]
      })

      const fixtures = createTestFixtures(mockResponse)
      const orchestrator = createLLMOrchestrator({
        config: fixtures.config,
        skillCatalog: fixtures.skillCatalog,
        subagentRegistry: fixtures.subagentRegistry,
        providerFactory: fixtures.providerFactory,
        textGenerator: fixtures.textGenerator as any,
        clock: fixedClock
      })

      const input: OrchestratorInput = {
        message: 'Create a PRD for a new app',
        existingArtifacts: new Map()
      }

      const proposal = await orchestrator.propose(input)

      assert.ok(proposal.warnings)
      assert.ok(proposal.warnings.some(w => w.includes('Limited context')))
      assert.ok(proposal.suggestedClarifications)
      assert.ok(proposal.suggestedClarifications.length >= 1)
    })

    await t.test('handles subagent steps correctly', async () => {
      const mockResponse = JSON.stringify({
        targetArtifact: 'persona',
        overallRationale: 'Research then build personas',
        confidence: 0.75,
        steps: [
          { id: 'step-1', toolId: 'research.core.agent', toolType: 'subagent', label: 'Research Market', rationale: 'Need market data', dependsOn: [], outputArtifact: 'research' },
          { id: 'step-2', toolId: 'persona.builder', toolType: 'subagent', label: 'Build Personas', rationale: 'Create from research', dependsOn: ['step-1'], outputArtifact: 'persona' }
        ]
      })

      const fixtures = createTestFixtures(mockResponse)
      const orchestrator = createLLMOrchestrator({
        config: fixtures.config,
        skillCatalog: fixtures.skillCatalog,
        subagentRegistry: fixtures.subagentRegistry,
        providerFactory: fixtures.providerFactory,
        textGenerator: fixtures.textGenerator as any,
        clock: fixedClock
      })

      const input: OrchestratorInput = {
        message: 'Create personas for my fitness app',
        existingArtifacts: new Map()
      }

      const proposal = await orchestrator.propose(input)

      assert.equal(proposal.steps.length, 2)
      assert.equal(proposal.steps[0].toolType, 'subagent')
      assert.equal(proposal.steps[1].toolType, 'subagent')
      assert.deepEqual(proposal.steps[1].dependsOn, ['step-1'])
    })
  })

  await t.test('refine', async (t) => {
    await t.test('refines plan based on feedback', async () => {
      // First proposal
      const initialResponse = JSON.stringify({
        targetArtifact: 'prd',
        overallRationale: 'Direct PRD generation',
        confidence: 0.8,
        steps: [
          { id: 'step-1', toolId: 'prd.analyze-context', toolType: 'skill', label: 'Analyze', rationale: 'Start with analysis', dependsOn: [] }
        ]
      })

      // Refined proposal with research
      const refinedResponse = JSON.stringify({
        targetArtifact: 'prd',
        overallRationale: 'Research first, then PRD',
        confidence: 0.85,
        clarifications: [
          'Who are the primary users?',
          'Which market segment?',
          'What differentiates the product?'
        ],
        steps: [
          { id: 'step-1', toolId: 'research.core.agent', toolType: 'subagent', label: 'Research', rationale: 'Added per user feedback', dependsOn: [] },
          { id: 'step-2', toolId: 'prd.analyze-context', toolType: 'skill', label: 'Analyze', rationale: 'Process research', dependsOn: ['step-1'] }
        ]
      })

      let callCount = 0
      const mockGenerator = async () => {
        callCount++
        return { text: callCount === 1 ? initialResponse : refinedResponse }
      }

      const fixtures = createTestFixtures()
      const orchestrator = createLLMOrchestrator({
        config: fixtures.config,
        skillCatalog: fixtures.skillCatalog,
        subagentRegistry: fixtures.subagentRegistry,
        providerFactory: fixtures.providerFactory,
        textGenerator: mockGenerator as any,
        clock: fixedClock
      })

      const input: OrchestratorInput = {
        message: 'Create a PRD',
        existingArtifacts: new Map()
      }

      const initialProposal = await orchestrator.propose(input)
      assert.equal(initialProposal.steps.length, 1)

      const refinedProposal = await orchestrator.refine({
        currentPlan: initialProposal.plan,
        currentSteps: initialProposal.steps,
        feedback: 'Please add a research step first',
        originalInput: input
      })

      assert.equal(refinedProposal.steps.length, 2)
      assert.equal(refinedProposal.steps[0].toolId, 'research.core.agent')
    })

    await t.test('refines vague plan with domain context to propose research', async () => {
      // Initial vague request - returns clarifications
      const initialResponse = JSON.stringify({
        targetArtifact: 'prd',
        overallRationale: 'Too vague - need basic context first',
        confidence: 0.3,
        warnings: ['Extremely limited context'],
        clarifications: [
          'What specific market or industry is this SaaS product targeting?',
          'What problem or pain point will this product solve?',
          'Who are the intended users or target audience?'
        ],
        steps: []
      })

      // User provides domain context - now specific enough for research
      const refinedResponse = JSON.stringify({
        targetArtifact: 'prd',
        overallRationale: 'User provided healthcare domain context. Now specific enough to research the healthcare care coordination market before building PRD.',
        confidence: 0.7,
        clarifications: [
          'Who are the primary users?',
          'Which market segment?',
          'What differentiates the product?'
        ],
        steps: [
          { id: 'step-1', toolId: 'research.core.agent', toolType: 'subagent', label: 'Research healthcare market', rationale: 'Gather competitive and market context', dependsOn: [], outputArtifact: 'research' },
          { id: 'step-2', toolId: 'prd.analyze-context', toolType: 'skill', label: 'Analyze context', rationale: 'Process research insights', dependsOn: ['step-1'], outputArtifact: 'prd' }
        ]
      })

      let callCount = 0
      const mockGenerator = async () => {
        callCount++
        return { text: callCount === 1 ? initialResponse : refinedResponse }
      }

      const fixtures = createTestFixtures()
      const orchestrator = createLLMOrchestrator({
        config: fixtures.config,
        skillCatalog: fixtures.skillCatalog,
        subagentRegistry: fixtures.subagentRegistry,
        providerFactory: fixtures.providerFactory,
        textGenerator: mockGenerator as any,
        clock: fixedClock
      })

      const input: OrchestratorInput = {
        message: 'I need a PRD for a new SaaS product',
        existingArtifacts: new Map()
      }

      // Initial proposal should have clarifications
      const initialProposal = await orchestrator.propose(input)
      assert.equal(initialProposal.steps.length, 0, 'Initial plan should have no steps')
      assert.ok(initialProposal.suggestedClarifications && initialProposal.suggestedClarifications.length >= 3, 'Should have clarifications')
      assert.ok(initialProposal.confidence <= 0.5, 'Should have low confidence')

      // User provides domain context
      const refinedProposal = await orchestrator.refine({
        currentPlan: initialProposal.plan,
        currentSteps: initialProposal.steps,
        feedback: "It's for healthcare teams managing patient data and coordinating care across departments.",
        originalInput: input
      })

      // Refined plan should now propose research
      assert.equal(refinedProposal.steps.length, 2, 'Refined plan should have steps')
      assert.equal(refinedProposal.steps[0].toolId, 'research.core.agent', 'First step should be research')
      assert.ok(refinedProposal.confidence > 0.5, 'Confidence should increase with domain context')
      assert.ok(
        (refinedProposal.suggestedClarifications?.length ?? 0) >= 3,
        'Should keep clarifications when starting with research'
      )
    })
  })

  await t.test('factory function', async (t) => {
    await t.test('creates orchestrator instance', () => {
      const fixtures = createTestFixtures()
      const orchestrator = createLLMOrchestrator({
        config: fixtures.config,
        skillCatalog: fixtures.skillCatalog,
        subagentRegistry: fixtures.subagentRegistry
      })

      assert.ok(orchestrator instanceof LLMOrchestrator)
    })
  })
})

/**
 * Scenario-based tests that validate orchestrator behavior
 * against predefined use case scenarios
 */
test('LLMOrchestrator Scenarios', async (t) => {
  await t.test('PRD with sufficient context', async (t) => {
    for (const scenario of DIRECT_GENERATION_SCENARIOS.filter(s => s.tags.includes('prd'))) {
      await t.test(scenario.name, async () => {
        const mockResponse = createMockPlanResponse(scenario)
        const fixtures = createTestFixtures(mockResponse)
        const orchestrator = createLLMOrchestrator({
          config: fixtures.config,
          skillCatalog: fixtures.skillCatalog,
          subagentRegistry: fixtures.subagentRegistry,
          providerFactory: fixtures.providerFactory,
          textGenerator: fixtures.textGenerator as any,
          clock: fixedClock
        })

        const input: OrchestratorInput = {
          message: scenario.userMessage,
          existingArtifacts: new Map(),
          targetArtifact: scenario.expectedTarget
        }

        const proposal = await orchestrator.propose(input)

        // Validate target artifact
        assert.equal(
          proposal.targetArtifact,
          scenario.expectedTarget,
          `Target should be ${scenario.expectedTarget}`
        )

        // Validate tool usage
        validatePlanAgainstExpectations(proposal, scenario.expectedTools, scenario.name)

        // Validate confidence range
        assert.ok(
          proposal.confidence >= scenario.expectedConfidence[0],
          `Confidence ${proposal.confidence} should be >= ${scenario.expectedConfidence[0]}`
        )
        assert.ok(
          proposal.confidence <= scenario.expectedConfidence[1],
          `Confidence ${proposal.confidence} should be <= ${scenario.expectedConfidence[1]}`
        )
      })
    }
  })

  await t.test('PRD with insufficient context (research-first)', async (t) => {
    for (const scenario of RESEARCH_FIRST_SCENARIOS.filter(s => s.tags.includes('prd'))) {
      await t.test(scenario.name, async () => {
        const mockResponse = createMockPlanResponse(scenario)
        const fixtures = createTestFixtures(mockResponse)
        const orchestrator = createLLMOrchestrator({
          config: fixtures.config,
          skillCatalog: fixtures.skillCatalog,
          subagentRegistry: fixtures.subagentRegistry,
          providerFactory: fixtures.providerFactory,
          textGenerator: fixtures.textGenerator as any,
          clock: fixedClock
        })

        const input: OrchestratorInput = {
          message: scenario.userMessage,
          existingArtifacts: new Map(),
          targetArtifact: scenario.expectedTarget
        }

        const proposal = await orchestrator.propose(input)

        // Should start with research
        validatePlanAgainstExpectations(proposal, scenario.expectedTools, scenario.name)

        // Should have warnings for vague requests
        if (scenario.expectWarnings) {
          assert.ok(
            proposal.warnings && proposal.warnings.length > 0,
            `[${scenario.name}] Should have warnings for insufficient context`
          )
        }

        // Should suggest clarifications
        if (scenario.expectClarifications) {
          const minClarifications = Math.max(scenario.expectMinClarifications ?? 1, 3)
          assert.ok(
            proposal.suggestedClarifications &&
              proposal.suggestedClarifications.length >= minClarifications,
            `[${scenario.name}] Should suggest at least ${minClarifications} clarifications`
          )
        }
      })
    }
  })

  await t.test('Extremely vague requests (clarification-required)', async (t) => {
    for (const scenario of ALL_SCENARIOS.filter(s => s.tags.includes('clarification-required'))) {
      await t.test(scenario.name, async () => {
        const mockResponse = createMockPlanResponse(scenario)
        const fixtures = createTestFixtures(mockResponse)
        const orchestrator = createLLMOrchestrator({
          config: fixtures.config,
          skillCatalog: fixtures.skillCatalog,
          subagentRegistry: fixtures.subagentRegistry,
          providerFactory: fixtures.providerFactory,
          textGenerator: fixtures.textGenerator as any,
          clock: fixedClock
        })

        const input: OrchestratorInput = {
          message: scenario.userMessage,
          existingArtifacts: new Map(),
          targetArtifact: scenario.expectedTarget
        }

        const proposal = await orchestrator.propose(input)

        // Validate tool usage (should have minimal or no steps)
        validatePlanAgainstExpectations(proposal, scenario.expectedTools, scenario.name)

        // Should have low confidence
        assert.ok(
          proposal.confidence <= 0.5,
          `[${scenario.name}] Should have low confidence for extremely vague request, got ${proposal.confidence}`
        )

        // Should have warnings
        assert.ok(
          proposal.warnings && proposal.warnings.length > 0,
          `[${scenario.name}] Should have warnings for insufficient context`
        )

        // Should have clarifications
        assert.ok(
          proposal.suggestedClarifications &&
            proposal.suggestedClarifications.length >= Math.max(scenario.expectMinClarifications ?? 1, 3),
          `[${scenario.name}] Should suggest at least ${Math.max(scenario.expectMinClarifications ?? 1, 3)} clarifications`
        )
      })
    }
  })

  await t.test('Persona scenarios', async (t) => {
    for (const scenario of ALL_SCENARIOS.filter(s => s.tags.includes('persona'))) {
      await t.test(scenario.name, async () => {
        const mockResponse = createMockPlanResponse(scenario)
        const fixtures = createTestFixtures(mockResponse)
        const orchestrator = createLLMOrchestrator({
          config: fixtures.config,
          skillCatalog: fixtures.skillCatalog,
          subagentRegistry: fixtures.subagentRegistry,
          providerFactory: fixtures.providerFactory,
          textGenerator: fixtures.textGenerator as any,
          clock: fixedClock
        })

        const input: OrchestratorInput = {
          message: scenario.userMessage,
          existingArtifacts: new Map(),
          targetArtifact: scenario.expectedTarget
        }

        const proposal = await orchestrator.propose(input)

        assert.equal(proposal.targetArtifact, 'persona')
        validatePlanAgainstExpectations(proposal, scenario.expectedTools, scenario.name)
      })
    }
  })

  await t.test('Research scenarios', async (t) => {
    for (const scenario of ALL_SCENARIOS.filter(s => s.tags.includes('research'))) {
      await t.test(scenario.name, async () => {
        const mockResponse = createMockPlanResponse(scenario)
        const fixtures = createTestFixtures(mockResponse)
        const orchestrator = createLLMOrchestrator({
          config: fixtures.config,
          skillCatalog: fixtures.skillCatalog,
          subagentRegistry: fixtures.subagentRegistry,
          providerFactory: fixtures.providerFactory,
          textGenerator: fixtures.textGenerator as any,
          clock: fixedClock
        })

        const input: OrchestratorInput = {
          message: scenario.userMessage,
          existingArtifacts: new Map(),
          targetArtifact: scenario.expectedTarget
        }

        const proposal = await orchestrator.propose(input)

        assert.equal(proposal.targetArtifact, 'research')
        validatePlanAgainstExpectations(proposal, scenario.expectedTools, scenario.name)

        // Research requests should have high confidence
        assert.ok(
          proposal.confidence >= 0.8,
          `Direct research request should have high confidence, got ${proposal.confidence}`
        )
      })
    }
  })

  await t.test('Complex multi-artifact workflows', async (t) => {
    for (const scenario of ALL_SCENARIOS.filter(s => s.tags.includes('complex'))) {
      await t.test(scenario.name, async () => {
        const mockResponse = createMockPlanResponse(scenario)
        const fixtures = createTestFixtures(mockResponse)
        const orchestrator = createLLMOrchestrator({
          config: fixtures.config,
          skillCatalog: fixtures.skillCatalog,
          subagentRegistry: fixtures.subagentRegistry,
          providerFactory: fixtures.providerFactory,
          textGenerator: fixtures.textGenerator as any,
          clock: fixedClock
        })

        const input: OrchestratorInput = {
          message: scenario.userMessage,
          existingArtifacts: new Map(),
          targetArtifact: scenario.expectedTarget
        }

        const proposal = await orchestrator.propose(input)

        validatePlanAgainstExpectations(proposal, scenario.expectedTools, scenario.name)

        // Complex workflows should have multiple steps
        assert.ok(
          proposal.steps.length >= 3,
          `Complex workflow should have multiple steps, got ${proposal.steps.length}`
        )

        // Verify dependency chain makes sense
        const hasResearch = proposal.steps.some(s => s.toolId === 'research.core.agent')
        const hasPersona = proposal.steps.some(s => s.toolId === 'persona.builder')

        if (hasResearch && hasPersona) {
          const researchStep = proposal.steps.find(s => s.toolId === 'research.core.agent')!
          const personaStep = proposal.steps.find(s => s.toolId === 'persona.builder')!

          // Persona should depend on research (directly or transitively)
          const researchIndex = proposal.steps.indexOf(researchStep)
          const personaIndex = proposal.steps.indexOf(personaStep)
          assert.ok(
            researchIndex < personaIndex,
            'Research should come before persona in the plan'
          )
        }
      })
    }
  })
})
