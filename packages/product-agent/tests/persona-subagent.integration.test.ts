import test from 'node:test'
import assert from 'node:assert/strict'
import os from 'node:os'
import fs from 'node:fs/promises'
import path from 'node:path'

import { GraphController } from '../src/controller/graph-controller'
import type { Planner, PlanDraft, PlanRefinementInput } from '../src/contracts/planner'
import type { SkillRunner, SkillRequest, SkillResult } from '../src/contracts/skill-runner'
import type { PlanGraph, RunContext } from '../src/contracts/core'
import type { VerificationResult } from '../src/contracts/verifier'
import { FilesystemWorkspaceDAO } from '../src/workspace/filesystem-workspace-dao'
import { getDefaultProductAgentConfig } from '../src/config/product-agent.config'
import { createPersonaBuilderSubagent } from '../src/subagents/persona-builder'

const fixedClock = () => new Date('2024-09-18T00:00:00.000Z')

class StubPlanner implements Planner {
  constructor(private readonly plan: PlanGraph) {}

  async createPlan(context: RunContext): Promise<PlanDraft> {
    return {
      plan: this.plan,
      context
    }
  }

  async refinePlan(input: PlanRefinementInput): Promise<PlanDraft> {
    return {
      plan: input.currentPlan,
      context: input.context
    }
  }
}

class PersonaSkillRunner implements SkillRunner {
  async invoke(request: SkillRequest): Promise<SkillResult> {
    const artifact = {
      id: `artifact-${request.context.run.runId}`,
      kind: request.context.run.request.artifactKind,
      version: '1.0.0',
      label: 'PRD Artifact',
      data: {
        sections: {
          targetUsers: {
            targetUsers: [
              'Alex, the overwhelmed product manager who needs clear prioritisation to keep stakeholders aligned.',
              'Morgan, a growth strategist searching for reliable insight dashboards to iterate quickly.'
            ]
          },
          keyFeatures: {
            keyFeatures: [
              'Priority heat map: Surface the highest impact initiatives based on real-time metrics.',
              'Stakeholder digest: Auto-summarise weekly changes for busy executives.'
            ]
          },
          constraints: {
            constraints: ['Must integrate with existing analytics stack within 60 days.'],
            assumptions: ['Data warehouse access is available for the pilot teams.']
          },
          successMetrics: {
            successMetrics: [
              { metric: 'Activation uplift', target: '>= 15% within first quarter', timeline: '90 days' }
            ]
          }
        },
        metadata: {
          sections_updated: ['targetUsers', 'keyFeatures', 'constraints', 'successMetrics'],
          confidence_assessments: {},
          overall_confidence: { level: 'high', reasons: ['stub'] },
          processing_time_ms: 5,
          should_regenerate_prd: true
        },
        validation: {
          is_valid: true,
          issues: [],
          warnings: []
        }
      },
      metadata: {
        createdAt: fixedClock().toISOString(),
        createdBy: request.context.run.request.createdBy,
        tags: ['integration', 'stub']
      }
    }

    return {
      output: null,
      metadata: {
        artifact
      }
    }
  }
}

const plan: PlanGraph = {
  id: 'plan-persona',
  artifactKind: 'prd',
  entryId: 'assemble-prd',
  createdAt: fixedClock(),
  version: '1.0.0',
  nodes: {
    'assemble-prd': {
      id: 'assemble-prd',
      label: 'Assemble PRD',
      task: { kind: 'assemble-prd' },
      status: 'pending',
      dependsOn: [],
      metadata: { skillId: 'stub.assemble' }
    }
  }
}

const stubVerification: VerificationResult = {
  status: 'pass',
  artifact: undefined,
  issues: [],
  metadata: {}
}

test('graph controller runs persona subagent after PRD completion', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'persona-subagent-'))
  const config = getDefaultProductAgentConfig()
  config.workspace.storageRoot = workspaceRoot
  config.workspace.persistArtifacts = true

  const controller = new GraphController(
    {
      planner: new StubPlanner(plan),
      skillRunner: new PersonaSkillRunner(),
      verifier: {
        primary: {
          async verify() {
            return stubVerification
          }
        }
      },
      workspace: new FilesystemWorkspaceDAO({ root: workspaceRoot, clock: fixedClock }),
      subagents: [createPersonaBuilderSubagent({ clock: fixedClock })]
    },
    config,
    { clock: fixedClock }
  )

  try {
    const summary = await controller.start({
      request: {
        artifactKind: 'prd',
        input: { message: 'Stub prompt', context: {} },
        createdBy: 'persona-test'
      }
    })

    assert.equal(summary.status, 'completed')
    assert.ok(summary.artifact)
    assert.equal(summary.artifact?.kind, 'prd')

    assert.ok(summary.subagents)
    assert.equal(summary.subagents?.length, 1)
    const personaSummary = summary.subagents?.[0]
    assert.equal(personaSummary?.subagentId, 'persona.builder')
    assert.equal(personaSummary?.artifact.kind, 'persona')

    const personaData = personaSummary?.artifact.data as any
    assert.ok(Array.isArray(personaData?.personas))
    assert.ok(personaData.personas.length > 0)
    assert.ok(Array.isArray(personaData.personas[0]?.goals))

    const workspace = summary.workspace
    const artifacts = await controller.workspace.listArtifacts(workspace.descriptor.runId)
    assert.equal(artifacts.length, 2)
    const personaArtifactSummary = artifacts.find(entry => entry.kind === 'persona')
    assert.ok(personaArtifactSummary)

  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})
