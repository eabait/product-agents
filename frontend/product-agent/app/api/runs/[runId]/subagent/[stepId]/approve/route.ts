import { NextRequest, NextResponse } from 'next/server'

const PRD_AGENT_URL = process.env.PRD_AGENT_URL

interface RouteParams {
  params: {
    runId: string
    stepId: string
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

  const upstream = await fetch(
    `${PRD_AGENT_URL}/runs/${params.runId}/subagent/${params.stepId}/approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  )

  const responseBody = await upstream.json().catch(() => ({}))

  return NextResponse.json(responseBody, { status: upstream.status })
}
