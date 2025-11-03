import { randomUUID } from 'node:crypto'

import type { StartRunPayload } from './schemas'
import type { UsageSummary } from '@product-agents/agent-core'

export type RunStatus = 'pending' | 'running' | 'awaiting-input' | 'completed' | 'failed'

export interface RunRecord {
  id: string
  artifactType: string
  status: RunStatus
  request: StartRunPayload
  createdAt: string
  updatedAt: string
  progress: Array<Record<string, unknown>>
  metadata?: Record<string, unknown> | null
  usage?: UsageSummary | null
  result?: unknown
  error?: string | null
  clarification?: Record<string, unknown> | null
}

const MAX_RUN_RECORDS = 50

declare global {
  // eslint-disable-next-line no-var
  var __PRD_AGENT_RUN_STORE__: Map<string, RunRecord> | undefined
}

const runStore: Map<string, RunRecord> =
  globalThis.__PRD_AGENT_RUN_STORE__ ?? (globalThis.__PRD_AGENT_RUN_STORE__ = new Map())

const pruneStore = (): void => {
  if (runStore.size <= MAX_RUN_RECORDS) {
    return
  }

  const entries = Array.from(runStore.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const excess = entries.length - MAX_RUN_RECORDS
  for (let index = 0; index < excess; index += 1) {
    runStore.delete(entries[index].id)
  }
}

const touch = (record: RunRecord): void => {
  record.updatedAt = new Date().toISOString()
}

export const createRunRecord = (request: StartRunPayload, artifactType: string): RunRecord => {
  const id = randomUUID()
  const timestamp = new Date().toISOString()
  const record: RunRecord = {
    id,
    artifactType,
    status: 'pending',
    request,
    createdAt: timestamp,
    updatedAt: timestamp,
    progress: []
  }

  runStore.set(id, record)
  pruneStore()
  return record
}

export const getRunRecord = (runId: string): RunRecord | undefined => runStore.get(runId)

export const updateRunRecord = (
  runId: string,
  updates: Partial<Omit<RunRecord, 'id' | 'request' | 'createdAt' | 'progress'>> & {
    progressAppend?: Record<string, unknown>
  }
): RunRecord | undefined => {
  const record = runStore.get(runId)
  if (!record) {
    return undefined
  }

  if (typeof updates.status === 'string') {
    record.status = updates.status
  }
  if (updates.metadata !== undefined) {
    record.metadata = updates.metadata
  }
  if (updates.usage !== undefined) {
    record.usage = updates.usage
  }
  if (updates.result !== undefined) {
    record.result = updates.result
  }
  if (updates.error !== undefined) {
    record.error = updates.error
  }
  if (updates.clarification !== undefined) {
    record.clarification = updates.clarification
  }
  if (updates.progressAppend) {
    record.progress.push(updates.progressAppend)
  }

  touch(record)
  return record
}

export const serializeRunRecord = (record: RunRecord) => ({
  runId: record.id,
  artifactType: record.artifactType,
  status: record.status,
  createdAt: record.createdAt,
  updatedAt: record.updatedAt,
  metadata: record.metadata ?? null,
  usage: record.usage ?? null,
  result: record.result ?? null,
  error: record.error ?? null,
  clarification: record.clarification ?? null,
  progress: record.progress
})
