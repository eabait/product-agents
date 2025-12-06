import test from 'node:test'
import assert from 'node:assert/strict'

import { getDefaultProductAgentConfig } from '../src/config/product-agent.config'

test('default config registers persona subagent manifest', () => {
  const config = getDefaultProductAgentConfig()
  const personaManifest = config.subagents.manifests.find(entry => entry.id === 'persona.builder')

  assert.ok(personaManifest, 'persona.builder manifest should be present by default')
  assert.equal(personaManifest?.entry, '@product-agents/persona-agent')
  assert.equal(personaManifest?.exportName, 'createPersonaAgentSubagent')
})
