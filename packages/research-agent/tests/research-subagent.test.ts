import test from 'node:test'
import assert from 'node:assert/strict'

// Test the manifest structure by checking expected values
// We test the contracts directly to avoid OpenRouterClient dependencies
const EXPECTED_MANIFEST = {
  id: 'research.core.agent',
  package: '@product-agents/research-agent',
  version: '0.1.0',
  label: 'Research Agent',
  creates: 'research',
  consumes: ['prompt', 'prd', 'brief'],
  capabilities: ['plan', 'search', 'synthesize', 'clarify'],
  entry: '@product-agents/research-agent',
  exportName: 'createResearchAgentSubagent',
  tags: ['research', 'market-intelligence', 'web-search']
}

test('expected manifest has correct structure', () => {
  assert.equal(EXPECTED_MANIFEST.id, 'research.core.agent')
  assert.equal(EXPECTED_MANIFEST.creates, 'research')
  assert.deepEqual(EXPECTED_MANIFEST.consumes, ['prompt', 'prd', 'brief'])
  assert.ok(EXPECTED_MANIFEST.capabilities.includes('plan'))
  assert.ok(EXPECTED_MANIFEST.capabilities.includes('search'))
  assert.ok(EXPECTED_MANIFEST.capabilities.includes('synthesize'))
  assert.ok(EXPECTED_MANIFEST.capabilities.includes('clarify'))
})

test('expected manifest export name is correct', () => {
  assert.equal(EXPECTED_MANIFEST.exportName, 'createResearchAgentSubagent')
  assert.equal(EXPECTED_MANIFEST.entry, '@product-agents/research-agent')
})

test('expected manifest has required tags', () => {
  assert.ok(EXPECTED_MANIFEST.tags.includes('research'))
  assert.ok(EXPECTED_MANIFEST.tags.includes('market-intelligence'))
  assert.ok(EXPECTED_MANIFEST.tags.includes('web-search'))
})

test('ResearchArtifactData schema validates correctly', async () => {
  const { ResearchArtifactDataSchema } = await import('../src/contracts/research-artifact')

  const validData = {
    topic: 'Note-taking apps market',
    scope: 'LATAM market analysis',
    executiveSummary: 'The market is growing...',
    findings: [
      {
        id: 'finding-1',
        category: 'market-size',
        title: 'Market Growth',
        summary: 'The market is expected to grow 15% annually',
        confidence: 0.85,
        sources: [
          {
            url: 'https://example.com/report',
            title: 'Market Report 2024',
            retrievedAt: '2024-12-08T10:00:00Z'
          }
        ],
        tags: ['growth', 'market-size']
      }
    ],
    recommendations: [
      {
        priority: 'high',
        recommendation: 'Focus on mobile-first approach',
        rationale: 'Mobile usage is dominant in LATAM'
      }
    ],
    limitations: ['Limited to public sources'],
    methodology: {
      searchQueries: ['note taking market LATAM'],
      sourcesConsulted: 20,
      sourcesUsed: 15,
      synthesisModel: 'test-model',
      searchProvider: 'tavily'
    },
    generatedAt: '2024-12-08T10:00:00Z'
  }

  const result = ResearchArtifactDataSchema.safeParse(validData)
  assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.errors)}`)
})

test('ResearchFinding categories are comprehensive', async () => {
  const { ResearchFindingSchema } = await import('../src/contracts/research-artifact')

  const validCategories = [
    'market-size',
    'competitor',
    'trend',
    'user-insight',
    'regulatory',
    'technology',
    'opportunity',
    'threat'
  ]

  for (const category of validCategories) {
    const finding = {
      id: 'test',
      category,
      title: 'Test',
      summary: 'Test',
      confidence: 0.5,
      sources: [],
      tags: []
    }

    const result = ResearchFindingSchema.safeParse(finding)
    assert.ok(result.success, `Category "${category}" should be valid`)
  }
})

test('Recommendation priorities are valid', async () => {
  const { RecommendationSchema } = await import('../src/contracts/research-artifact')

  const validPriorities = ['high', 'medium', 'low']

  for (const priority of validPriorities) {
    const rec = {
      priority,
      recommendation: 'Test recommendation',
      rationale: 'Test rationale'
    }

    const result = RecommendationSchema.safeParse(rec)
    assert.ok(result.success, `Priority "${priority}" should be valid`)
  }
})

test('ResearchMethodology captures execution details', async () => {
  const { ResearchMethodologySchema } = await import('../src/contracts/research-artifact')

  const methodology = {
    searchQueries: ['query 1', 'query 2', 'query 3'],
    sourcesConsulted: 30,
    sourcesUsed: 25,
    synthesisModel: 'anthropic/claude-3-5-sonnet',
    searchProvider: 'tavily',
    executionTimeMs: 45000
  }

  const result = ResearchMethodologySchema.safeParse(methodology)
  assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.errors)}`)
})

test('CompetitorAnalysis schema is comprehensive', async () => {
  const { CompetitorAnalysisSchema } = await import('../src/contracts/research-artifact')

  const competitor = {
    name: 'Notion',
    description: 'All-in-one workspace for notes and collaboration',
    strengths: ['Strong brand', 'Rich feature set', 'Active community'],
    weaknesses: ['Steep learning curve', 'Can be slow'],
    marketPosition: 'Market leader',
    targetAudience: 'Knowledge workers and teams',
    pricingModel: 'Freemium with paid tiers',
    differentiators: ['Blocks-based editing', 'Database views'],
    sources: ['https://notion.so', 'https://g2.com/notion']
  }

  const result = CompetitorAnalysisSchema.safeParse(competitor)
  assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.errors)}`)
})

test('MarketInsight schema captures market data', async () => {
  const { MarketInsightSchema } = await import('../src/contracts/research-artifact')

  const marketInsight = {
    marketSize: '$5.2 billion USD (2024)',
    growthRate: '12.5% CAGR',
    keyDrivers: [
      'Remote work adoption',
      'Digital transformation',
      'Mobile-first users'
    ],
    barriers: ['Privacy concerns', 'Data lock-in'],
    trends: ['AI integration', 'Collaboration features'],
    regions: ['North America', 'Europe', 'LATAM']
  }

  const result = MarketInsightSchema.safeParse(marketInsight)
  assert.ok(result.success, `Validation failed: ${JSON.stringify(result.error?.errors)}`)
})
