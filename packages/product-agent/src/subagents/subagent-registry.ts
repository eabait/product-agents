import type { ArtifactKind } from '../contracts/core'
import type {
  SubagentLifecycle,
  SubagentManifest,
  SubagentRegistryEntry
} from '../contracts/subagent'

type SubagentFactory = () => SubagentLifecycle | Promise<SubagentLifecycle>
type ModuleExport = unknown

const DEFAULT_EXPORT_CANDIDATES = ['createSubagent', 'default'] as const

const cloneManifest = (manifest: SubagentManifest): SubagentManifest => ({
  ...manifest,
  consumes: [...manifest.consumes],
  capabilities: manifest.capabilities ? [...manifest.capabilities] : [],
  tags: manifest.tags ? [...manifest.tags] : []
})

const isSubagentLifecycle = (candidate: unknown): candidate is SubagentLifecycle => {
  if (!candidate || typeof candidate !== 'object') {
    return false
  }
  const maybeLifecycle = candidate as SubagentLifecycle
  return (
    typeof maybeLifecycle.execute === 'function' &&
    !!maybeLifecycle.metadata &&
    typeof maybeLifecycle.metadata.id === 'string'
  )
}

const normalizeFactory = (value: ModuleExport): SubagentFactory | undefined => {
  if (!value) {
    return undefined
  }

  if (typeof value === 'function') {
    return value as SubagentFactory
  }

  if (isSubagentLifecycle(value)) {
    return () => value
  }

  return undefined
}

export interface ResolvedSubagent {
  manifest: SubagentManifest
  lifecycle: SubagentLifecycle
}

export class SubagentRegistry {
  private readonly entries = new Map<string, SubagentRegistryEntry>()
  private readonly lifecycleCache = new Map<string, Promise<ResolvedSubagent>>()

  constructor(entries?: Array<{ manifest: SubagentManifest; loader?: SubagentRegistryEntry['loader'] }>) {
    entries?.forEach(entry => this.register(entry.manifest, entry.loader))
  }

  register(manifest: SubagentManifest, loader?: SubagentRegistryEntry['loader']): void {
    const manifestId = manifest.id.trim()
    if (!manifestId) {
      throw new Error('Subagent manifest requires a non-empty id')
    }

    const entry: SubagentRegistryEntry = {
      manifest: cloneManifest(manifest),
      loader: loader ?? (() => import(manifest.entry))
    }

    this.entries.set(manifestId, entry)
    this.lifecycleCache.delete(manifestId)
  }

  list(): SubagentManifest[] {
    return Array.from(this.entries.values()).map(entry => cloneManifest(entry.manifest))
  }

  get(id: string): SubagentManifest | undefined {
    const entry = this.entries.get(id)
    return entry ? cloneManifest(entry.manifest) : undefined
  }

  filterByArtifact(kind: ArtifactKind): SubagentManifest[] {
    return this.list().filter(
      manifest => manifest.consumes.length === 0 || manifest.consumes.includes(kind)
    )
  }

  async createLifecycle(id: string): Promise<SubagentLifecycle> {
    const resolved = await this.loadLifecycle(id)
    return resolved.lifecycle
  }

  private async loadLifecycle(id: string): Promise<ResolvedSubagent> {
    if (!this.entries.has(id)) {
      throw new Error(`Subagent with id "${id}" is not registered`)
    }

    let cached = this.lifecycleCache.get(id)
    if (!cached) {
      const entry = this.entries.get(id)!
      cached = entry
        .loader()
        .then(module => this.instantiateLifecycle(entry.manifest, module))
        .then(lifecycle => ({
          manifest: cloneManifest(entry.manifest),
          lifecycle
        }))
      this.lifecycleCache.set(id, cached)
    }

    return cached
  }

  private async instantiateLifecycle(
    manifest: SubagentManifest,
    module: Record<string, ModuleExport>
  ): Promise<SubagentLifecycle> {
    const factory = this.resolveFactory(manifest, module)
    const lifecycle = await factory()
    if (!isSubagentLifecycle(lifecycle)) {
      throw new Error(`Factory for subagent "${manifest.id}" did not return a SubagentLifecycle`)
    }
    return lifecycle
  }

  private resolveFactory(
    manifest: SubagentManifest,
    module: Record<string, ModuleExport>
  ): SubagentFactory {
    const exportCandidates = manifest.exportName
      ? [manifest.exportName]
      : [...DEFAULT_EXPORT_CANDIDATES]
    for (const candidate of exportCandidates) {
      const value = module[candidate]
      const factory = normalizeFactory(value)
      if (factory) {
        return factory
      }
    }

    throw new Error(
      `Subagent module "${manifest.entry}" did not expose a factory via ${exportCandidates.join(', ')}`
    )
  }
}
