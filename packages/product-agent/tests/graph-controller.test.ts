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

test('GraphController falls back to direct tool execution when provider call fails', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'product-agent-tool-fallback-'))
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
    id: 'plan-fallback',
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

  const artifact = {
    id: 'artifact-fallback',
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
        confidence: 0.9
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

  let invokerCalls = 0
  const failingToolInvoker = async () => {
    invokerCalls += 1
    const error: any = new Error('Bad Request')
    error.status = 400
    throw error
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
      idFactory: () => 'tool-fallback-run',
      toolInvoker: failingToolInvoker
    }
  )

  try {
    const summary = await controller.start({
      request: {
        artifactKind: 'prd',
        input: { message: 'generate prd', settings: { apiKey: 'test-key' } },
        createdBy: 'unit-test',
        attributes: { apiKey: 'test-key' }
      }
    })

    assert.equal(invokerCalls, 1)
    assert.equal(summary.status, 'completed')
    assert.equal(summary.artifact?.id, artifact.id)
  } finally {
    await workspaceDao.teardown('tool-fallback-run').catch(() => {})
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})

test('GraphController resumeSubagent passes request.input to subsequent subagent steps', async () => {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'product-agent-resume-'))
  const workspaceDao = new FilesystemWorkspaceDAO({ root: workspaceRoot, clock: fixedClock })
  const config = getDefaultProductAgentConfig()
  config.workspace.storageRoot = workspaceRoot

  // Plan: init-step (skill) → research-step (subagent, pauses) → prd-step (subagent, needs input)
  const plan = {
    id: 'plan-resume-test',
    artifactKind: 'prd',
    entryId: 'init-step',
    createdAt: fixedClock(),
    version: 'test-plan',
    nodes: {
      'init-step': {
        id: 'init-step',
        label: 'Initialize',
        task: { kind: 'init' },
        status: 'pending' as const,
        dependsOn: [] as string[],
        metadata: { skillId: 'init', kind: 'skill' }
      },
      'research-step': {
        id: 'research-step',
        label: 'Research',
        task: { kind: 'subagent', agentId: 'research.agent' },
        status: 'pending' as const,
        dependsOn: ['init-step'],
        metadata: {
          kind: 'subagent',
          subagentId: 'research.agent',
          artifactKind: 'research'
        }
      },
      'prd-step': {
        id: 'prd-step',
        label: 'Generate PRD',
        task: { kind: 'subagent', agentId: 'prd.agent' },
        status: 'pending' as const,
        dependsOn: ['research-step'],
        metadata: {
          kind: 'subagent',
          subagentId: 'prd.agent',
          artifactKind: 'prd'
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

  const initArtifact = {
    id: 'artifact-init',
    kind: 'prd',
    version: '0.1.0',
    data: { sections: {}, metadata: {}, validation: { is_valid: true, issues: [] as string[], warnings: [] as string[] } },
    metadata: { createdAt: fixedClock().toISOString() }
  }

  const skillRunner = {
    async invoke() {
      return { output: initArtifact.data, metadata: { artifact: initArtifact }, confidence: 0.9 }
    }
  }

  const verifier = {
    async verify({ artifact }: any) {
      return { status: 'pass' as const, artifact, issues: [] as any[] }
    }
  }

  // The SectionRoutingRequest-shaped input that the PRD subagent expects
  const sectionRoutingRequest = {
    message: 'generate product requirements for a budgeting app',
    context: {
      contextPayload: { categorizedContext: [{ type: 'note', content: 'test context' }] },
      existingPRD: undefined,
      conversationHistory: []
    },
    settings: { model: 'test-model', temperature: 0.7, maxTokens: 4096 }
  }

  // Track subagent executions
  let researchExecutions = 0
  let prdExecutions = 0
  let prdReceivedInput: unknown = undefined

  const researchSubagent: SubagentLifecycle = {
    metadata: {
      id: 'research.agent',
      label: 'Research Agent',
      version: '1.0.0',
      artifactKind: 'research',
      sourceKinds: []
    },
    async execute(request) {
      researchExecutions++
      if (researchExecutions === 1) {
        // First call: return awaiting-plan-confirmation
        return {
          artifact: {
            id: 'research-partial',
            kind: 'research',
            version: '0.1.0',
            data: { partial: true },
            metadata: {
              extras: {
                status: 'awaiting-plan-confirmation',
                plan: { steps: ['search market data', 'analyze competitors'] }
              }
            }
          },
          metadata: { status: 'awaiting-plan-confirmation' }
        }
      }
      // Second call (resumed with approvedPlan): return completed
      assert.equal((request.params as any).requirePlanConfirmation, false)
      return {
        artifact: {
          id: 'research-complete',
          kind: 'research',
          version: '1.0.0',
          data: { findings: ['market is growing'] },
          metadata: {}
        },
        metadata: {}
      }
    }
  }

  const prdSubagent: SubagentLifecycle = {
    metadata: {
      id: 'prd.agent',
      label: 'PRD Agent',
      version: '1.0.0',
      artifactKind: 'prd',
      sourceKinds: ['research']
    },
    async execute(request) {
      prdExecutions++
      prdReceivedInput = (request.params as any).input
      return {
        artifact: {
          id: 'prd-artifact',
          kind: 'prd',
          version: '1.0.0',
          data: { sections: { summary: 'A budgeting app PRD' }, metadata: {}, validation: { is_valid: true, issues: [], warnings: [] } },
          metadata: {}
        },
        metadata: {}
      }
    }
  }

  const controller = new GraphController(
    {
      planner,
      skillRunner,
      verifier: { primary: verifier, registry: { prd: verifier } },
      workspace: workspaceDao,
      subagents: [researchSubagent, prdSubagent]
    },
    config,
    {
      clock: fixedClock,
      idFactory: () => 'resume-test-run'
    }
  )

  try {
    // Step 1: Start the run - research subagent should pause
    const startSummary = await controller.start({
      request: {
        artifactKind: 'prd',
        input: sectionRoutingRequest,
        createdBy: 'unit-test'
      }
    })

    assert.equal(startSummary.status, 'awaiting-input', 'run should be awaiting input after research subagent pauses')
    assert.equal(researchExecutions, 1, 'research subagent should have been called once')
    assert.equal(prdExecutions, 0, 'prd subagent should not have been called yet')

    // Step 2: Resume with approved plan - research completes, then PRD executes
    const approvedPlan = { steps: ['search market data', 'analyze competitors'] }
    const resumeSummary = await controller.resumeSubagent(
      'resume-test-run',
      'research-step',
      approvedPlan
    )

    assert.equal(resumeSummary.status, 'completed', 'run should complete after resume')
    assert.equal(researchExecutions, 2, 'research subagent should have been called twice (initial + resume)')
    assert.equal(prdExecutions, 1, 'prd subagent should have been called once during continuation')

    // Step 3: Verify the PRD subagent received the correct input
    assert.ok(prdReceivedInput, 'PRD subagent should have received params.input')
    assert.deepEqual(prdReceivedInput, sectionRoutingRequest, 'PRD subagent params.input should be the full SectionRoutingRequest')
  } finally {
    await workspaceDao.teardown('resume-test-run').catch(() => {})
    await fs.rm(workspaceRoot, { recursive: true, force: true })
  }
})
