import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { GraphController } from '../src/controller/graph-controller'
import { FilesystemWorkspaceDAO } from '../src/workspace/filesystem-workspace-dao'
import { getDefaultProductAgentConfig } from '../src/config/product-agent.config'
import type { SubagentLifecycle } from '../src/contracts/subagent'

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
      verifier: { primary: verifier, registry: { prd: verifier } },
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

test('GraphController executes inline subagent plan nodes without duplicate runs', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'product-agent-inline-'))
  const workspaceDao = new FilesystemWorkspaceDAO({ root: workspaceRoot, clock: fixedClock })
  const config = getDefaultProductAgentConfig()
  config.workspace.storageRoot = workspaceRoot

  const plan = {
    id: 'plan-inline',
    artifactKind: 'prd',
    entryId: 'generate-prd',
    createdAt: fixedClock(),
    version: 'test-plan',
    nodes: {
      'generate-prd': {
        id: 'generate-prd',
        label: 'Generate PRD',
        task: { kind: 'legacy-prd-run' },
        status: 'pending' as const,
        dependsOn: [] as string[],
        metadata: { skillId: 'prd.legacy-orchestrator', kind: 'skill' }
      },
      'persona-builder': {
        id: 'persona-builder',
        label: 'Persona Builder',
        task: { kind: 'subagent', subagentId: 'persona.builder' },
        status: 'pending' as const,
        dependsOn: ['generate-prd'],
        metadata: {
          kind: 'subagent',
          subagentId: 'persona.builder',
          source: {
            fromNode: 'generate-prd',
            artifactKind: 'prd'
          },
          promoteResult: false
        }
      }
    }
  }

  const planner = {
    async createPlan(context: any) {
      return { plan, context }
    },
    async refinePlan(input: any) {
      return { plan: input.currentPlan, context: input.context }
    }
  }

  const baseArtifact = {
    id: 'artifact-prd-inline',
    kind: 'prd',
    version: '1.0.0',
    data: { sections: {}, metadata: {}, validation: { is_valid: true, issues: [], warnings: [] } },
    metadata: {}
  }

  const skillRunner = {
    async invoke() {
      return {
        output: baseArtifact.data,
        metadata: { artifact: baseArtifact },
        confidence: 0.9
      }
    }
  }

  const personaArtifact = {
    id: 'artifact-persona-inline',
    kind: 'persona',
    version: '0.1.0',
    label: 'Persona Artifact',
    data: { personas: [] },
    metadata: {}
  }

  let subagentExecutions = 0
  const subagent: SubagentLifecycle = {
    metadata: {
      id: 'persona.builder',
      label: 'Persona Builder',
      version: '0.1.0',
      artifactKind: 'persona',
      sourceKinds: ['prd']
    },
    async execute({ sourceArtifact }) {
      subagentExecutions += 1
      assert.equal(sourceArtifact?.id, baseArtifact.id)
      return {
        artifact: personaArtifact,
        metadata: {
          notes: 'inline subagent test'
        }
      }
    }
  }

  const verifier = {
    async verify({ artifact }: any) {
      assert.equal(artifact.id, baseArtifact.id)
      return {
        status: 'pass' as const,
        artifact,
        issues: []
      }
    }
  }

  const controller = new GraphController(
    {
      planner,
      skillRunner,
      verifier: { primary: verifier, registry: { prd: verifier } },
      workspace: workspaceDao,
      subagents: [subagent]
    },
    config,
    {
      clock: fixedClock,
      idFactory: () => 'run-inline'
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
    assert.equal(summary.artifact?.kind, 'prd')
    assert.ok(summary.subagents)
    assert.equal(summary.subagents?.length, 1)
    assert.equal(summary.subagents?.[0].artifact.id, personaArtifact.id)
    assert.equal(subagentExecutions, 1)

    const artifacts = await workspaceDao.listArtifacts('run-inline')
    assert.equal(artifacts.length, 2)
    const personaStored = artifacts.find(entry => entry.id === personaArtifact.id)
    assert.ok(personaStored, 'persona artifact should be persisted')
  } finally {
    await workspaceDao.teardown('run-inline').catch(() => {})
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('GraphController runs verifier after AI tool loop for PRD artifacts', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'product-agent-verify-'))
  const workspaceDao = new FilesystemWorkspaceDAO({ root: workspaceRoot, clock: fixedClock })
  const config = getDefaultProductAgentConfig()
  config.workspace.storageRoot = workspaceRoot

  const planNode = {
    id: 'prd-step',
    label: 'Generate PRD',
    task: { kind: 'legacy-prd-run' },
    status: 'pending' as const,
    dependsOn: [] as string[],
    metadata: { skillId: 'prd.legacy-orchestrator', kind: 'skill' }
  }

  const plan = {
    id: 'plan-verify',
    artifactKind: 'prd',
    entryId: planNode.id,
    createdAt: fixedClock(),
    version: 'test-plan',
    nodes: {
      [planNode.id]: planNode
    }
  }

  const planner = {
    async createPlan(context: any) {
      return { plan, context }
    },
    async refinePlan(input: any) {
      return { plan: input.currentPlan, context: input.context }
    }
  }

  let verifierCalls = 0
  const verifier = {
    async verify({ artifact: inputArtifact }: any) {
      verifierCalls += 1
      return {
        status: 'pass' as const,
        artifact: inputArtifact,
        issues: [] as any[]
      }
    }
  }

  const artifact = {
    id: 'artifact-prd',
    kind: 'prd',
    version: '1.0.0',
    data: { sections: {}, metadata: {}, validation: { is_valid: true, issues: [], warnings: [] } },
    metadata: { createdAt: fixedClock().toISOString() }
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

  const controller = new GraphController(
    {
      planner,
      skillRunner,
      verifier: { primary: verifier, registry: { prd: verifier } },
      workspace: workspaceDao
    },
    config,
    {
      clock: fixedClock,
      idFactory: () => 'verify-run'
    }
  )

  try {
    const summary = await controller.start({
      request: {
        artifactKind: 'prd',
        input: { message: 'generate prd' },
        createdBy: 'unit-test'
      }
    })

    assert.equal(summary.status, 'completed')
    assert.equal(verifierCalls, 1)
    assert.equal(summary.verification?.status, 'pass')

    const artifacts = await workspaceDao.listArtifacts('verify-run')
    assert.equal(artifacts.length, 1)
    assert.equal(artifacts[0].id, artifact.id)
  } finally {
    await workspaceDao.teardown('verify-run').catch(() => {})
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('GraphController selects verifier by artifact kind', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'product-agent-verify-kind-'))
  const workspaceDao = new FilesystemWorkspaceDAO({ root: workspaceRoot, clock: fixedClock })
  const config = getDefaultProductAgentConfig()
  config.workspace.storageRoot = workspaceRoot

  const planNode = {
    id: 'persona-step',
    label: 'Generate Persona',
    task: { kind: 'legacy-prd-run' },
    status: 'pending' as const,
    dependsOn: [] as string[],
    metadata: { skillId: 'persona.generator', kind: 'skill' }
  }

  const plan = {
    id: 'plan-persona-verify',
    artifactKind: 'persona',
    entryId: planNode.id,
    createdAt: fixedClock(),
    version: 'test-plan',
    nodes: {
      [planNode.id]: planNode
    }
  }

  const artifact = {
    id: 'artifact-persona-verify',
    kind: 'persona',
    version: '0.1.0',
    data: { personas: [] },
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

  let personaVerifierCalls = 0
  const personaVerifier = {
    async verify({ artifact: inputArtifact }: any) {
      personaVerifierCalls += 1
      return {
        status: 'pass' as const,
        artifact: inputArtifact,
        issues: []
      }
    }
  }

  let prdVerifierCalls = 0
  const prdVerifier = {
    async verify() {
      prdVerifierCalls += 1
      return {
        status: 'pass' as const,
        artifact,
        issues: []
      }
    }
  }

  const skillRunner = {
    async invoke() {
      return {
        output: artifact.data,
        metadata: { artifact },
        confidence: 0.9
      }
    }
  }

  const controller = new GraphController(
    {
      planner,
      skillRunner,
      verifier: { primary: prdVerifier, registry: { persona: personaVerifier } },
      workspace: workspaceDao
    },
    config,
    {
      clock: fixedClock,
      idFactory: () => 'run-persona-verify'
    }
  )

  try {
    const summary = await controller.start({
      request: {
        artifactKind: 'persona',
        input: { message: 'generate persona' },
        createdBy: 'unit-test'
      }
    })

    assert.equal(summary.status, 'completed')
    assert.equal(summary.artifact?.kind, 'persona')
    assert.equal(personaVerifierCalls, 1)
    assert.equal(prdVerifierCalls, 0)
  } finally {
    await workspaceDao.teardown('run-persona-verify').catch(() => {})
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})
