import { randomUUID } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import {
  createPersonaBuilderSubagent,
  loadProductAgentConfig,
  resolveRunSettings,
  type Artifact,
  type RunContext,
  type WorkspaceHandle
} from '@product-agents/product-agent'
import type { SectionRoutingResponse } from '@product-agents/prd-shared'
import { attachSubagentArtifact, getRunRecord } from '../../runs/run-store'

const PRD_AGENT_URL = process.env.PRD_AGENT_URL

const ArtifactSchema = z.object({
  id: z.string().min(1).optional(),
  kind: z.string().min(1).default('prd'),
  label: z.string().optional(),
  version: z.string().optional(),
  data: z.any(),
  metadata: z.record(z.any()).optional()
})

const PersonaRequestSchema = z
  .object({
    runId: z.string().optional(),
    artifact: ArtifactSchema.optional(),
    createdBy: z.string().optional(),
    overrides: z
      .object({
        model: z.string().min(1).optional(),
        temperature: z.number().min(0).max(2).optional(),
        maxOutputTokens: z.number().int().min(256).max(200000).optional()
      })
      .optional()
  })
  .refine(payload => Boolean(payload.artifact) || Boolean(payload.runId), {
    message: 'Provide either a completed PRD runId or an artifact payload.',
    path: ['artifact']
  })

const toWorkspaceHandle = (runId: string, artifactKind: string): WorkspaceHandle => ({
  descriptor: {
    runId,
    root: '',
    kind: artifactKind,
    createdAt: new Date(),
    metadata: {
      ephemeral: true
    }
  },
  resolve: (...segments: string[]) => segments.join('/')
})

const coerceArtifact = (
  input: z.infer<typeof ArtifactSchema>
): Artifact<SectionRoutingResponse> => ({
  id: input.id ?? `artifact-${randomUUID()}`,
  kind: input.kind ?? 'prd',
  version: input.version ?? '1.0.0',
  label: input.label ?? 'Product Requirements Document',
  data: input.data as SectionRoutingResponse,
  metadata: {
    ...(input.metadata ?? {}),
    createdAt: input.metadata?.createdAt ?? new Date().toISOString()
  }
})

const extractArtifactCandidate = (payload: Record<string, unknown>): Record<string, unknown> | null => {
  const directResult = payload.result
  if (directResult && typeof directResult === 'object') {
    return directResult as Record<string, unknown>
  }

  const summaryArtifact = payload.summary && typeof payload.summary === 'object' ? (payload.summary as Record<
    string,
    unknown
  >).artifact : null
  if (summaryArtifact && typeof summaryArtifact === 'object') {
    return summaryArtifact as Record<string, unknown>
  }

  const metadataArtifact = payload.metadata && typeof payload.metadata === 'object' ? (payload.metadata as Record<
    string,
    unknown
  >).artifact : null
  if (metadataArtifact && typeof metadataArtifact === 'object') {
    return metadataArtifact as Record<string, unknown>
  }

  return null
}

const findArtifactFromRun = async (runId: string): Promise<Artifact<SectionRoutingResponse> | null> => {
  const record = getRunRecord(runId)

  const attemptFromRecord = (): Artifact<SectionRoutingResponse> | null => {
    if (!record) {
      return null
    }

    const candidates: Array<Record<string, unknown> | undefined> = []

    if (record.result && typeof record.result === 'object') {
      const result = record.result as Record<string, unknown>
      if (result.artifact && typeof result.artifact === 'object') {
        candidates.push(result.artifact as Record<string, unknown>)
      } else {
        candidates.push(result)
      }
    }

    if (record.metadata && typeof record.metadata === 'object') {
      const metadata = record.metadata as Record<string, unknown>
      if (metadata.artifact && typeof metadata.artifact === 'object') {
        candidates.push(metadata.artifact as Record<string, unknown>)
      }
    }

    for (const candidate of candidates) {
      if (!candidate) continue
      try {
        return coerceArtifact(ArtifactSchema.parse(candidate))
      } catch {
        continue
      }
    }

    return null
  }

  const localArtifact = attemptFromRecord()
  if (localArtifact) {
    return localArtifact
  }

  if (!PRD_AGENT_URL) {
    return null
  }

  try {
    const response = await fetch(`${PRD_AGENT_URL}/runs/${runId}`)
    if (!response.ok) {
      return null
    }
    const payload = (await response.json()) as Record<string, unknown>
    const candidate = extractArtifactCandidate(payload)
    if (!candidate) {
      return null
    }
    return coerceArtifact(ArtifactSchema.parse(candidate))
  } catch (error) {
    console.warn('[persona-subagent] failed to fetch artifact from backend', error)
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json()
    const parsed = PersonaRequestSchema.safeParse(payload)

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'Invalid request payload',
          details: parsed.error.flatten()
        },
        { status: 400 }
      )
    }

    const { runId, artifact: artifactInput, overrides, createdBy } = parsed.data

    let sourceArtifact: Artifact<SectionRoutingResponse> | null = null
    if (artifactInput) {
      sourceArtifact = coerceArtifact(artifactInput)
    } else if (runId) {
      sourceArtifact = await findArtifactFromRun(runId)
    }

    if (!sourceArtifact) {
      return NextResponse.json(
        {
          error: 'Unable to locate PRD artifact for persona generation',
          details: runId
            ? { runId, hint: 'Provide artifact payload when run does not expose final artifact.' }
            : undefined
        },
        { status: 404 }
      )
    }

    const config = loadProductAgentConfig()
    const settings = resolveRunSettings(
      config,
      overrides
        ? {
            model: overrides.model,
            temperature: overrides.temperature,
            maxOutputTokens: overrides.maxOutputTokens
          }
        : undefined
    )

    const subagent = createPersonaBuilderSubagent()
    const personaRunId = runId ? `${runId}-persona` : `persona-${randomUUID()}`

    const runContext: RunContext = {
      runId: personaRunId,
      request: {
        artifactKind: sourceArtifact.kind,
        input: {
          sourceArtifactId: sourceArtifact.id,
          sourceRunId: runId
        },
        createdBy: createdBy ?? (sourceArtifact.metadata as any)?.createdBy ?? 'persona-subagent',
        attributes: {
          trigger: 'persona-builder'
        }
      },
      settings,
      workspace: toWorkspaceHandle(personaRunId, sourceArtifact.kind),
      startedAt: new Date(),
      metadata: {
        parentRunId: runId ?? null
      }
    }

    const result = await subagent.execute({
      params: {},
      run: runContext,
      sourceArtifact
    })

    if (runId) {
      attachSubagentArtifact(runId, subagent.metadata.id, result.artifact, result.metadata ?? null)
    }

    return NextResponse.json({
      subagentId: subagent.metadata.id,
      artifact: result.artifact,
      metadata: result.metadata ?? null
    })
  } catch (error) {
    console.error('[persona-subagent] failed to generate persona artifact', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Persona generation failed'
      },
      { status: 500 }
    )
  }
}
