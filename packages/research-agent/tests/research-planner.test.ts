import test from 'node:test'
import assert from 'node:assert/strict'

// Test only the contracts/schemas to avoid OpenRouterClient import issues
test('ResearchPlan schema validation', async () => {
  const { ResearchPlanSchema } = await import('../src/contracts/research-plan')

  const validPlan = {
    id: 'plan-123',
    topic: 'Note-taking apps market',
    scope: 'Market analysis for LATAM region',
    objectives: ['Identify competitors', 'Estimate market size'],
    steps: [
      {
        id: 'step-1',
        type: 'market-sizing',
        label: 'Market Overview',
        description: 'Gather market size data',
        queries: ['note taking market size 2024'],
        estimatedSources: 10,
        dependsOn: []
      }
    ],
    status: 'draft',
    createdAt: '2024-12-08T10:00:00.000Z'
  }

  const result = ResearchPlanSchema.safeParse(validPlan)
  assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.errors)}`)
})

test('ResearchStep types are valid', async () => {
  const { ResearchStepTypeSchema } = await import('../src/contracts/research-plan')

  const validTypes = [
    'web-search',
    'competitor-analysis',
    'market-sizing',
    'trend-analysis',
    'user-research-synthesis',
    'regulatory-scan',
    'opportunity-analysis'
  ]

  for (const type of validTypes) {
    const result = ResearchStepTypeSchema.safeParse(type)
    assert.ok(result.success, `Type "${type}" should be valid`)
  }

  const invalidResult = ResearchStepTypeSchema.safeParse('invalid-type')
  assert.ok(!invalidResult.success, 'Invalid type should fail validation')
})

test('ClarificationQuestion schema validation', async () => {
  const { ClarificationQuestionSchema } = await import('../src/contracts/research-plan')

  const validQuestion = {
    id: 'q-1',
    question: 'What region should we focus on?',
    context: 'This helps narrow down the market analysis',
    required: true,
    options: ['North America', 'Europe', 'LATAM', 'APAC']
  }

  const result = ClarificationQuestionSchema.safeParse(validQuestion)
  assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.errors)}`)
})

test('ResearchBuilderParams schema validation', async () => {
  const { ResearchBuilderParamsSchema } = await import('../src/contracts/research-params')

  const validParams = {
    query: 'Research note-taking app market in LATAM',
    industry: 'productivity software',
    region: 'Latin America',
    focusAreas: ['market-size', 'competitors'],
    depth: 'standard',
    maxSources: 25,
    requirePlanConfirmation: true
  }

  const result = ResearchBuilderParamsSchema.safeParse(validParams)
  assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.errors)}`)
})

test('ResearchBuilderParams defaults are applied', async () => {
  const { ResearchBuilderParamsSchema } = await import('../src/contracts/research-params')

  const minimalParams = {
    query: 'Research something'
  }

  const result = ResearchBuilderParamsSchema.parse(minimalParams)

  assert.equal(result.depth, 'standard')
  assert.equal(result.maxSources, 20)
  assert.equal(result.requirePlanConfirmation, true)
})

test('ResearchPlanStatus covers all states', async () => {
  const { ResearchPlanStatusSchema } = await import('../src/contracts/research-plan')

  const validStatuses = [
    'draft',
    'awaiting-confirmation',
    'awaiting-clarification',
    'confirmed',
    'in-progress',
    'completed',
    'failed'
  ]

  for (const status of validStatuses) {
    const result = ResearchPlanStatusSchema.safeParse(status)
    assert.ok(result.success, `Status "${status}" should be valid`)
  }
})

test('ResearchFocusArea values are comprehensive', async () => {
  const { ResearchFocusAreaSchema } = await import('../src/contracts/research-params')

  const validAreas = [
    'market-size',
    'competitors',
    'trends',
    'user-needs',
    'regulations',
    'technology',
    'opportunities'
  ]

  for (const area of validAreas) {
    const result = ResearchFocusAreaSchema.safeParse(area)
    assert.ok(result.success, `Focus area "${area}" should be valid`)
  }
})

test('ResearchDepth values are valid', async () => {
  const { ResearchDepthSchema } = await import('../src/contracts/research-params')

  const validDepths = ['quick', 'standard', 'deep']

  for (const depth of validDepths) {
    const result = ResearchDepthSchema.safeParse(depth)
    assert.ok(result.success, `Depth "${depth}" should be valid`)
  }
})
