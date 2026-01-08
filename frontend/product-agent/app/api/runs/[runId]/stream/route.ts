import { NextRequest } from 'next/server'

import { getRunRecord, updateRunRecord } from '../../run-store'

interface RouteParams {
  params: {
    runId: string
  }
}

const PRD_AGENT_URL = process.env.PRD_AGENT_URL
const STREAM_TIMEOUT_MS = 5 * 60 * 1000

const createSseHeaders = () =>
  new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })

const handleEventForStore = (runId: string, eventType: string, data: any) => {
  switch (eventType) {
    case 'progress':
      updateRunRecord(runId, { progressAppend: data })
      if (data?.metadata?.usage) {
        updateRunRecord(runId, { usage: data.metadata.usage as any })
      }
      break
    case 'clarification':
      updateRunRecord(runId, {
        status: 'awaiting-input',
        clarification: data ?? null
      })
      break
    case 'complete': {
      const artifact = data?.artifact ?? null
      const metadata =
        (data?.metadata as Record<string, unknown> | undefined) ??
        (artifact?.metadata as Record<string, unknown> | undefined) ??
        null
      const usageCandidate =
        (metadata && (metadata as any).usage) ??
        (data?.metadata?.usage as any) ??
        (data?.usage as any) ??
        null
      updateRunRecord(runId, {
        status: 'completed',
        result: artifact ?? data ?? null,
        metadata,
        usage: usageCandidate
      })
      break
    }
    case 'pending-approval': {
      updateRunRecord(runId, {
        status: 'pending-approval',
        plan: data?.plan ?? null,
        approvalUrl: `/api/runs/${runId}/approve`
      })
      break
    }
    case 'error':
      updateRunRecord(runId, {
        status: 'failed',
        error: typeof data?.error === 'string' ? data.error : 'Unknown error'
      })
      break
    default:
      break
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  if (!PRD_AGENT_URL) {
    return new Response(JSON.stringify({ error: 'PRD_AGENT_URL is not configured' }), { status: 500 })
  }

  const record = getRunRecord(params.runId)
  if (!record) {
    return new Response(JSON.stringify({ error: 'Run not found' }), { status: 404 })
  }

  const upstreamController = new AbortController()

  const abortHandler = () => {
    upstreamController.abort()
    updateRunRecord(record.id, {
      status: 'failed',
      error: 'Run stream aborted by client'
    })
  }

  if (request.signal.aborted) {
    abortHandler()
    return new Response(JSON.stringify({ error: 'Request aborted' }), { status: 499 })
  }

  request.signal.addEventListener('abort', abortHandler)

  let backendResponse: Response
  try {
    backendResponse = await fetch(`${PRD_AGENT_URL}/runs/${record.id}/stream`, {
      method: 'GET',
      headers: { Accept: 'text/event-stream' },
      signal: upstreamController.signal,
      cache: 'no-store',
      next: { revalidate: 0 }
    })
  } catch (error) {
    request.signal.removeEventListener('abort', abortHandler)
    updateRunRecord(record.id, { status: 'failed', error: (error as Error)?.message ?? 'Failed to contact backend' })
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Failed to contact backend' }),
      { status: 502 }
    )
  }

  if (!backendResponse.ok) {
    request.signal.removeEventListener('abort', abortHandler)
    const errorText = await backendResponse.text()
    updateRunRecord(record.id, {
      status: 'failed',
      error: `Backend error: ${backendResponse.status} ${backendResponse.statusText}`
    })
    return new Response(
      JSON.stringify({
        error: 'Backend request failed',
        details: errorText
      }),
      { status: backendResponse.status }
    )
  }

  if (!backendResponse.body) {
    request.signal.removeEventListener('abort', abortHandler)
    updateRunRecord(record.id, {
      status: 'failed',
      error: 'Backend response missing body'
    })
    return new Response(JSON.stringify({ error: 'Backend response missing body' }), { status: 500 })
  }

  if (record.status !== 'pending-approval') {
    updateRunRecord(record.id, { status: 'running', error: null })
  }

  const reader = backendResponse.body.getReader()
  const decoder = new TextDecoder()

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = ''
      let timeout: NodeJS.Timeout | null = null

      const refreshTimeout = () => {
        if (timeout) {
          clearTimeout(timeout)
        }
        timeout = setTimeout(() => {
          reader.cancel('Stream timeout')
          updateRunRecord(record.id, {
            status: 'failed',
            error: `Stream timeout after ${STREAM_TIMEOUT_MS / 1000}s`
          })
        }, STREAM_TIMEOUT_MS)
      }

      refreshTimeout()

      try {
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            break
          }

          if (value) {
            refreshTimeout()
            controller.enqueue(value)
            buffer += decoder.decode(value, { stream: true })

            const events = buffer.split('\n\n')
            buffer = events.pop() ?? ''

            for (const rawEvent of events) {
              const lines = rawEvent.split('\n')
              let eventType = 'message'
              const dataLines: string[] = []

              for (const line of lines) {
                if (line.startsWith('event:')) {
                  eventType = line.slice(6).trim()
                } else if (line.startsWith('data:')) {
                  dataLines.push(line.slice(5).trim())
                }
              }

              if (dataLines.length === 0) {
                continue
              }

              const dataPayload = dataLines.join('\n')
              try {
                const parsed = JSON.parse(dataPayload)
                handleEventForStore(record.id, eventType, parsed)
              } catch (error) {
                console.warn('Failed to parse SSE payload', error)
              }
            }
          }
        }

        const current = getRunRecord(record.id)
        if (current && current.status === 'running') {
          updateRunRecord(record.id, { status: 'completed' })
        }
      } catch (error) {
        if ((error as Error)?.name !== 'AbortError') {
          updateRunRecord(record.id, {
            status: 'failed',
            error: error instanceof Error ? error.message : 'Streaming failed'
          })
        }
        controller.error(error)
      } finally {
        if (timeout) {
          clearTimeout(timeout)
        }
        request.signal.removeEventListener('abort', abortHandler)
        controller.close()
      }
    },
    cancel(reason) {
      reader.cancel(reason as string)
      const current = getRunRecord(record.id)
      if (current?.status === 'completed') {
        return
      }
      updateRunRecord(record.id, {
        status: 'failed',
        error: typeof reason === 'string' ? reason : 'Client cancelled stream'
      })
    }
  })

  return new Response(stream, {
    headers: createSseHeaders()
  })
}
