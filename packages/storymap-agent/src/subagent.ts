import { randomUUID } from 'node:crypto'
import { z } from 'zod'

import type {
  Artifact,
  SubagentLifecycle,
  SubagentManifest,
  SubagentRequest,
  SubagentResult
} from '@product-agents/product-agent'
import { runWithTraceContext } from '@product-agents/observability'
import { OpenRouterClient } from '@product-agents/openrouter-client'

import { resolveStoryMapContext } from './context-resolver'
import { buildStoryMapPrompt } from './prompt-template'
import type { StoryMapArtifact } from '@product-agents/product-agent'
import { STORYMAP_AGENT_VERSION } from './version'

const DEFAULT_LABEL = 'Story Map Agent'
const DEFAULT_DESCRIPTION = 'Generates user story maps from PRD, personas, and research.'

export const storymapAgentManifest: SubagentManifest = {
  id: 'storymap.builder',
  package: '@product-agents/storymap-agent',
  version: STORYMAP_AGENT_VERSION,
  label: DEFAULT_LABEL,
  description: DEFAULT_DESCRIPTION,
  creates: 'story-map',
  consumes: ['prd', 'persona', 'research'],
  capabilities: ['synthesize', 'plan'],
  entry: '@product-agents/storymap-agent',
  exportName: 'createStorymapAgentSubagent',
  tags: ['storymap', 'planning', 'user-stories']
}

export interface StorymapSubagentParams {
  input?: unknown
  contextPayload?: unknown
}

interface CreateStorymapSubagentOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  idFactory?: () => string
  clock?: () => Date
  client?: OpenRouterClient
}

const toArtifact = (
  data: StoryMapArtifact,
  request: SubagentRequest<StorymapSubagentParams>,
  idFactory: () => string
): Artifact<StoryMapArtifact> => {
  const id = `artifact-${request.run.runId}-${idFactory()}`
  return {
    id,
    kind: 'story-map',
    version: data.version ?? '1.0.0',
    label: data.label ?? 'Story Map',
    data,
    metadata: {
      createdAt: request.run.startedAt.toISOString(),
      createdBy: request.run.request.createdBy,
      tags: ['story-map'],
      extras: {
        sourcesUsed: data.personasReferenced?.length ? ['persona'] : undefined,
        subagentId: storymapAgentManifest.id,
        parentRunId: request.run.runId,
        sourceArtifactId: request.sourceArtifact?.id
      }
    }
  }
}

export const createStorymapAgentSubagent = (
  options?: CreateStorymapSubagentOptions
): SubagentLifecycle<StorymapSubagentParams, unknown, StoryMapArtifact> => {
  const clock = options?.clock ?? (() => new Date())
  const idFactory = options?.idFactory ?? (() => randomUUID())
  const client = options?.client ?? new OpenRouterClient()

  return {
    metadata: {
      id: storymapAgentManifest.id,
      label: storymapAgentManifest.label,
      version: storymapAgentManifest.version,
      artifactKind: storymapAgentManifest.creates,
      sourceKinds: storymapAgentManifest.consumes,
      description: storymapAgentManifest.description,
      tags: storymapAgentManifest.capabilities
    },
    async execute(request: SubagentRequest<StorymapSubagentParams>): Promise<
      SubagentResult<StoryMapArtifact>
    > {
      const params = request.params ?? {}

      const context = resolveStoryMapContext(request.sourceArtifacts, request.sourceArtifact)

      const requestInput = request.run.request.input as { message?: string; context?: { conversationHistory?: Array<{ role?: string; content?: string }> } } | undefined
      const message = requestInput?.message
      const conversationHistory = requestInput?.context?.conversationHistory
      const conversationSummary = Array.isArray(conversationHistory)
        ? conversationHistory
            .filter(entry => typeof entry?.content === 'string')
            .slice(-6)
            .map(entry => `${entry?.role ?? 'user'}: ${(entry?.content as string).trim()}`)
            .join(' | ')
        : undefined

      const prompt = buildStoryMapPrompt(context, message, conversationSummary)

      const model = options?.model ?? request.run.settings.model
      const temperature = options?.temperature ?? request.run.settings.temperature ?? 0.4
      const maxTokens = options?.maxTokens ?? request.run.settings.maxOutputTokens ?? 1200

      const executeWithinTrace = async (): Promise<SubagentResult<StoryMapArtifact>> => {
        const object = await client.generateStructured<StoryMapArtifact>({
          model,
          prompt,
          temperature,
          maxTokens,
          schema: z.any() as unknown as z.ZodSchema<StoryMapArtifact>
        })

        const artifact = toArtifact(object, request, idFactory)

        return {
          artifact,
          metadata: {
            model,
            temperature,
            maxTokens,
            promptLength: prompt.length,
            sourcesUsed: context.sourcesUsed
          }
        }
      }

      if (request.traceContext?.traceId) {
        return runWithTraceContext(
          request.traceContext.traceId,
          executeWithinTrace,
          request.traceContext.parentSpanId
        )
      }
      return executeWithinTrace()
    }
  }
}

export default createStorymapAgentSubagent
