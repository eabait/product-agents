import { NextRequest, NextResponse } from 'next/server'

import { getRunRecord, serializeRunRecord, updateRunRecord } from '../run-store'
import type { RunStatus } from '../run-store'

const PRD_AGENT_URL = process.env.PRD_AGENT_URL

interface RouteParams {
  params: {
    runId: string
  }
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const record = getRunRecord(params.runId)
  if (!record) {
    if (!PRD_AGENT_URL) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 })
    }

    try {
      const upstream = await fetch(`${PRD_AGENT_URL}/runs/${params.runId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      if (!upstream.ok) {
        return NextResponse.json({ error: 'Run not found' }, { status: upstream.status })
      }

      const payload = await upstream.json()
      return NextResponse.json(payload)
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to fetch run from backend' },
        { status: 502 }
      )
    }
  }

  const needsArtifactRefresh =
    Boolean(PRD_AGENT_URL) &&
    (((record.result === null || typeof record.result === 'undefined') &&
      (record.status === 'awaiting-input' || record.status === 'completed')) ||
      (record.status === 'pending-approval' && !record.plan))

  if (needsArtifactRefresh && PRD_AGENT_URL) {
    try {
      const upstream = await fetch(`${PRD_AGENT_URL}/runs/${params.runId}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      })

      if (upstream.ok) {
        const payload = (await upstream.json()) as {
          status?: string
          metadata?: Record<string, unknown> | null
          usage?: Record<string, unknown> | null
          result?: unknown
          clarification?: Record<string, unknown> | null
          plan?: unknown
          approvalUrl?: string
          approvalMode?: 'auto' | 'manual'
          summary?: {
            status?: string
            metadata?: Record<string, unknown> | null
            artifact?: unknown
          } | null
        }

        const metadataFromPayload = payload.metadata ?? payload.summary?.metadata ?? null
        let usageFromPayload: Record<string, unknown> | null = payload.usage ?? null
        if (!usageFromPayload && metadataFromPayload && typeof metadataFromPayload === 'object') {
          const candidate = (metadataFromPayload as Record<string, unknown>).usage
          if (candidate && typeof candidate === 'object') {
            usageFromPayload = candidate as Record<string, unknown>
          }
        }

        let artifactFromPayload: unknown =
          payload.result ?? payload.summary?.artifact ?? null
        if (
          !artifactFromPayload &&
          metadataFromPayload &&
          typeof metadataFromPayload === 'object' &&
          'artifact' in metadataFromPayload
        ) {
          artifactFromPayload = (metadataFromPayload as Record<string, unknown>).artifact
        }

        updateRunRecord(record.id, {
          status: (payload.status as RunStatus | undefined) ?? record.status,
          metadata: metadataFromPayload ?? record.metadata ?? null,
          usage: usageFromPayload ?? record.usage ?? null,
          result: artifactFromPayload ?? record.result ?? null,
          clarification: payload.clarification ?? record.clarification ?? null,
          plan: payload.plan ?? record.plan ?? null,
          approvalUrl:
            payload.status === 'pending-approval' || payload.approvalUrl
              ? `/api/runs/${record.id}/approve`
              : record.approvalUrl ?? null,
          approvalMode: payload.approvalMode ?? record.approvalMode
        })

        const updatedRecord = getRunRecord(record.id)
        if (updatedRecord) {
          return NextResponse.json({
            ...serializeRunRecord(updatedRecord),
            summary: payload.summary ?? null
          })
        }

        return NextResponse.json(payload)
      }
    } catch (error) {
      console.warn(`[runs:get] failed to refresh artifact for run ${params.runId}`, error)
    }
  }

  return NextResponse.json({
    ...serializeRunRecord(record),
    summary: null
  })
}
