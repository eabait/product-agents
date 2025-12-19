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

test('classifies explicit research requests correctly', async () => {
  const client = new FakeClient({
    targetArtifact: 'research',
    chain: ['research'],
    probabilities: { research: 0.9 },
    confidence: 0.9,
    rationale: 'Explicit research request'
  })

  const skill = new IntentClassifierSkill({ client })

  const testCases = [
    'I need to research the legal tech market in LATAM',
    'Please investigate competitors in the fintech space',
    'Can you explore the e-commerce market trends?',
    'Gather intelligence on AI agents market',
    'Study the competitive landscape for note-taking apps'
  ]

  for (const message of testCases) {
    const result = await skill.classify({
      message,
      availableArtifacts: ['prd', 'persona', 'research', 'story-map'],
      requestedArtifacts: []
    })

    assert.equal(result.targetArtifact, 'research', `Failed for: "${message}"`)
    assert.ok(result.chain.includes('research'))
  }
})

test('classifies market understanding requests as research', async () => {
  const client = new FakeClient({
    targetArtifact: 'research',
    chain: ['research'],
    probabilities: { research: 0.85 },
    confidence: 0.85,
    rationale: 'Market understanding requires research'
  })

  const skill = new IntentClassifierSkill({ client })

  const testCases = [
    'I need to understand the agents for legal market in LATAM',
    'Help me understand the note-taking market',
    'What is the market for AI-powered productivity tools?',
    'Understand the fintech market in Brazil',
    'I want to understand the competitive dynamics in the SaaS market'
  ]

  for (const message of testCases) {
    const result = await skill.classify({
      message,
      availableArtifacts: ['prd', 'persona', 'research', 'story-map'],
      requestedArtifacts: []
    })

    assert.equal(
      result.targetArtifact,
      'research',
      `Failed for: "${message}" - classified as ${result.targetArtifact}`
    )
  }
})

test('classifies competitor analysis requests as research', async () => {
  const client = new FakeClient({
    targetArtifact: 'research',
    chain: ['research'],
    probabilities: { research: 0.9 },
    confidence: 0.9,
    rationale: 'Competitor analysis is research'
  })

  const skill = new IntentClassifierSkill({ client })

  const testCases = [
    'Who are the main competitors in the CRM space?',
    'Analyze the competitive landscape for our product',
    'What are the strengths and weaknesses of our competitors?',
    'Compare our solution to competitor offerings'
  ]

  for (const message of testCases) {
    const result = await skill.classify({
      message,
      availableArtifacts: ['prd', 'persona', 'research', 'story-map'],
      requestedArtifacts: []
    })

    assert.equal(result.targetArtifact, 'research')
    assert.ok(result.probabilities.research > 0.7)
  }
})

test('distinguishes research from persona requests', async () => {
  const personaClient = new FakeClient({
    targetArtifact: 'persona',
    chain: ['persona'],
    probabilities: { persona: 0.85 },
    confidence: 0.85,
    rationale: 'Pure persona request'
  })

  const personaSkill = new IntentClassifierSkill({ client: personaClient })

  const personaMessages = [
    'Create user personas for our app',
    'I need to define target audience segments',
    'What are the user types for this product?',
    'Build customer personas for our platform'
  ]

  for (const message of personaMessages) {
    const result = await personaSkill.classify({
      message,
      availableArtifacts: ['prd', 'persona', 'research', 'story-map'],
      requestedArtifacts: []
    })

    assert.equal(
      result.targetArtifact,
      'persona',
      `Incorrectly classified persona request as ${result.targetArtifact}: "${message}"`
    )
  }
})

test('chains research before persona when market context needed', async () => {
  const client = new FakeClient({
    targetArtifact: 'persona',
    chain: ['research', 'persona'],
    probabilities: { research: 0.8, persona: 0.85 },
    confidence: 0.82,
    rationale: 'Need market research before creating personas'
  })

  const skill = new IntentClassifierSkill({ client })

  const result = await skill.classify({
    message: 'Create personas for the legal tech market in LATAM',
    availableArtifacts: ['prd', 'persona', 'research', 'story-map'],
    requestedArtifacts: []
  })

  assert.equal(result.targetArtifact, 'persona')
  assert.deepEqual(result.chain, ['research', 'persona'])
  assert.ok(result.probabilities.research > 0.7)
})
