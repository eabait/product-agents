import test from 'node:test'
import assert from 'node:assert/strict'

import { createPersonaBuilderSubagent } from '../src/subagents/persona-builder'
import type { RunContext } from '../src/contracts/core'
import type { SectionRoutingRequest } from '@product-agents/prd-shared'

const fixedClock = () => new Date('2024-09-18T00:00:00.000Z')

const createRunContext = (message: string): RunContext<SectionRoutingRequest> => ({
  runId: 'run-persona-bootstrap',
  request: {
    artifactKind: 'persona',
    input: {
      message,
      context: {
        contextPayload: {
          categorizedContext: [
            {
              id: 'ctx-1',
              title: 'Operations Manager',
              content: 'Jamie oversees regional ops and needs mobile tooling to coordinate field teams.',
              category: 'stakeholder',
              priority: 'high',
              tags: ['user-created'],
              isActive: true,
              createdAt: fixedClock(),
              lastUsed: fixedClock()
            },
            {
              id: 'ctx-2',
              title: 'Urgent compliance constraints',
              content: 'Must comply with SOC2 within 90 days and avoid managing infra keys manually.',
              category: 'constraint',
              priority: 'medium',
              tags: ['constraint'],
              isActive: true,
              createdAt: fixedClock(),
              lastUsed: fixedClock()
            }
          ]
        }
      }
    } satisfies SectionRoutingRequest,
    createdBy: 'persona-test'
  },
  settings: {
    model: 'test-model',
    temperature: 0,
    maxOutputTokens: 1000,
    skillPacks: [],
    workspaceRoot: '/tmp',
    logLevel: 'info'
  },
  workspace: {
    descriptor: {
      runId: 'run-persona-bootstrap',
      root: '',
      kind: 'persona',
      createdAt: fixedClock(),
      metadata: {}
    },
    resolve: (...segments: string[]) => segments.join('/')
  },
  startedAt: fixedClock(),
  metadata: {}
})

test('persona builder synthesizes personas when invoked without PRD artifact', async () => {
  const subagent = createPersonaBuilderSubagent({ clock: fixedClock, idFactory: () => 'persona-unit' })
  const run = createRunContext(
    'Build personas for a compliance automation hub helping ops leads automate audit evidence.'
  )

  const result = await subagent.execute({
    params: {
      targetUsers: ['Nora, the compliance program lead who juggles audits across regions.'],
      keyFeatures: ['Automation playbooks that outline required tasks and owners.']
    },
    run,
    sourceArtifact: undefined
  })

  assert.equal(result.artifact.kind, 'persona')
  const data = result.artifact.data
  assert.ok(Array.isArray(data.personas))
  assert.ok(data.personas.length > 0)
  assert.equal(data.source.artifactKind, 'persona')
  assert.equal(data.source.sectionsUsed.includes('promptContext'), true)
})
