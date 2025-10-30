import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { GraphController } from '../src/controller/graph-controller'
import { FilesystemWorkspaceDAO } from '../src/workspace/filesystem-workspace-dao'
import { createPrdPlanner, createPrdSkillRunner, createPrdVerifier } from '../src/adapters/prd/index'
import { getDefaultProductAgentConfig } from '../src/config/product-agent.config'

const fixedClock = () => new Date('2024-04-04T00:00:00.000Z')

test('graph controller run produces PRD artifact', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'product-agent-int-'))
  const config = getDefaultProductAgentConfig()
  config.workspace.storageRoot = workspaceRoot
  config.workspace.persistArtifacts = true

  const planner = createPrdPlanner({ clock: fixedClock })

  const stubResponse = {
    sections: {
      targetUsers: { targetUsers: ['Freelancers needing simple invoicing'] },
      solution: { summary: 'Deliver a streamlined payments experience.' },
      keyFeatures: { keyFeatures: ['One-tap checkout'] },
      successMetrics: {
        successMetrics: [
          { metric: 'Activation rate', target: '60% within 30 days', timeline: '30 days' }
        ]
      },
      constraints: {
        constraints: ['Meet PCI compliance requirements'],
        assumptions: ['Bank partners provide APIs']
      }
    },
    metadata: {
      sections_updated: ['solution'],
      overall_confidence: { level: 'high' },
      confidence_assessments: {},
      should_regenerate_prd: false,
      processing_time_ms: 123
    },
    validation: {
      is_valid: true,
      issues: [],
      warnings: []
    }
  }

  const skillRunner = createPrdSkillRunner({
    clock: fixedClock,
    createAgent: async settings => {
      assert.equal(settings.model, config.runtime.defaultModel)
      return {
        async generateSectionsWithProgress() {
          return stubResponse
        }
      }
    }
  })

  const verifier = createPrdVerifier({ clock: fixedClock })
  const workspace = new FilesystemWorkspaceDAO({ root: workspaceRoot, clock: fixedClock })

  const controller = new GraphController(
    {
      planner,
      skillRunner,
      verifier: { primary: verifier },
      workspace
    },
    config,
    { clock: fixedClock, idFactory: () => 'run-prd-int' }
  )

  const runRequest = {
    artifactKind: 'prd' as const,
    input: {
      message: 'Create a PRD for a mobile payment application.',
      context: {},
      settings: {
        model: config.runtime.defaultModel,
        temperature: config.runtime.defaultTemperature,
        maxTokens: config.runtime.maxOutputTokens
      }
    },
    createdBy: 'integration-test'
  }

  try {
    const summary = await controller.start({ request: runRequest })

    assert.equal(summary.status, 'completed')
    assert.ok(summary.artifact, 'expected artifact in summary')
    assert.equal(summary.artifact?.data.sections.solution.summary, stubResponse.sections.solution.summary)
    assert.equal(summary.skillResults.length, 1)

    const artifacts = await workspace.listArtifacts(summary.runId)
    assert.equal(artifacts.length, 1)
    assert.equal(artifacts[0].id, summary.artifact?.id)
  } finally {
    await workspace.teardown('run-prd-int').catch(() => {})
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})
