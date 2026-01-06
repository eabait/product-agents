import http, { IncomingMessage, ServerResponse } from 'node:http'
import { URL } from 'node:url'
import { randomUUID } from 'node:crypto'
import path from 'node:path'

import { z } from 'zod'
import { config as loadEnv } from 'dotenv'
import { expand as expandEnv } from 'dotenv-expand'

import { createPrdController } from '@product-agents/prd-agent'
import {
  loadProductAgentConfig,
  type ArtifactIntent,
  type ArtifactKind,
  type Artifact,
  type ControllerRunSummary,
  type ProgressEvent,
  type ProductAgentApiOverrides,
  type RunRequest,
  SubagentRegistry
} from '@product-agents/product-agent'
import { personaAgentManifest } from '@product-agents/persona-agent'
import { researchAgentManifest, createResearchAgentSubagent } from '@product-agents/research-agent'
import type { SectionRoutingRequest } from '@product-agents/prd-shared'

const loadEnvFiles = () => {
  const envPaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '.env.local'),
    path.resolve(__dirname, '../..', '.env'),
    path.resolve(__dirname, '../..', '.env.local')
  ]

  envPaths
    .filter((envPath, index, self) => self.indexOf(envPath) === index)
    .forEach(envPath => {
      const result = loadEnv({ path: envPath, override: envPath.endsWith('.env.local') })
      expandEnv(result)
    })
}

loadEnvFiles()

const PORT = parseInt(process.env.PRODUCT_AGENT_API_PORT ?? '3001', 10)
const HOST = process.env.PRODUCT_AGENT_API_HOST ?? '0.0.0.0'

type RunStatus = ControllerRunSummary['status'] | 'pending' | 'running' | 'blocked'

type RunMetadata = Record<string, unknown> & {
  intent?: ArtifactIntent
  previewArtifacts?: Array<Record<string, unknown>>
}

interface RunRecord {
  id: string
  artifactType: string
  status: RunStatus
  createdAt: string
  updatedAt: string
  request: StartRunPayload
  summary?: ControllerRunSummary
  clarification?: unknown
  error?: string
  events: ProgressEvent[]
  metadata?: RunMetadata | null
  result?: unknown
  usage?: Record<string, unknown> | null
}

const MAX_RUN_HISTORY = 50
const config = loadProductAgentConfig()
const subagentRegistry = new SubagentRegistry()
const registeredSubagents = new Set<string>()

// Custom loader for research agent to avoid dynamic TS import
const researchAgentLoader = async () => {
  // Create a wrapper that provides the Tavily API key from runtime env
  const createResearchAgentWithConfig = (options?: any) => {
    return createResearchAgentSubagent({
      ...options,
      tavilyApiKey: options?.tavilyApiKey ?? process.env.TAVILY_API_KEY
    })
  }

  return {
    createResearchAgentSubagent: createResearchAgentWithConfig
  }
}

for (const manifest of config.subagents.manifests) {
  // Use custom loader for research agent
  if (manifest.id === researchAgentManifest.id) {
    subagentRegistry.register(manifest, researchAgentLoader)
  } else {
    subagentRegistry.register(manifest)
  }
  registeredSubagents.add(manifest.id)
}

if (!registeredSubagents.has(personaAgentManifest.id)) {
  subagentRegistry.register(personaAgentManifest)
}

if (!registeredSubagents.has(researchAgentManifest.id)) {
  subagentRegistry.register(researchAgentManifest, researchAgentLoader)
}

const controller = createPrdController({ config, subagentRegistry })
const runRecords = new Map<string, RunRecord>()
const streamSubscribers = new Map<string, Set<ServerResponse>>()
const AGENT_CAPABILITIES = ['structured_output', 'streaming'] as const
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type'
}

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  content: z.string(),
  timestamp: z.union([z.string(), z.date()]).optional()
})

const SettingsSchema = z.object({
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(1).max(100000),
  apiKey: z.string().optional(),
  streaming: z.boolean().optional()
})

const StartRunSchema = z.object({
  artifactType: z.string().default('prd'),
  messages: z.array(MessageSchema).min(1),
  settings: SettingsSchema.optional(),
  contextPayload: z.any().optional(),
  targetSections: z.array(z.string()).optional()
})

type StartRunPayload = z.infer<typeof StartRunSchema>

const readRequestBody = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', chunk => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    })
    req.once('error', error => reject(error))
    req.once('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
  })

const parseJson = async <T>(req: IncomingMessage): Promise<T> => {
  const raw = await readRequestBody(req)
  if (!raw) {
    return {} as T
  }
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    throw new Error('Invalid JSON payload')
  }
}

const buildConversationContext = (messages: StartRunPayload['messages']): string =>
  messages.map(message => `${message.role}: ${message.content}`).join('\n\n')

const extractExistingArtifact = (messages: StartRunPayload['messages']): unknown => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    try {
      const parsed = JSON.parse(message.content)
      if (parsed && typeof parsed === 'object') {
        const candidate = parsed as Record<string, unknown>
        const hasProblemStatement = typeof candidate.problemStatement === 'string'
        const hasSections = Object.prototype.hasOwnProperty.call(candidate, 'sections')
        if (hasProblemStatement || hasSections) {
          return parsed
        }
      }
    } catch {
      // ignore malformed JSON snippets while scanning history
    }
  }
  return undefined
}

const toSectionRoutingRequest = (payload: StartRunPayload): SectionRoutingRequest => {
  const existingArtifact = extractExistingArtifact(payload.messages)

  return {
    message: buildConversationContext(payload.messages),
    context: {
      contextPayload: payload.contextPayload,
      existingPRD: existingArtifact,
      conversationHistory: payload.messages
    },
    settings: payload.settings
      ? {
          model: payload.settings.model,
          temperature: payload.settings.temperature,
          maxTokens: payload.settings.maxTokens,
          apiKey: payload.settings.apiKey
        }
      : undefined,
    targetSections: payload.targetSections
  }
}

const toApiOverrides = (payload: StartRunPayload): ProductAgentApiOverrides | undefined => {
  const overrides: ProductAgentApiOverrides = {}
  if (payload.settings?.model) {
    overrides.model = payload.settings.model
  }
  if (payload.settings?.temperature !== undefined) {
    overrides.temperature = payload.settings.temperature
  }
  if (payload.settings?.maxTokens !== undefined) {
    overrides.maxOutputTokens = payload.settings.maxTokens
  }
  return Object.keys(overrides).length > 0 ? overrides : undefined
}

const writeJson = (res: ServerResponse, status: number, payload: Record<string, unknown>) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    ...CORS_HEADERS
  })
  res.end(JSON.stringify(payload))
}

const setSseHeaders = (res: ServerResponse) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    Connection: 'keep-alive',
    'Cache-Control': 'no-cache',
    ...CORS_HEADERS
  })
}

const sendSse = (res: ServerResponse, eventType: string, data: unknown) => {
  res.write(`event: ${eventType}\n`)
  res.write(`data: ${JSON.stringify(data ?? {})}\n\n`)
}

const endSse = (res: ServerResponse) => {
  sendSse(res, 'close', {})
  res.end()
}

const getSubscriberSet = (runId: string): Set<ServerResponse> => {
  let subscribers = streamSubscribers.get(runId)
  if (!subscribers) {
    subscribers = new Set()
    streamSubscribers.set(runId, subscribers)
  }
  return subscribers
}

const broadcastEvent = (runId: string, eventType: string, data: unknown) => {
  const subscribers = streamSubscribers.get(runId)
  if (!subscribers || subscribers.size === 0) {
    return
  }

  for (const subscriber of [...subscribers]) {
    try {
      sendSse(subscriber, eventType, data)
    } catch (error) {
      console.warn(`[product-agent/api] failed to write SSE for run ${runId}:`, error)
      subscribers.delete(subscriber)
      try {
        subscriber.end()
      } catch {
        // ignore secondary errors during cleanup
      }
    }
  }
}

const closeSubscribers = (runId: string) => {
  const subscribers = streamSubscribers.get(runId)
  if (!subscribers) {
    return
  }

  for (const subscriber of subscribers) {
    try {
      endSse(subscriber)
    } catch {
      // ignore
    }
  }
  streamSubscribers.delete(runId)
}

const findRunOrRespond = (runId: string, res: ServerResponse): RunRecord | undefined => {
  const record = runRecords.get(runId)
  if (!record) {
    writeJson(res, 404, { error: 'Run not found' })
    return undefined
  }
  return record
}

const updateRunRecord = (runId: string, updates: Partial<RunRecord>) => {
  const record = runRecords.get(runId)
  if (!record) {
    return
  }

  Object.assign(record, updates)
  record.updatedAt = new Date().toISOString()
}

const appendProgressEvent = (runId: string, event: ProgressEvent) => {
  const record = runRecords.get(runId)
  if (!record) {
    return
  }

  record.events.push(event)
  if (record.events.length > 200) {
    record.events.shift()
  }
  record.status = event.status ?? (record.status === 'pending' ? 'running' : record.status)
  record.updatedAt = new Date().toISOString()
}

const registerRun = (payload: StartRunPayload): RunRecord => {
  const runId = randomUUID()
  const timestamp = new Date().toISOString()
  const record: RunRecord = {
    id: runId,
    artifactType: payload.artifactType ?? 'prd',
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
    request: payload,
    events: [],
    metadata: {},
    result: null,
    usage: null
  }

  runRecords.set(runId, record)

  if (runRecords.size > MAX_RUN_HISTORY) {
    const oldest = [...runRecords.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]
    runRecords.delete(oldest.id)
    streamSubscribers.delete(oldest.id)
  }

  return record
}

const startRunExecution = async (record: RunRecord) => {
  const sectionRequest = toSectionRoutingRequest(record.request)
  const overrides = toApiOverrides(record.request)

  const attributes: Record<string, unknown> = {
    source: 'apps/api',
    conversationHistory: record.request.messages
  }

  if (overrides) {
    attributes.apiOverrides = overrides
  }

  const runRequest: RunRequest<SectionRoutingRequest> = {
    artifactKind: record.artifactType,
    input: sectionRequest,
    createdBy: 'apps/api',
    attributes
  }

  const ensureRecordMetadata = (): RunMetadata => {
    if (!record.metadata || typeof record.metadata !== 'object') {
      record.metadata = {}
    }
    return record.metadata as RunMetadata
  }

  const enrichProgressEvent = (event: ProgressEvent): ProgressEvent => {
    const payload = (event.payload ?? {}) as Record<string, unknown>

    if (event.type === 'plan.created') {
      const plan = payload.plan as { metadata?: Record<string, unknown> } | undefined
      const intentMetadata = plan?.metadata?.intent as ArtifactIntent | undefined
      if (intentMetadata) {
        const metadata = ensureRecordMetadata()
        metadata.intent = intentMetadata
        return {
          ...event,
          payload: {
            ...payload,
            intent: intentMetadata
          }
        }
      }
      return event
    }

    if (event.type === 'artifact.delivered') {
      const artifactPreview = payload.artifact as Record<string, unknown> | undefined
      if (artifactPreview) {
        const metadata = ensureRecordMetadata()
        metadata.previewArtifacts = metadata.previewArtifacts ?? []
        metadata.previewArtifacts?.push({
          id: artifactPreview.id,
          kind: artifactPreview.artifactKind ?? artifactPreview.kind,
          label: artifactPreview.label,
          transition: payload.transition
        })
      }
      return event
    }

    return event
  }

  try {
    updateRunRecord(record.id, { status: 'running' })
    const summary = await controller.start(
      {
        runId: record.id,
        request: runRequest
      },
      {
        emit(event) {
          const enriched = enrichProgressEvent(event)
          appendProgressEvent(record.id, enriched)
          broadcastEvent(record.id, 'progress', enriched)
        }
      }
    )

    const artifact = summary.artifact ?? null
    const metadataSnapshot = ensureRecordMetadata()
    const mergedMetadata =
      summary.metadata && typeof summary.metadata === 'object'
        ? ({ ...summary.metadata, ...metadataSnapshot } as RunMetadata)
        : metadataSnapshot
    record.metadata = mergedMetadata
    updateRunRecord(record.id, {
      status: summary.status,
      summary,
      clarification: summary.status === 'awaiting-input' ? summary.metadata?.clarification ?? null : null,
      error: undefined,
      result: artifact,
      metadata: mergedMetadata,
      usage: (summary.metadata?.usage as Record<string, unknown> | undefined) ?? null
    })

    if (summary.status === 'awaiting-input') {
      const clarification = summary.metadata?.clarification ?? null
      broadcastEvent(record.id, 'clarification', clarification)
      closeSubscribers(record.id)
      return
    }

    broadcastEvent(record.id, 'complete', {
      artifact,
      metadata: mergedMetadata ?? null,
      usage: summary.metadata?.usage ?? null,
      status: summary.status,
      intent: mergedMetadata.intent ?? null,
      previews: mergedMetadata.previewArtifacts ?? [],
      subagents: summary.subagents ?? []
    })
    closeSubscribers(record.id)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Run execution failed'
    updateRunRecord(record.id, {
      status: 'failed',
      error: message
    })
    broadcastEvent(record.id, 'error', { error: message })
    closeSubscribers(record.id)
  }
}

const handleCorsPreflight = (req: IncomingMessage, res: ServerResponse): boolean => {
  if (req.method !== 'OPTIONS') {
    return false
  }

  res.writeHead(204, {
    ...CORS_HEADERS,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': CORS_HEADERS['Access-Control-Allow-Headers']
  })
  res.end()
  return true
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    writeJson(res, 400, { error: 'Invalid request URL' })
    return
  }

  if (handleCorsPreflight(req, res)) {
    return
  }

  const url = new URL(req.url, `http://${req.headers.host ?? `${HOST}:${PORT}`}`)

  if (req.method === 'GET' && url.pathname === '/health') {
    const registryManifests = subagentRegistry.list()
    const builtInSubagents = (controller as any).subagents ?? []

    const subagentMap = new Map<
      string,
      {
        id: string
        label: string
        artifactKind: ArtifactKind
        description?: string
        package?: string
        version?: string
        capabilities?: string[]
        consumes?: ArtifactKind[]
        tags?: string[]
      }
    >()

    registryManifests.forEach(manifest => {
      subagentMap.set(manifest.id, {
        id: manifest.id,
        label: manifest.label,
        artifactKind: manifest.creates,
        description: manifest.description,
        package: manifest.package,
        version: manifest.version,
        capabilities: manifest.capabilities,
        consumes: manifest.consumes,
        tags: manifest.tags
      })
    })

    builtInSubagents.forEach((subagent: any) => {
      if (subagentMap.has(subagent.metadata.id)) {
        return
      }
      subagentMap.set(subagent.metadata.id, {
        id: subagent.metadata.id,
        label: subagent.metadata.label ?? subagent.metadata.id,
        artifactKind: subagent.metadata.artifactKind,
        description: subagent.metadata.description,
        package: '@product-agents/product-agent',
        version: subagent.metadata.version,
        capabilities: subagent.metadata.tags,
        consumes: subagent.metadata.sourceKinds,
        tags: subagent.metadata.tags
      })
    })

    const allSubagents = Array.from(subagentMap.values())
    const subAgentSettings = allSubagents.reduce<
      Record<string, { model: string; temperature: number; maxTokens: number }>
    >((acc, manifest) => {
      acc[manifest.id] = {
        model: config.runtime.defaultModel,
        temperature: config.runtime.defaultTemperature,
        maxTokens: config.runtime.maxOutputTokens
      }
      return acc
    }, {})

    const metadata = {
      planner: controller.planner.constructor.name,
      requiredCapabilities: [...AGENT_CAPABILITIES],
      skillPacks: config.skills.enabledPacks,
      subAgents: allSubagents
    }

    writeJson(res, 200, {
      status: 'ok',
      controller: 'product-agent',
      planner: controller.planner.constructor.name,
      defaultSettings: {
        model: config.runtime.defaultModel,
        temperature: config.runtime.defaultTemperature,
        maxTokens: config.runtime.maxOutputTokens,
        subAgentSettings
      },
      agentInfo: {
        name: 'Product Agent',
        description: 'Graph-based orchestrator for product artifacts',
        requiredCapabilities: [...AGENT_CAPABILITIES],
        defaultModel: config.runtime.defaultModel
      },
      metadata
    })
    return
  }

  if (req.method === 'POST' && url.pathname === '/runs') {
    try {
      const payload = StartRunSchema.parse(await parseJson<unknown>(req))
      if (payload.settings?.streaming === false) {
        writeJson(res, 400, {
          error: 'Non-streaming runs are not supported by the thin API. Set settings.streaming to true.'
        })
        return
      }
      const record = registerRun(payload)
      startRunExecution(record).catch(error => {
        console.error('[product-agent/api] unhandled run error:', error)
      })

      writeJson(res, 202, {
        runId: record.id,
        status: record.status,
        artifactType: record.artifactType,
        streamUrl: `/runs/${record.id}/stream`
      })
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? 'Invalid request payload'
          : error instanceof Error
            ? error.message
            : 'Unable to start run'
      writeJson(res, 400, { error: message })
    }
    return
  }

  if (req.method === 'GET' && /^\/runs\/[^/]+$/.test(url.pathname)) {
    const runId = url.pathname.split('/')[2]
    const record = findRunOrRespond(runId, res)
    if (!record) return

    writeJson(res, 200, {
      runId: record.id,
      status: record.status,
      artifactType: record.artifactType,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      summary: record.summary ?? null,
      clarification: record.clarification ?? null,
      error: record.error ?? null,
      events: record.events,
      metadata: record.metadata ?? null,
      result: record.result ?? null,
      usage: record.usage ?? null
    })
    return
  }

  if (req.method === 'GET' && /^\/runs\/[^/]+\/stream$/.test(url.pathname)) {
    const runId = url.pathname.split('/')[2]
    const record = findRunOrRespond(runId, res)
    if (!record) return

    setSseHeaders(res)

    const subscribers = getSubscriberSet(runId)
    subscribers.add(res)

    res.on('close', () => {
      subscribers.delete(res)
    })

    // Send buffered progress so the client catches up.
    for (const event of record.events) {
      sendSse(res, 'progress', event)
    }

    if (record.status === 'failed' && record.error) {
      sendSse(res, 'error', { error: record.error })
      endSse(res)
      return
    }

    if (record.status === 'awaiting-input' && record.clarification) {
      sendSse(res, 'clarification', record.clarification)
      endSse(res)
      return
    }

    if (record.status === 'completed' && record.summary) {
      sendSse(res, 'complete', {
        artifact: record.summary.artifact ?? null,
        metadata: record.summary.metadata ?? null,
        status: record.summary.status,
        subagents: record.summary.subagents ?? []
      })
      endSse(res)
      return
    }

    return
  }

  writeJson(res, 404, { error: 'Not found' })
})

server.listen(PORT, HOST, () => {
  console.log(`[product-agent/api] listening on http://${HOST}:${PORT}`)
  console.log(`[product-agent/api] planner: ${controller.planner.constructor.name}`)
})
