import test from 'node:test'
import assert from 'node:assert/strict'

import { IntelligentPlanner } from '../src/planner/intelligent-planner'
import { getDefaultProductAgentConfig } from '../src/config/product-agent.config'
import type { RunContext } from '../src/contracts/core'
import type { SectionRoutingRequest } from '@product-agents/prd-shared'
import type { SubagentLifecycle } from '../src/contracts/subagent'

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

test('intelligent planner composes PRD plan from skill catalog with subagent nodes', async () => {
  const config = getDefaultProductAgentConfig()
  const planner = new IntelligentPlanner({
    config,
    clock: fixedClock,
    registeredSubagents: [personaSubagent]
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
  assert.ok(personaNode, 'expected persona subagent node in plan')
  assert.equal(personaNode.metadata?.kind, 'subagent')
  assert.equal(personaNode.metadata?.subagentId, 'persona.builder')
  assert.deepEqual(personaNode.dependsOn, ['assemble-prd'])
  assert.deepEqual(plan.metadata?.skills?.sequence, [
    'prd.check-clarification',
    'prd.analyze-context',
    'prd.write-solution',
    'prd.write-constraints',
    'prd.assemble-prd'
  ])
})

test('intelligent planner promotes persona artifact when requested', async () => {
  const config = getDefaultProductAgentConfig()
  const planner = new IntelligentPlanner({
    config,
    clock: fixedClock,
    registeredSubagents: [personaSubagent]
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
})
