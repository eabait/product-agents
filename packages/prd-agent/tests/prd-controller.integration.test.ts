import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { GraphController, FilesystemWorkspaceDAO, getDefaultProductAgentConfig } from '@product-agents/product-agent'
import {
  createPersonaAgentSubagent,
  PersonaAgentRunner,
  type PersonaAgentRunnerResult,
  type PersonaProfile,
  type PersonaAgentTelemetry
} from '@product-agents/persona-agent'
import { createPrdPlanner, createPrdSkillRunner, createPrdVerifier } from '../src/adapters'
import type { SectionName } from '@product-agents/prd-shared'

const fixedClock = () => new Date('2024-04-04T00:00:00.000Z')

class StubPersonaRunner extends PersonaAgentRunner {
  constructor(private readonly personas: PersonaProfile[]) {
    super()
  }

  async run(): Promise<PersonaAgentRunnerResult> {
    return {
      personas: this.personas,
      strategy: 'llm',
      notes: ['integration-stub'],
      telemetry: createStubTelemetry('llm')
    }
  }
}

const createStubTelemetry = (strategy: 'llm' | 'heuristic'): PersonaAgentTelemetry => ({
  model: 'stub-model',
  durationMs: 5,
  promptLength: 128,
  promptPreview: 'stub-preview',
  responsePreview: 'stub-response',
  strategy,
  timestamp: fixedClock().toISOString()
})

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
      verifier: { primary: verifier, registry: { prd: verifier } },
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

    if (summary.status === 'completed') {
      assert.ok(summary.artifact, 'expected artifact in summary')
      assert.equal(summary.artifact?.id, 'artifact-run-prd-int')

      const sections = summary.artifact?.data.sections ?? {}
      assert.equal(sections.targetUsers.generated, 'integration-targetUsers')
      assert.equal(sections.solution.generated, 'integration-solution')
      assert.equal(summary.skillResults.length, 8)

      const artifacts = await workspace.listArtifacts(summary.runId)
      assert.equal(artifacts.length, 1)
      assert.equal(artifacts[0].id, summary.artifact?.id)
    } else {
      assert.equal(summary.status, 'awaiting-input')
      assert.ok(!summary.artifact, 'no artifact expected when awaiting input')
    }
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
      verifier: { primary: verifier, registry: { prd: verifier } },
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
    assert.ok(!summary.artifact)

    const clarification = summary.skillResults.at(-1)?.metadata as any
    if (clarification?.clarification) {
      assert.equal(clarification.clarification.needsClarification, true)
    }
  } finally {
    await workspace.teardown('run-prd-int-clar').catch(() => {})
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('graph controller persona run promotes persona artifact via subagent', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'product-agent-int-persona-'))
  const config = getDefaultProductAgentConfig()
  config.workspace.storageRoot = workspaceRoot
  config.workspace.persistArtifacts = true

  const personaSubagent = createPersonaAgentSubagent({
    clock: fixedClock,
    runner: new StubPersonaRunner([
      {
        id: 'persona-1',
        name: 'Alex Ops',
        summary: 'Ops leader needs realtime views',
        goals: ['Realtime monitoring'],
        frustrations: ['Manual spreadsheets'],
        opportunities: ['Automation'],
        successIndicators: ['Faster decisions'],
        quote: 'Give me the signal before customers feel it.',
        tags: ['ops']
      }
    ])
  })

  // Create a pre-generated plan that calls the persona subagent
  const personaPlan = {
    id: 'plan-run-persona-int',
    artifactKind: 'persona' as const,
    entryId: 'persona-step',
    createdAt: fixedClock(),
    version: '1.0.0',
    nodes: {
      'persona-step': {
        id: 'persona-step',
        label: 'Generate personas',
        task: {
          kind: 'subagent' as const,
          agentId: 'persona.builder'
        },
        status: 'pending' as const,
        dependsOn: [],
        metadata: {
          kind: 'subagent',
          toolId: 'persona.builder',
          rationale: 'Generate user personas',
          subagentId: 'persona.builder',
          artifactKind: 'persona' as const
        }
      }
    },
    metadata: {
      orchestrator: 'test',
      confidence: 1.0,
      overallRationale: 'Test persona generation'
    }
  }

  const skillRunner = createPrdSkillRunner({
    clock: fixedClock,
    factories: {
      createClarificationAnalyzer: () => new IntegrationClarificationAnalyzer() as any,
      createContextAnalyzer: () => ({
        async analyze() {
          return {
            name: 'contextAnalysis',
            data: {
              themes: ['focus'],
              requirements: {
                functional: ['Collect insights'],
                technical: ['API-first'],
                user_experience: ['Fast responses']
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
      skillRunner,
      verifier: { primary: verifier, registry: { prd: verifier } },
      workspace,
      subagents: [personaSubagent]
    },
    config,
    { clock: fixedClock, idFactory: () => 'run-persona-int' }
  )

  const runRequest = {
    artifactKind: 'persona' as const,
    input: {
      message: 'Create personas for a research workflow.',
      context: {}
    },
    createdBy: 'integration-test'
  }

  try {
    const summary = await controller.start({
      request: runRequest,
      initialPlan: personaPlan
    })

    assert.equal(summary.status, 'completed')
    assert.ok(summary.artifact)
    assert.equal(summary.artifact?.kind, 'persona')
    assert.ok(summary.subagents)
    assert.equal(summary.subagents?.length, 1)
    assert.equal(summary.subagents?.[0].artifact.kind, 'persona')

    const artifacts = await workspace.listArtifacts(summary.runId)
    // The persona subagent creates one artifact which becomes the final artifact
    assert.equal(artifacts.length, 1)
    const personaArtifact = artifacts.find(entry => entry.kind === 'persona')
    assert.ok(personaArtifact)
  } finally {
    await workspace.teardown('run-persona-int').catch(() => {})
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})
