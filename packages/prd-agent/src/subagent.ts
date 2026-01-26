import { randomUUID } from 'node:crypto'

import {
  AgentController,
  type Artifact,
  type ArtifactKind,
  type ProductAgentConfig,
  type SubagentLifecycle,
  type SubagentManifest,
  type SubagentRequest,
  type SubagentResult,
  type ProgressEvent,
  type RunRequest
} from '@product-agents/product-agent'
import type { SectionRoutingRequest, SectionRoutingResponse } from '@product-agents/prd-shared'
import { createPrdController } from './compositions/prd-controller'
import { PRD_AGENT_VERSION } from './version'

const DEFAULT_LABEL = 'PRD Agent'
const DEFAULT_DESCRIPTION =
  'Generates structured Product Requirements Documents via the PRD planner, skill runner, and verifier.'

export const prdAgentManifest: SubagentManifest = {
  id: 'prd.core.agent',
  package: '@product-agents/prd-agent',
  version: PRD_AGENT_VERSION,
  label: DEFAULT_LABEL,
  description: DEFAULT_DESCRIPTION,
  creates: 'prd',
  consumes: ['prompt', 'brief', 'persona'],
  capabilities: ['plan', 'execute', 'verify'],
  entry: '@product-agents/prd-agent',
  exportName: 'createPrdAgentSubagent',
  tags: ['prd', 'controller']
}

export interface PrdAgentSubagentParams {
  input: SectionRoutingRequest
  createdBy?: string
  runId?: string
  attributes?: Record<string, unknown>
}

interface CreatePrdAgentSubagentOptions {
  controller?: AgentController
  createController?: () => AgentController
  config?: ProductAgentConfig
  workspaceRoot?: string
  clock?: () => Date
}

const toArtifactWithSourceMetadata = (
  artifact: Artifact<SectionRoutingResponse>,
  request: SubagentRequest<PrdAgentSubagentParams>
): Artifact<SectionRoutingResponse> => {
  const extras = {
    ...(artifact.metadata?.extras ?? {}),
    source: {
      parentRunId: request.run.runId,
      parentArtifactKind: request.run.request.artifactKind,
      sourceArtifactId: request.sourceArtifact?.id,
      subagentId: prdAgentManifest.id
    }
  }

  return {
    ...(artifact as Artifact<SectionRoutingResponse>),
    metadata: {
      createdAt: artifact.metadata?.createdAt ?? new Date().toISOString(),
      updatedAt: artifact.metadata?.updatedAt,
      ...artifact.metadata,
      extras
    }
  }
}

const forwardProgress =
  (emit?: (event: ProgressEvent) => void, collect?: ProgressEvent[]) =>
  (event: ProgressEvent) => {
    collect?.push(event)
    emit?.(event)
  }

export const createPrdAgentSubagent = (
  options?: CreatePrdAgentSubagentOptions
): SubagentLifecycle<PrdAgentSubagentParams, unknown, SectionRoutingResponse> => {
  let cachedController: AgentController | undefined = options?.controller

  const ensureController = (): AgentController => {
    if (options?.createController) {
      return options.createController()
    }
    if (!cachedController) {
      cachedController = createPrdController({
        config: options?.config,
        workspaceRoot: options?.workspaceRoot,
        clock: options?.clock
      })
    }
    return cachedController
  }

  return {
    metadata: {
      id: prdAgentManifest.id,
      label: prdAgentManifest.label,
      version: prdAgentManifest.version,
      artifactKind: prdAgentManifest.creates,
      sourceKinds: prdAgentManifest.consumes,
      description: prdAgentManifest.description,
      tags: prdAgentManifest.capabilities
    },
    async execute(request: SubagentRequest<PrdAgentSubagentParams>): Promise<
      SubagentResult<SectionRoutingResponse>
    > {
      if (!request.params?.input) {
        throw new Error('PRD subagent requires input payload')
      }

      const controller = ensureController()
      const prdRunId = request.params.runId ?? `prd-subagent-${randomUUID()}`
      const inheritedIntentPlan = request.run.intentPlan ?? request.run.request.intentPlan
      const runAttributes: Record<string, unknown> = {
        ...(request.params.attributes ?? {}),
        parentRunId: request.run.runId,
        subagentId: prdAgentManifest.id
      }

      if (inheritedIntentPlan) {
        runAttributes.intent = inheritedIntentPlan
      }

      const runRequest: RunRequest<SectionRoutingRequest> = {
        artifactKind: 'prd',
        input: request.params.input,
        createdBy: request.params.createdBy ?? request.run.request.createdBy ?? DEFAULT_LABEL,
        attributes: runAttributes,
        intentPlan: inheritedIntentPlan
      }

      const progress: ProgressEvent[] = []
      const summary = await controller.start(
        {
          runId: prdRunId,
          request: runRequest
        },
        {
          emit: forwardProgress(request.emit, progress),
          metadata: {
            parentRunId: request.run.runId,
            sourceArtifactId: request.sourceArtifact?.id,
            subagentId: prdAgentManifest.id
          }
        }
      )

      // Allow awaiting-input to propagate for clarification flows
      if (summary.status !== 'completed' || !summary.artifact) {
        if (summary.status === 'awaiting-input') {
          return {
            // Artifact may be absent for clarification flows; cast to satisfy interface.
            artifact: summary.artifact as Artifact<SectionRoutingResponse>,
            progress,
            metadata: {
              subagentRunId: summary.runId,
              originatingSubagent: prdAgentManifest.id,
              runStatus: summary.status,
              ...(summary.metadata?.clarification ? { clarification: summary.metadata.clarification } : {})
            }
          }
        }
        throw new Error(`PRD subagent run did not complete successfully (status: ${summary.status})`)
      }

      return {
        artifact: toArtifactWithSourceMetadata(
          summary.artifact as Artifact<SectionRoutingResponse>,
          request
        ),
        progress,
        metadata: {
          subagentRunId: summary.runId,
          originatingSubagent: prdAgentManifest.id
        }
      }
    }
  }
}
