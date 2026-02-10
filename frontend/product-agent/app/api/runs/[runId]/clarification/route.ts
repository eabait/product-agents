import { NextRequest, NextResponse } from 'next/server'

const PRD_AGENT_URL = process.env.PRD_AGENT_URL

interface RouteParams {
  params: {
    runId: string
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  if (!PRD_AGENT_URL) {
    return NextResponse.json(
      { error: 'PRD_AGENT_URL is not configured' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()

    const response = await fetch(`${PRD_AGENT_URL}/runs/${params.runId}/clarification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status })
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to submit clarification' },
      { status: 500 }
    )
  }
}
