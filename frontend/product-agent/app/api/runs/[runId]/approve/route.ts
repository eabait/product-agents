import { NextRequest, NextResponse } from 'next/server'

import { updateRunRecord } from '../../run-store'

const PRD_AGENT_URL = process.env.PRD_AGENT_URL

interface RouteParams {
  params: {
    runId: string
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!PRD_AGENT_URL) {
    return NextResponse.json({ error: 'PRD_AGENT_URL is not configured' }, { status: 500 })
  }

  let payload: { approved?: boolean; feedback?: string } = {}
  try {
    payload = await request.json()
  } catch {
    payload = {}
  }

  const upstream = await fetch(`${PRD_AGENT_URL}/runs/${params.runId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  const responseBody = await upstream.json().catch(() => ({}))

  if (upstream.ok) {
    const status = typeof responseBody.status === 'string' ? responseBody.status : undefined
    const updates: Record<string, unknown> = {}

    if (status) {
      updates.status = status
    }
    if (status === 'running') {
      updates.error = null
    }
    if (responseBody.plan !== undefined) {
      updates.plan = responseBody.plan ?? null
    }
    if (status === 'pending-approval') {
      updates.approvalUrl = `/api/runs/${params.runId}/approve`
    }

    updateRunRecord(params.runId, updates)
  }

  return NextResponse.json(responseBody, { status: upstream.status })
}
