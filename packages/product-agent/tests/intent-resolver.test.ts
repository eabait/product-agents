import test from 'node:test'
import assert from 'node:assert/strict'

import { IntentResolver } from '../src/planner/intent-resolver'
import type { RunContext } from '../src/contracts/core'
import type { SectionRoutingRequest } from '@product-agents/prd-shared'
import { SubagentRegistry } from '../src/subagents/subagent-registry'

class StubClassifier {
  public lastInput: any
  private readonly response: any

  constructor(response: any) {
    this.response = response
  }

  async classify(input: any) {
    this.lastInput = input
    return this.response
  }
}

const createRunContext = (): RunContext<SectionRoutingRequest> => {
  return {
    runId: 'run-1',
    request: {
      artifactKind: 'prd',
      input: {
        message: 'Need personas and story map'
      } as SectionRoutingRequest,
      createdBy: 'tester'
    },
    settings: {
      model: 'model',
      temperature: 0.1,
      maxOutputTokens: 1000,
      skillPacks: [],
      workspaceRoot: '/tmp',
      logLevel: 'info'
    },
    workspace: {} as unknown,
    startedAt: new Date(),
    metadata: {}
  }
}

test('intent resolver returns cached plan without invoking classifier', async () => {
  const context = createRunContext()
  context.intentPlan = {
    source: 'user',
    requestedArtifacts: ['prd'],
    targetArtifact: 'prd',
    transitions: [{ toArtifact: 'prd' }],
    confidence: 1
  }

  const classifier = new StubClassifier({
    targetArtifact: 'persona',
    chain: ['prd', 'persona'],
    probabilities: {},
    confidence: 0.8
  })

  const resolver = new IntentResolver({
    classifier
  })

  const plan = await resolver.resolve(context)

  assert.equal(plan.targetArtifact, 'prd')
  assert.equal(classifier.lastInput, undefined)
})

test('intent resolver classifies and caches result', async () => {
  const context = createRunContext()
  const classifier = new StubClassifier({
    targetArtifact: 'persona',
    chain: ['prd', 'persona'],
    confidence: 0.9,
    probabilities: { prd: 0.7, persona: 0.9 },
    rationale: 'Need persona'
  })

  const resolver = new IntentResolver({
    classifier
  })

  const plan = await resolver.resolve(context)

  assert.deepEqual(plan.requestedArtifacts, ['prd', 'persona'])
  assert.equal(plan.targetArtifact, 'persona')
  assert.ok(context.metadata?.intent)
  assert.equal(context.intentPlan?.targetArtifact, 'persona')
})

test('intent resolver includes registry artifacts when calling classifier', async () => {
  const context = createRunContext()
  const classifier = new StubClassifier({
    targetArtifact: 'story-map',
    chain: ['prd', 'story-map'],
    confidence: 0.8,
    probabilities: { 'story-map': 0.8 }
  })

  const registry = new SubagentRegistry()
  registry.register({
    id: 'persona.builder',
    package: 'pkg',
    version: '0.1.0',
    label: 'Persona',
    creates: 'persona',
    consumes: ['prd'],
    capabilities: [],
    entry: 'persona',
    exportName: 'createSubagent',
    tags: []
  })

  const resolver = new IntentResolver({
    classifier,
    subagentRegistry: registry
  })

  await resolver.resolve(context)

  assert.ok(classifier.lastInput.availableArtifacts.includes('persona'))
})
