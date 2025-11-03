import { NextRequest, NextResponse } from 'next/server'

import { StartRunSchema } from './schemas'
import { createRunRecord, serializeRunRecord } from './run-store'

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

    const { artifactType, ...rest } = parsed.data
    const streamingEnabled = rest.settings?.streaming !== false

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

    const record = createRunRecord({ ...rest, artifactType }, artifactType)

    console.log(`[runs:${requestId}] run ${record.id} created`)

    return NextResponse.json({
      runId: record.id,
      status: record.status,
      createdAt: record.createdAt,
      artifactType: record.artifactType,
      streamUrl: `/api/runs/${record.id}/stream`,
      summary: serializeRunRecord(record)
    })
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
