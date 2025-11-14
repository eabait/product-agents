import test from 'node:test'
import assert from 'node:assert/strict'

import {
  IntentClassifierSkill,
  type IntentClassifierInput,
  type IntentClassifierOutput
} from '../src/index'

class FakeClient {
  public lastPrompt?: string
  public lastUsage = { model: 'test-model', totalTokens: 42 }

  constructor(private readonly response: IntentClassifierOutput) {}

  async generateStructured(params: unknown) {
    this.lastPrompt = typeof params === 'object' && params
      ? (params as { prompt?: string }).prompt
      : undefined
    return {
      targetArtifact: this.response.targetArtifact,
      chain: this.response.chain,
      confidence: this.response.confidence,
      probabilities: this.response.probabilities,
      rationale: this.response.rationale
    }
  }

  getLastUsage() {
    return this.lastUsage
  }
}

const baseInput: IntentClassifierInput = {
  message: 'Please produce personas and a story map for this product',
  availableArtifacts: ['prd', 'persona', 'story-map'],
  requestedArtifacts: ['persona', 'story-map']
}

test('intent classifier normalizes chain and attaches usage metadata', async () => {
  const client = new FakeClient({
    targetArtifact: 'story-map',
    chain: ['persona', 'story-map'],
    probabilities: { persona: 0.8, 'story-map': 0.9 },
    confidence: 0.88,
    rationale: 'Personas then stories'
  })

  const skill = new IntentClassifierSkill({
    client
  })

  const result = await skill.classify(baseInput)

  assert.deepEqual(result.chain, ['persona', 'story-map'])
  assert.equal(result.targetArtifact, 'story-map')
  assert.equal(result.metadata?.usage?.model, 'test-model')
  assert.ok(result.probabilities.persona > 0)
})
