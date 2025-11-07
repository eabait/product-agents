import type { AgentSettingsState, Message } from '@/types'

interface StartRunParams {
  messages: Message[]
  settings: AgentSettingsState
  contextPayload?: unknown
  targetSections?: string[]
  artifactType?: string
  runId?: string
  sourceArtifact?: unknown
}

interface StartRunResult {
  runId?: string
  status: string
  result?: unknown
  metadata?: Record<string, unknown> | null
  usage?: Record<string, unknown> | null
  streamUrl?: string
  artifactType?: string
  artifact?: unknown
}

export const startRun = async (params: StartRunParams): Promise<StartRunResult> => {
  const artifactType = params.artifactType ?? params.settings.artifactTypes?.[0] ?? 'prd'
  if (artifactType === 'persona') {
    if (!params.sourceArtifact) {
      throw new Error('Persona generation requires an existing PRD artifact.')
    }

    const response = await fetch('/api/subagents/persona', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        runId: params.runId,
        artifact: {
          data: params.sourceArtifact
        },
        overrides: {
          model: params.settings.model,
          temperature: params.settings.temperature,
          maxOutputTokens: params.settings.maxTokens
        }
      })
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      throw new Error(errorPayload?.error ?? `Persona run failed (${response.status})`)
    }

    const payload = await response.json()
    return {
      status: 'completed',
      result: payload,
      artifact: payload?.artifact ?? null,
      metadata: payload?.metadata ?? null,
      usage: null,
      artifactType
    }
  }
  const streamingEnabled = params.settings.streaming !== false

  if (!streamingEnabled) {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: params.messages,
        settings: params.settings,
        contextPayload: params.contextPayload,
        targetSections: params.targetSections,
        stream: false
      })
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}))
      throw new Error(errorPayload?.error ?? `Run request failed (${response.status})`)
    }

    const payload = await response.json()
    return {
      status: 'completed',
      result: payload,
      metadata: payload?.metadata ?? null,
      usage: payload?.usage ?? null,
      artifactType
    }
  }

  const response = await fetch('/api/runs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      artifactType,
      messages: params.messages,
      settings: params.settings,
      contextPayload: params.contextPayload,
      targetSections: params.targetSections
    })
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}))
    throw new Error(errorPayload?.error ?? `Run request failed (${response.status})`)
  }

  const payload = await response.json()
  return {
    runId: payload.runId,
    status: payload.status,
    streamUrl: payload.streamUrl,
    artifactType: payload.artifactType ?? artifactType
  }
}

export const getRun = async (runId: string) => {
  const response = await fetch(`/api/runs/${runId}`)
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}))
    throw new Error(errorPayload?.error ?? `Run ${runId} not found`)
  }
  return response.json()
}

export const streamRun = async (
  runId: string,
  options?: {
    signal?: AbortSignal
  }
) => {
  const response = await fetch(`/api/runs/${runId}/stream`, {
    method: 'GET',
    signal: options?.signal
  })

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}))
    throw new Error(errorPayload?.error ?? `Unable to stream run ${runId}`)
  }

  if (!response.body) {
    throw new Error('Stream response missing body')
  }

  return response
}
