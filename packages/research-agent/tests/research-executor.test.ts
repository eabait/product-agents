import test from 'node:test'
import assert from 'node:assert/strict'
import { ResearchExecutor } from '../src/executor/research-executor'
import type { WebSearchAdapter, WebSearchResult } from '../src/executor/web-search-types'
import type { ResearchPlan } from '../src/contracts/research-plan'

class MockWebSearchAdapter implements WebSearchAdapter {
  private callCount = 0
  public searchedQueries: string[] = []

  async search(query: string): Promise<WebSearchResult[]> {
    this.searchedQueries.push(query)
    this.callCount++

    return [
      {
        url: `https://example.com/result-${this.callCount}`,
        title: `Result for: ${query}`,
        content: `Content about ${query} from source ${this.callCount}`,
        score: 0.9 - this.callCount * 0.1,
        retrievedAt: new Date().toISOString()
      }
    ]
  }

  getProviderName(): string {
    return 'mock'
  }
}

const createTestPlan = (): ResearchPlan => ({
  id: 'test-plan-1',
  topic: 'Test Research',
  scope: 'Test scope',
  objectives: ['Test objective'],
  steps: [
    {
      id: 'step-1',
      type: 'web-search',
      label: 'First Step',
      description: 'First search step',
      queries: ['query 1', 'query 2'],
      estimatedSources: 5,
      dependsOn: []
    },
    {
      id: 'step-2',
      type: 'competitor-analysis',
      label: 'Second Step',
      description: 'Depends on first',
      queries: ['competitor query'],
      estimatedSources: 3,
      dependsOn: ['step-1']
    }
  ],
  status: 'confirmed',
  createdAt: new Date().toISOString()
})

test('ResearchExecutor executes steps in order', async () => {
  const adapter = new MockWebSearchAdapter()
  const executor = new ResearchExecutor({ webSearchAdapter: adapter })
  const plan = createTestPlan()

  const result = await executor.execute(plan)

  assert.equal(result.planId, 'test-plan-1')
  assert.equal(result.stepResults.length, 2)
  assert.ok(result.totalExecutionTimeMs > 0)
})

test('ResearchExecutor respects step dependencies', async () => {
  const adapter = new MockWebSearchAdapter()
  const executor = new ResearchExecutor({ webSearchAdapter: adapter })
  const plan = createTestPlan()

  const stepOrder: string[] = []

  await executor.execute(plan, {
    onStepStarted: step => stepOrder.push(step.id)
  })

  assert.deepEqual(stepOrder, ['step-1', 'step-2'])
})

test('ResearchExecutor collects unique sources', async () => {
  const adapter = new MockWebSearchAdapter()
  const executor = new ResearchExecutor({ webSearchAdapter: adapter })
  const plan = createTestPlan()

  const result = await executor.execute(plan)

  // Each query returns 1 result, 3 queries total
  assert.equal(adapter.searchedQueries.length, 3)
  assert.ok(result.allSources.length > 0)
  assert.ok(result.uniqueSourcesCount <= result.totalSourcesCollected)
})

test('ResearchExecutor emits progress events', async () => {
  const adapter = new MockWebSearchAdapter()
  const executor = new ResearchExecutor({ webSearchAdapter: adapter })
  const plan = createTestPlan()

  const events: string[] = []

  await executor.execute(plan, {
    onStepStarted: step => events.push(`started:${step.id}`),
    onStepCompleted: step => events.push(`completed:${step.id}`)
  })

  assert.ok(events.includes('started:step-1'))
  assert.ok(events.includes('completed:step-1'))
  assert.ok(events.includes('started:step-2'))
  assert.ok(events.includes('completed:step-2'))
})

test('ResearchExecutor respects maxTotalSources limit', async () => {
  const adapter = new MockWebSearchAdapter()
  const executor = new ResearchExecutor({ webSearchAdapter: adapter })
  const plan = createTestPlan()

  const result = await executor.execute(plan, {
    maxTotalSources: 2
  })

  assert.ok(result.allSources.length <= 2)
})

test('ResearchExecutor handles circular dependency detection', async () => {
  const adapter = new MockWebSearchAdapter()
  const executor = new ResearchExecutor({ webSearchAdapter: adapter })

  const circularPlan: ResearchPlan = {
    id: 'circular-plan',
    topic: 'Test',
    scope: 'Test',
    objectives: [],
    steps: [
      {
        id: 'step-a',
        type: 'web-search',
        label: 'Step A',
        description: 'Depends on B',
        queries: ['a'],
        dependsOn: ['step-b']
      },
      {
        id: 'step-b',
        type: 'web-search',
        label: 'Step B',
        description: 'Depends on A',
        queries: ['b'],
        dependsOn: ['step-a']
      }
    ],
    status: 'confirmed',
    createdAt: new Date().toISOString()
  }

  await assert.rejects(
    () => executor.execute(circularPlan),
    /Circular dependency/
  )
})
