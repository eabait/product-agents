import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { PrdSkillRunner } from '../src/adapters/prd/skill-runner'
import { resolveRunSettings, getDefaultProductAgentConfig } from '../src/config/product-agent.config'

const fixedClock = () => new Date('2024-03-03T00:00:00.000Z')

test('PrdSkillRunner wraps legacy orchestrator responses', async () => {
  let factoryInvocations = 0
  const stubResponse = {
    sections: {
      solution: { summary: 'Keep it simple' }
    },
    metadata: {
      sections_updated: ['solution'],
      overall_confidence: { level: 'high' },
      confidence_assessments: {},
      should_regenerate_prd: false,
      processing_time_ms: 42
    },
    validation: {
      is_valid: true,
      issues: [] as string[],
      warnings: [] as string[]
    }
  }

  const config = getDefaultProductAgentConfig()
  const settings = resolveRunSettings(config)
  const expectedModel = settings.model

  const runner = new PrdSkillRunner({
    clock: fixedClock,
    createAgent: async settingsOverride => {
      factoryInvocations += 1
      assert.equal(settingsOverride.model, expectedModel)
      return {
        async generateSectionsWithProgress() {
          return stubResponse
        }
      }
    }
  })

  const planNode = {
    id: 'legacy-prd-run',
    label: 'Generate PRD',
    task: { kind: 'legacy-prd-run', description: 'Legacy orchestrator invocation' },
    status: 'pending' as const,
    dependsOn: [] as string[],
    metadata: { skillId: 'prd.legacy-orchestrator' }
  }

  const runContext = {
    runId: 'skill-run-1',
    request: {
      artifactKind: 'prd',
      input: { message: 'Please generate a PRD for task management' },
      createdBy: 'unit-test'
    },
    settings,
    workspace: {
      descriptor: {
        runId: 'skill-run-1',
        root: path.resolve('.'),
        createdAt: fixedClock(),
        kind: 'prd'
      },
      resolve: (...segments: string[]) => path.join(path.resolve('.'), ...segments)
    },
    startedAt: fixedClock(),
    metadata: undefined
  }

  const result = await runner.invoke({
    skillId: 'prd.legacy-orchestrator',
    planNode,
    input: planNode.task,
    context: {
      run: runContext,
      step: planNode,
      metadata: undefined
    }
  })

  assert.equal(factoryInvocations, 1)
  assert.deepEqual(result.output, stubResponse)
  assert.ok(result.metadata)
  assert.ok((result.metadata as any).artifact)
  assert.equal((result.metadata as any).artifact.id, 'artifact-skill-run-1')
  assert.equal(result.confidence, 0.9)
})
