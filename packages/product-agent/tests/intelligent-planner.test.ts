import test from 'node:test'
import assert from 'node:assert/strict'

import { IntelligentPlanner } from '../src/planner/intelligent-planner'
import { getDefaultProductAgentConfig } from '../src/config/product-agent.config'
import type { RunContext } from '../src/contracts/core'
import type { SectionRoutingRequest } from '@product-agents/prd-shared'
import type { SubagentLifecycle } from '../src/contracts/subagent'
import type { ArtifactIntent } from '../src/contracts/intent'

const fixedClock = () => new Date('2024-07-01T00:00:00.000Z')

const createRunContext = (artifactKind: string, targetSections?: string[]): RunContext<SectionRoutingRequest> => ({
  runId: `run-${artifactKind}`,
  request: {
    artifactKind,
    input: {
      message: 'Build artifact',
      targetSections
    } as SectionRoutingRequest,
    createdBy: 'planner-test'
  },
  settings: {
    model: 'model-x',
    temperature: 0.1,
    maxOutputTokens: 2000,
    skillPacks: [],
    workspaceRoot: '/tmp',
    logLevel: 'info'
  },
  workspace: {} as unknown,
  startedAt: fixedClock(),
  metadata: undefined
})

const personaSubagent: SubagentLifecycle = {
  metadata: {
    id: 'persona.builder',
    label: 'Persona Builder',
    version: '0.1.0',
    artifactKind: 'persona',
    sourceKinds: ['prd'],
    description: 'turns PRDs into personas'
  },
  async execute() {
    throw new Error('execute should not be invoked during planning tests')
  }
}

const storyMapSubagent: SubagentLifecycle = {
  metadata: {
    id: 'story.mapper',
    label: 'Story Map Builder',
    version: '0.2.0',
    artifactKind: 'story-map',
    sourceKinds: ['persona', 'prd'],
    description: 'turns personas into story maps'
  },
  async execute() {
    throw new Error('execute should not be invoked during planning tests')
  }
}

class StubIntentResolver {
  constructor(private readonly plan: ArtifactIntent) {}

  async resolve(): Promise<ArtifactIntent> {
    return this.plan
  }
}

test('intelligent planner composes PRD plan from skill catalog with subagent nodes', async () => {
  const config = getDefaultProductAgentConfig()
  const intent: ArtifactIntent = {
    source: 'user',
    requestedArtifacts: ['prd'],
    targetArtifact: 'prd',
    transitions: [{ toArtifact: 'prd' }],
    confidence: 0.95
  }
  const planner = new IntelligentPlanner({
    config,
    clock: fixedClock,
    registeredSubagents: [personaSubagent],
    intentResolver: new StubIntentResolver(intent) as any
  })
  const context = createRunContext('prd', ['solution', 'constraints'])

  const { plan } = await planner.createPlan(context)

  assert.equal(plan.artifactKind, 'prd')
  assert.ok(plan.nodes['clarification-check'])
  assert.ok(plan.nodes['analyze-context'])
  assert.ok(plan.nodes['write-solution'])
  assert.ok(plan.nodes['write-constraints'])
  assert.ok(plan.nodes['assemble-prd'])

  const personaNode = plan.nodes['subagent-persona.builder']
  assert.equal(personaNode, undefined)
  assert.deepEqual(plan.metadata?.skills?.sequence, [
    'prd.check-clarification',
    'prd.analyze-context',
    'prd.write-solution',
    'prd.write-constraints',
    'prd.assemble-prd'
  ])
  assert.equal(plan.metadata?.transitionPath?.[0], 'prd')
})

test('intelligent planner promotes persona artifact when requested', async () => {
  const config = getDefaultProductAgentConfig()
  const intent: ArtifactIntent = {
    source: 'resolver',
    requestedArtifacts: ['prd', 'persona'],
    targetArtifact: 'persona',
    transitions: [
      { fromArtifact: 'prd', toArtifact: 'persona' }
    ],
    confidence: 0.93
  }
  const planner = new IntelligentPlanner({
    config,
    clock: fixedClock,
    registeredSubagents: [personaSubagent],
    intentResolver: new StubIntentResolver(intent) as any
  })
  const context = createRunContext('persona')

  const { plan } = await planner.createPlan(context)

  assert.equal(plan.artifactKind, 'persona')
  const personaNode = plan.nodes['subagent-persona.builder']
  assert.ok(personaNode)
  assert.equal(personaNode.metadata?.promoteResult, true)
  assert.equal(personaNode.metadata?.source?.artifactKind, 'prd')
  assert.deepEqual(plan.metadata?.requestedSections, [
    'targetUsers',
    'solution',
    'keyFeatures',
    'successMetrics',
    'constraints'
  ])
  assert.deepEqual(plan.metadata?.requestedArtifacts, ['prd', 'persona'])
  assert.equal(plan.metadata?.intentConfidence, 0.93)
  assert.deepEqual(plan.metadata?.transitionPath, ['prd', 'persona'])
})

test('intelligent planner chains persona before story map when requested', async () => {
  const config = getDefaultProductAgentConfig()
  const intent: ArtifactIntent = {
    source: 'resolver',
    requestedArtifacts: ['prd', 'persona', 'story-map'],
    targetArtifact: 'story-map',
    transitions: [
      { fromArtifact: 'prd', toArtifact: 'persona' },
      { fromArtifact: 'persona', toArtifact: 'story-map' }
    ],
    confidence: 0.91
  }
  const planner = new IntelligentPlanner({
    config,
    clock: fixedClock,
    registeredSubagents: [personaSubagent, storyMapSubagent],
    intentResolver: new StubIntentResolver(intent) as any
  })
  const context = createRunContext('story-map')

  const { plan } = await planner.createPlan(context)

  assert.equal(plan.artifactKind, 'story-map')
  const personaNode = plan.nodes['subagent-persona.builder']
  const storyMapNode = plan.nodes['subagent-story.mapper']
  assert.ok(personaNode, 'persona node missing from chain plan')
  assert.ok(storyMapNode, 'story map node missing from chain plan')
  assert.deepEqual(personaNode.dependsOn, ['assemble-prd'])
  assert.deepEqual(storyMapNode.dependsOn, ['subagent-persona.builder'])
  assert.equal(storyMapNode.metadata?.source?.artifactKind, 'persona')
  assert.deepEqual(plan.metadata?.requestedArtifacts, ['prd', 'persona', 'story-map'])
  assert.deepEqual(plan.metadata?.transitionPath, ['prd', 'persona', 'story-map'])
  assert.equal(plan.metadata?.intentConfidence, 0.91)
})
