import { NextRequest, NextResponse } from 'next/server'

import { getRunRecord, serializeRunRecord } from '../run-store'

interface RouteParams {
  params: {
    runId: string
  }
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const record = getRunRecord(params.runId)
  if (!record) {
    return NextResponse.json({ error: 'Run not found' }, { status: 404 })
  }

  return NextResponse.json(serializeRunRecord(record))
}
