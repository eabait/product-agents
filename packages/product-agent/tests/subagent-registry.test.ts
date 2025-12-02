import assert from 'node:assert/strict'
import test from 'node:test'

import type { SubagentManifest } from '../src/contracts/subagent'
import { SubagentRegistry } from '../src/subagents/subagent-registry'

const FIXTURE_ENTRY = new URL('./fixtures/test-subagent-module.ts', import.meta.url).href

const baseManifest: SubagentManifest = {
  id: 'test.subagent',
  package: '@product-agents/test-subagent',
  version: '0.0.1',
  label: 'Test Subagent',
  creates: 'persona',
  consumes: ['prd'],
  capabilities: ['demo'],
  description: 'Fixture manifest for registry tests',
  entry: FIXTURE_ENTRY,
  exportName: 'createTestSubagent',
  tags: ['fixture']
}

test('SubagentRegistry registers manifests and lists them', async () => {
  const registry = new SubagentRegistry()
  registry.register(baseManifest)

  const listed = registry.list()
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, baseManifest.id)

  const fetched = registry.get(baseManifest.id)
  assert.ok(fetched)
  assert.notStrictEqual(fetched, baseManifest, 'registry should clone manifest data')
  fetched.capabilities.push('mutated')

  const reFetched = registry.get(baseManifest.id)
  assert.ok(reFetched)
  assert.equal(reFetched.capabilities.includes('mutated'), false)
})

test('SubagentRegistry filters manifests by artifact kind', async () => {
  const registry = new SubagentRegistry()
  registry.register(baseManifest)

  const matches = registry.filterByArtifact('prd')
  assert.equal(matches.length, 1)

  const missing = registry.filterByArtifact('story-map')
  assert.equal(missing.length, 0)
})

test('SubagentRegistry loads and caches lifecycles', async () => {
  const registry = new SubagentRegistry()
  registry.register(baseManifest)

  const lifecycle = await registry.createLifecycle(baseManifest.id)
  assert.equal(lifecycle.metadata.id, baseManifest.id)

  const cached = await registry.createLifecycle(baseManifest.id)
  assert.strictEqual(cached, lifecycle)
})

test('SubagentRegistry throws for unknown ids', async () => {
  const registry = new SubagentRegistry()
  await assert.rejects(() => registry.createLifecycle('missing'), /is not registered/)
})
