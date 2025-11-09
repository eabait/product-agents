import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import {
  GraphController,
  FilesystemWorkspaceDAO,
  getDefaultProductAgentConfig
} from '@product-agents/product-agent'
import { createPrdPlanner, createPrdSkillRunner, createPrdVerifier } from '../src/adapters'
import type { SectionName } from '@product-agents/prd-shared'

const fixedClock = () => new Date('2024-04-04T00:00:00.000Z')

class IntegrationSectionWriter {
  constructor(private readonly section: SectionName) {}

  async writeSection() {
    return {
      name: this.section,
      content: { generated: `integration-${this.section}` },
      shouldRegenerate: true,
      confidence: {
        level: 'medium',
        reasons: [`integration confidence for ${this.section}`]
      },
      metadata: {
        validation_issues: []
      }
    }
  }
}

class IntegrationClarificationAnalyzer {
  async analyze() {
    return {
      name: 'clarification',
      data: {
        needsClarification: false,
        confidence: {
          level: 'high',
          reasons: ['integration clarification stub']
        },
        missingCritical: [],
        questions: []
      },
      confidence: {
        level: 'high',
        reasons: ['integration clarification stub']
      },
      metadata: {}
    }
  }
}

class IntegrationClarificationNeededAnalyzer {
  async analyze() {
    return {
      name: 'clarification',
      data: {
        needsClarification: true,
        confidence: {
          level: 'low',
          reasons: ['integration clarification needed']
        },
        missingCritical: ['Missing target audience details'],
        questions: ['Who is the primary target user for this product?']
      },
      confidence: {
        level: 'low',
        reasons: ['integration clarification needed']
      },
      metadata: {}
    }
  }
}

test('graph controller run produces PRD artifact using extracted skills', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'product-agent-int-'))
  const config = getDefaultProductAgentConfig()
  config.workspace.storageRoot = workspaceRoot
  config.workspace.persistArtifacts = true

  const planner = createPrdPlanner({ clock: fixedClock })

  const skillRunner = createPrdSkillRunner({
    clock: fixedClock,
    factories: {
      createClarificationAnalyzer: () => new IntegrationClarificationAnalyzer() as any,
      createContextAnalyzer: () => ({
        async analyze() {
          return {
            name: 'contextAnalysis',
            data: {
              themes: ['simplicity'],
              requirements: {
                functional: ['Issue invoices'],
                technical: ['Multi-tenant architecture'],
                user_experience: ['Delightful UI']
              },
              constraints: []
            },
            confidence: {
              level: 'high',
              reasons: ['integration analyzer stub']
            },
            metadata: {}
          }
        }
      }) as any,
      createSectionWriter: section => new IntegrationSectionWriter(section) as any
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
      context: {}
    },
    createdBy: 'integration-test'
  }

  try {
    const summary = await controller.start({ request: runRequest })

    assert.equal(summary.status, 'completed')
    assert.ok(summary.artifact, 'expected artifact in summary')
    assert.equal(summary.artifact?.id, 'artifact-run-prd-int')

    const sections = summary.artifact?.data.sections ?? {}
    assert.equal(sections.targetUsers.generated, 'integration-targetUsers')
    assert.equal(sections.solution.generated, 'integration-solution')
    assert.equal(summary.skillResults.length, 8)

    const artifacts = await workspace.listArtifacts(summary.runId)
    assert.equal(artifacts.length, 1)
    assert.equal(artifacts[0].id, summary.artifact?.id)
  } finally {
    await workspace.teardown('run-prd-int').catch(() => {})
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('graph controller stops early when clarification is required', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'product-agent-int-clar-'))
  const config = getDefaultProductAgentConfig()
  config.workspace.storageRoot = workspaceRoot
  config.workspace.persistArtifacts = true

  const planner = createPrdPlanner({ clock: fixedClock })

  const skillRunner = createPrdSkillRunner({
    clock: fixedClock,
    factories: {
      createClarificationAnalyzer: () => new IntegrationClarificationNeededAnalyzer() as any,
      createContextAnalyzer: () => ({
        async analyze() {
          throw new Error('context analyzer should not run when clarification is required')
        }
      }) as any,
      createSectionWriter: section => new IntegrationSectionWriter(section) as any
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
    { clock: fixedClock, idFactory: () => 'run-prd-int-clar' }
  )

  const runRequest = {
    artifactKind: 'prd' as const,
    input: {
      message: 'Draft a PRD.',
      context: {}
    },
    createdBy: 'integration-test-clar'
  }

  try {
    const summary = await controller.start({ request: runRequest })

    assert.equal(summary.status, 'awaiting-input')
    assert.equal(summary.skillResults.length, 1)
    assert.ok(!summary.artifact)

    const clarificationMetadata = summary.skillResults[0].metadata as any
    assert.ok(clarificationMetadata?.clarification)
    assert.equal(clarificationMetadata.clarification.needsClarification, true)
    assert.deepEqual(clarificationMetadata.clarification.questions, [
      'Who is the primary target user for this product?'
    ])
  } finally {
    await workspace.teardown('run-prd-int-clar').catch(() => {})
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})
