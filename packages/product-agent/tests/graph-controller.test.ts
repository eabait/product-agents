import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { GraphController } from '../src/controller/graph-controller'
import { FilesystemWorkspaceDAO } from '../src/workspace/filesystem-workspace-dao'
import { getDefaultProductAgentConfig } from '../src/config/product-agent.config'

const fixedClock = () => new Date('2024-01-01T00:00:00.000Z')

test('GraphController executes plan and delivers artifact', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'product-agent-test-'))
  const workspaceDao = new FilesystemWorkspaceDAO({ root: workspaceRoot, clock: fixedClock })

  const config = getDefaultProductAgentConfig()
  config.workspace.storageRoot = workspaceRoot

  const planNode = {
    id: 'legacy-prd-run',
    label: 'Generate PRD',
    task: { kind: 'legacy-prd-run', description: 'Legacy orchestrator invocation' },
    status: 'pending' as const,
    dependsOn: [] as string[],
    metadata: { skillId: 'prd.legacy-orchestrator' }
  }

  const plan = {
    id: 'plan-test-run',
    artifactKind: 'prd',
    entryId: planNode.id,
    nodes: { [planNode.id]: planNode },
    createdAt: fixedClock(),
    version: 'test-plan'
  }

  const artifact = {
    id: 'artifact-test-run',
    kind: 'prd',
    version: '1.0.0',
    data: { sections: {}, metadata: {}, validation: { is_valid: true, issues: [] as string[], warnings: [] as string[] } },
    metadata: { createdAt: fixedClock().toISOString() }
  }

  const planner = {
    async createPlan(context: any) {
      return { plan, context }
    },
    async refinePlan(input: any) {
      return { plan: input.currentPlan, context: input.context }
    }
  }

  const skillRunner = {
    async invoke() {
      return {
        output: artifact.data,
        metadata: { artifact },
        confidence: 0.95
      }
    }
  }

  const verifier = {
    async verify({ artifact: inputArtifact }: any) {
      return {
        status: 'pass' as const,
        artifact: inputArtifact,
        issues: [] as any[]
      }
    }
  }

  const controller = new GraphController(
    {
      planner,
      skillRunner,
      verifier: { primary: verifier },
      workspace: workspaceDao
    },
    config,
    {
      clock: fixedClock,
      idFactory: () => 'test-run'
    }
  )

  try {
    const summary = await controller.start({
      request: {
        artifactKind: 'prd',
        input: { message: 'generate product requirements' },
        createdBy: 'unit-test'
      }
    })

    assert.equal(summary.status, 'completed')
    assert.ok(summary.artifact)
    assert.equal(summary.artifact?.id, 'artifact-test-run')

    const artifacts = await workspaceDao.listArtifacts('test-run')
    assert.equal(artifacts.length, 1)
  } finally {
    await workspaceDao.teardown('test-run').catch(() => {})
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})
