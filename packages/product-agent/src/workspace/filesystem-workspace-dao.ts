import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

import type {
  WorkspaceDAO,
  WorkspaceDAOOptions,
  WorkspaceDescriptor,
  WorkspaceHandle,
  WorkspaceArtifactSummary,
  WorkspaceEvent
} from '../contracts/workspace'
import type { Artifact } from '../contracts/core'

const ARTIFACTS_DIR = 'artifacts'
const EVENTS_DIR = 'events'
const ARTIFACT_INDEX_FILE = 'index.json'
const EVENTS_FILE = 'events.jsonl'

interface FilesystemWorkspaceDAOOptions {
  root: string
  persistArtifacts?: boolean
  defaultTempSubdir?: string
  clock?: () => Date
}

const ensureTrailingSeparator = (input: string): string =>
  input.endsWith(path.sep) ? input : `${input}${path.sep}`

const serializeArtifactSummary = (
  artifact: Artifact,
  createdAt: string,
  updatedAt?: string
): WorkspaceArtifactSummary => ({
  id: artifact.id,
  kind: artifact.kind,
  label: artifact.label,
  version: artifact.version,
  createdAt,
  updatedAt,
  metadata: artifact.metadata?.extras
})

const readJsonFile = async <T>(filePath: string): Promise<T | null> => {
  try {
    const content = await fs.readFile(filePath, 'utf8')
    return JSON.parse(content) as T
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

const writeJsonFile = async (filePath: string, payload: unknown): Promise<void> => {
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
}

export class FilesystemWorkspaceDAO implements WorkspaceDAO {
  private readonly root: string
  private readonly persistArtifacts: boolean
  private readonly defaultTempSubdir: string
  private readonly clock: () => Date
  private readonly descriptorCache = new Map<string, WorkspaceDescriptor>()

  constructor(options: FilesystemWorkspaceDAOOptions) {
    this.root = ensureTrailingSeparator(path.resolve(options.root))
    this.persistArtifacts = options.persistArtifacts ?? true
    this.defaultTempSubdir = options.defaultTempSubdir ?? 'tmp'
    this.clock = options.clock ?? (() => new Date())
  }

  async ensureWorkspace(
    runId: string,
    artifactKind: string,
    options?: WorkspaceDAOOptions
  ): Promise<WorkspaceHandle> {
    const runRoot = path.join(this.root, runId)
    await fs.mkdir(runRoot, { recursive: true })
    await fs.mkdir(path.join(runRoot, ARTIFACTS_DIR), { recursive: true })
    await fs.mkdir(path.join(runRoot, EVENTS_DIR), { recursive: true })

    const descriptor =
      this.descriptorCache.get(runId) ??
      (() => {
        const createdAt = this.clock()
        const descriptor: WorkspaceDescriptor = {
          runId,
          root: runRoot,
          createdAt,
          kind: artifactKind,
          metadata: {
            persistArtifacts: options?.persistArtifacts ?? this.persistArtifacts,
            tempSubdir: options?.tempSubdir ?? this.defaultTempSubdir
          }
        }
        this.descriptorCache.set(runId, descriptor)
        return descriptor
      })()

    return {
      descriptor,
      resolve: (...segments: string[]) => path.join(runRoot, ...segments)
    }
  }

  async writeArtifact<TData>(
    runId: string,
    artifact: Artifact<TData>
  ): Promise<void> {
    const descriptor = this.getDescriptor(runId)
    const persist = descriptor.metadata?.persistArtifacts ?? this.persistArtifacts
    if (!persist) {
      return
    }

    const artifactsDir = path.join(descriptor.root, ARTIFACTS_DIR)
    await fs.mkdir(artifactsDir, { recursive: true })

    const artifactPath = path.join(artifactsDir, `${artifact.id}.json`)
    const timestamp = this.clock().toISOString()

    const payload = {
      ...artifact,
      metadata: {
        ...(artifact.metadata ?? {}),
        updatedAt: timestamp,
        createdAt: artifact.metadata?.createdAt ?? timestamp
      }
    }

    await writeJsonFile(artifactPath, payload)

    const indexPath = path.join(artifactsDir, ARTIFACT_INDEX_FILE)
    const index = (await readJsonFile<WorkspaceArtifactSummary[]>(indexPath)) ?? []
    const summary = serializeArtifactSummary(payload, payload.metadata.createdAt!, payload.metadata.updatedAt)
    const existingIndex = index.findIndex(entry => entry.id === artifact.id)
    if (existingIndex >= 0) {
      index.splice(existingIndex, 1, summary)
    } else {
      index.push(summary)
    }
    await writeJsonFile(indexPath, index)
  }

  async readArtifact<TData>(
    runId: string,
    artifactId: string
  ): Promise<Artifact<TData> | null> {
    const descriptor = this.getDescriptor(runId)
    const artifactPath = path.join(descriptor.root, ARTIFACTS_DIR, `${artifactId}.json`)
    const artifact = await readJsonFile<Artifact<TData>>(artifactPath)
    return artifact
  }

  async listArtifacts(runId: string): Promise<WorkspaceArtifactSummary[]> {
    const descriptor = this.getDescriptor(runId)
    const indexPath = path.join(descriptor.root, ARTIFACTS_DIR, ARTIFACT_INDEX_FILE)
    return (await readJsonFile<WorkspaceArtifactSummary[]>(indexPath)) ?? []
  }

  async appendEvent(runId: string, event: WorkspaceEvent): Promise<void> {
    const descriptor = this.getDescriptor(runId)
    const eventsDir = path.join(descriptor.root, EVENTS_DIR)
    await fs.mkdir(eventsDir, { recursive: true })

    const eventRecord: WorkspaceEvent = {
      ...event,
      id: event.id ?? randomUUID(),
      createdAt: event.createdAt ?? this.clock().toISOString()
    }

    const eventLine = `${JSON.stringify(eventRecord)}\n`
    await fs.appendFile(path.join(eventsDir, EVENTS_FILE), eventLine, 'utf8')
  }

  async getEvents(runId: string): Promise<WorkspaceEvent[]> {
    const descriptor = this.getDescriptor(runId)
    const eventsPath = path.join(descriptor.root, EVENTS_DIR, EVENTS_FILE)
    let content: string
    try {
      content = await fs.readFile(eventsPath, 'utf8')
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return []
      }
      throw error
    }
    if (!content) {
      return []
    }

    const lines = content.split('\n').filter(Boolean)
    return lines.map(line => JSON.parse(line) as WorkspaceEvent)
  }

  async teardown(runId: string): Promise<void> {
    const descriptor = this.descriptorCache.get(runId)
    this.descriptorCache.delete(runId)
    const runRoot = descriptor?.root ?? path.join(this.root, runId)
    await fs.rm(runRoot, { recursive: true, force: true })
  }

  private getDescriptor(runId: string): WorkspaceDescriptor {
    const descriptor = this.descriptorCache.get(runId)
    if (!descriptor) {
      throw new Error(`Workspace for run ${runId} has not been initialized`)
    }
    return descriptor
  }
}
