import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createPrdAgentSubagent,
  prdAgentManifest
} from '../src/subagent'
import {
  type AgentController,
  type ArtifactIntent,
  type ControllerRunSummary,
  type EffectiveRunSettings,
  type ProgressEvent,
  type RunRequest,
  type WorkspaceHandle,
  resolveRunSettings,
  getDefaultProductAgentConfig
} from '@product-agents/product-agent'
import type {
  SectionRoutingRequest,
  SectionRoutingResponse,
  ConfidenceAssessment
} from '@product-agents/prd-shared'

class StubController implements AgentController {
  planner = {} as any
  skillRunner = {} as any
  verifier = {} as any
  workspace = {} as any
  lastRequest?: RunRequest<SectionRoutingRequest>

  async start(
    input: { runId?: string; request: RunRequest<SectionRoutingRequest> },
    options?: { emit?: (event: ProgressEvent) => void }
  ): Promise<ControllerRunSummary<SectionRoutingResponse>> {
    this.lastRequest = input.request
    const runId = input.runId ?? 'stub-run'
    options?.emit?.({
      type: 'run.status',
      runId,
      timestamp: new Date().toISOString(),
      status: 'running',
      message: 'stub run started'
    })

    const highConfidence: ConfidenceAssessment = { level: 'high' }
    const response: SectionRoutingResponse = {
      sections: {
        summary: { content: 'stub' }
      },
      metadata: {
        sections_updated: ['summary'],
        confidence_assessments: {},
        overall_confidence: highConfidence
      },
      validation: {
        is_valid: true,
        issues: [],
        warnings: []
      }
    }

    const artifact = {
      id: 'artifact-stub',
      kind: 'prd',
      version: '1.0.0',
      label: 'Stub PRD',
      data: response,
      metadata: {
        createdAt: new Date().toISOString()
      }
    }

    const workspaceHandle: WorkspaceHandle = {
      descriptor: {
        runId,
        root: '/tmp',
        createdAt: new Date(),
        kind: 'prd'
      },
      resolve: (...segments: string[]) => segments.join('/')
    }

    return {
      runId,
      status: 'completed',
      artifact,
      skillResults: [],
      verification: undefined,
      completedAt: new Date(),
      workspace: workspaceHandle
    }
  }

  async resume() {
    throw new Error('not implemented')
  }
}

const buildRunContext = () => {
  const config = getDefaultProductAgentConfig()
  const settings: EffectiveRunSettings = resolveRunSettings(config)
  const intentPlan: ArtifactIntent = {
    source: 'user',
    requestedArtifacts: ['prd'],
    targetArtifact: 'prd',
    transitions: [
      {
        toArtifact: 'prd'
      }
    ],
    confidence: 0.9
  }
  return {
    runId: 'parent-run',
    request: {
      artifactKind: 'orchestrator',
      input: { message: 'Generate product brief' },
      createdBy: 'unit-test',
      intentPlan
    },
    settings,
    workspace: {
      descriptor: {
        runId: 'parent-run',
        root: '/tmp',
        createdAt: new Date(),
        kind: 'orchestrator'
      },
      resolve: (...segments: string[]) => segments.join('/')
    },
    startedAt: new Date(),
    intentPlan
  }
}

test('prdAgentManifest exposes metadata for registry discovery', () => {
  assert.equal(prdAgentManifest.id, 'prd.core.agent')
  assert.equal(prdAgentManifest.package, '@product-agents/prd-agent')
  assert.equal(prdAgentManifest.creates, 'prd')
  assert.ok(prdAgentManifest.consumes.includes('prompt'))
})

test('createPrdAgentSubagent executes controller and returns enriched artifact', async () => {
  const stubController = new StubController()
  const subagent = createPrdAgentSubagent({
    createController: () => stubController
  })

  const runContext = buildRunContext()
  const result = await subagent.execute({
    params: {
      input: {
        message: 'Create a PRD for a budgeting assistant',
        context: {}
      }
    },
    run: runContext,
    emit: () => undefined
  })

  assert.equal(stubController.lastRequest?.artifactKind, 'prd')
  assert.deepEqual(stubController.lastRequest?.intentPlan, runContext.intentPlan)
  assert.equal(result.artifact.kind, 'prd')
  assert.equal(result.metadata?.originatingSubagent, prdAgentManifest.id)
  assert.ok(result.artifact.metadata?.extras?.source)
})
