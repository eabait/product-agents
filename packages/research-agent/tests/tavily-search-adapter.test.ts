import test from 'node:test'
import assert from 'node:assert/strict'
import { TavilySearchAdapter, createTavilySearchAdapter } from '../src/executor/tavily-search-adapter'

test('TavilySearchAdapter requires API key', () => {
  assert.throws(
    () => new TavilySearchAdapter({ apiKey: '' }),
    /API key is required/
  )
})

test('TavilySearchAdapter initializes with valid API key', () => {
  const adapter = new TavilySearchAdapter({ apiKey: 'tvly-test-key' })
  assert.ok(adapter)
  assert.equal(adapter.getProviderName(), 'tavily')
})

test('createTavilySearchAdapter factory with string', () => {
  const adapter = createTavilySearchAdapter('tvly-test-key')
  assert.ok(adapter instanceof TavilySearchAdapter)
  assert.equal(adapter.getProviderName(), 'tavily')
})

test('createTavilySearchAdapter factory with options', () => {
  const adapter = createTavilySearchAdapter({
    apiKey: 'tvly-test-key',
    defaultSearchDepth: 'basic',
    defaultMaxResults: 5,
    timeout: 15000
  })
  assert.ok(adapter instanceof TavilySearchAdapter)
})

test('TavilySearchAdapter handles empty query', async () => {
  const adapter = new TavilySearchAdapter({ apiKey: 'tvly-test-key' })

  const results = await adapter.search('')
  assert.deepEqual(results, [])

  const results2 = await adapter.search('   ')
  assert.deepEqual(results2, [])
})
