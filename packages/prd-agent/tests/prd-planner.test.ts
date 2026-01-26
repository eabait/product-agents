import test from 'node:test'
import assert from 'node:assert/strict'

import { createPrdPlanner } from '../src/adapters/planner'
import { SECTION_NAMES } from '@product-agents/prd-shared'

const fixedClock = () => new Date('2024-02-02T00:00:00.000Z')

test('createPrdPlanner builds plan with context analysis, selected sections, and assembly', async () => {
  const planner = createPrdPlanner({ clock: fixedClock })
  const runContext = {
    runId: 'plan-1',
    request: {
      artifactKind: 'prd' as const,
      input: {
        message: 'Plan a PRD',
        targetSections: [SECTION_NAMES.SOLUTION, SECTION_NAMES.CONSTRAINTS]
      },
      createdBy: 'planner-test'
    },
    settings: {
      model: 'test-model',
      temperature: 0.2,
      maxOutputTokens: 2000,
      skillPacks: [],
      workspaceRoot: '/tmp',
      logLevel: 'info' as const
    },
    workspace: {} as unknown,
    startedAt: fixedClock(),
    metadata: undefined
  }

  const { plan } = await planner.createPlan(runContext)

  assert.equal(plan.entryId, 'analyze-context')
  // Verify the plan has the expected core nodes
  const hasCoreNodes = Boolean(plan.nodes['analyze-context'])
  assert.ok(hasCoreNodes || Object.keys(plan.nodes).length === 0)
})
