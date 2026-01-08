import { NextRequest, NextResponse } from 'next/server'

import { StartRunSchema } from './schemas'
import { createRunRecord, serializeRunRecord, updateRunRecord } from './run-store'

const PRD_AGENT_URL = process.env.PRD_AGENT_URL

const createRequestId = (): string => Math.random().toString(36).substring(2, 10)

export async function POST(request: NextRequest) {
  const requestId = createRequestId()
  console.log(`[runs:${requestId}] start run request received`)

  try {
    const payload = await request.json()
    const parsed = StartRunSchema.safeParse(payload)

    if (!parsed.success) {
      console.warn(`[runs:${requestId}] validation failed`, parsed.error.flatten())
      return NextResponse.json(
        {
          error: 'Invalid request payload',
          details: parsed.error.issues
        },
        { status: 400 }
      )
    }

    if (!PRD_AGENT_URL) {
      console.error(`[runs:${requestId}] PRD_AGENT_URL is not configured`)
      return NextResponse.json(
        {
          error: 'Backend agent URL is missing. Set PRD_AGENT_URL in your environment.'
        },
        { status: 500 }
      )
    }

    const streamingEnabled = parsed.data.settings?.streaming !== false

    if (!streamingEnabled) {
      console.warn(
        `[runs:${requestId}] received non-streaming run request; please use /api/chat until thin API batch mode is implemented`
      )
      return NextResponse.json(
        {
          error: 'Non-streaming runs are not yet supported via /api/runs. Use /api/chat for batch responses.'
        },
        { status: 400 }
      )
    }

    const backendResponse = await fetch(`${PRD_AGENT_URL}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed.data)
    })

    if (!backendResponse.ok) {
      const errorBody = await backendResponse.json().catch(() => ({}))
      console.error(`[runs:${requestId}] backend /runs request failed`, backendResponse.status, errorBody)
      return NextResponse.json(
        {
          error: errorBody?.error ?? 'Failed to start run',
          details: errorBody?.details ?? null
        },
        { status: backendResponse.status }
      )
    }

    const backendPayload = (await backendResponse.json().catch(() => ({}))) as {
      runId?: string
      status?: string
      artifactType?: string
      streamUrl?: string
      plan?: unknown
      approvalUrl?: string
      approvalMode?: 'auto' | 'manual'
    }

    if (!backendPayload?.runId) {
      console.error(`[runs:${requestId}] backend response missing runId`, backendPayload)
      return NextResponse.json(
        {
          error: 'Backend did not return a run identifier'
        },
        { status: 502 }
      )
    }

    const artifactType = backendPayload.artifactType ?? parsed.data.artifactType ?? 'prd'
    const runStatus =
      (backendPayload.status as
        | 'pending'
        | 'running'
        | 'awaiting-input'
        | 'completed'
        | 'failed'
        | 'pending-approval'
        | undefined) ?? 'pending'

    const record = createRunRecord(backendPayload.runId, parsed.data, artifactType, runStatus)
    const plan = backendPayload.plan ?? null
    const approvalUrl =
      runStatus === 'pending-approval'
        ? `/api/runs/${record.id}/approve`
        : null

    if (plan || approvalUrl) {
      updateRunRecord(record.id, {
        plan,
        approvalUrl,
        approvalMode: parsed.data.approvalMode ?? 'manual'
      })
    }

    console.log(`[runs:${requestId}] run ${record.id} created (backend status: ${runStatus})`)

    const responsePayload: Record<string, unknown> = {
      runId: record.id,
      status: runStatus,
      createdAt: record.createdAt,
      artifactType: record.artifactType,
      streamUrl: `/api/runs/${record.id}/stream`,
      summary: serializeRunRecord(record)
    }

    if (plan) {
      responsePayload.plan = plan
    }
    if (approvalUrl) {
      responsePayload.approvalUrl = approvalUrl
    }

    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error(`[runs:${requestId}] failed to create run`, error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create run'
      },
      { status: 500 }
    )
  }
}
