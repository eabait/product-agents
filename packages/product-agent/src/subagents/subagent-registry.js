const DEFAULT_EXPORT_CANDIDATES = ['createSubagent', 'default'];
const cloneManifest = (manifest) => ({
    ...manifest,
    consumes: [...manifest.consumes],
    capabilities: manifest.capabilities ? [...manifest.capabilities] : [],
    tags: manifest.tags ? [...manifest.tags] : []
});
const isSubagentLifecycle = (candidate) => {
    if (!candidate || typeof candidate !== 'object') {
        return false;
    }
    const maybeLifecycle = candidate;
    return (typeof maybeLifecycle.execute === 'function' &&
        !!maybeLifecycle.metadata &&
        typeof maybeLifecycle.metadata.id === 'string');
};
const normalizeFactory = (value) => {
    if (!value) {
        return undefined;
    }
    if (typeof value === 'function') {
        return value;
    }
    if (isSubagentLifecycle(value)) {
        return () => value;
    }
    return undefined;
};
export class SubagentRegistry {
    entries = new Map();
    lifecycleCache = new Map();
    constructor(entries) {
        entries?.forEach(entry => this.register(entry.manifest, entry.loader));
    }
    register(manifest, loader) {
        const manifestId = manifest.id.trim();
        if (!manifestId) {
            throw new Error('Subagent manifest requires a non-empty id');
        }
        const entry = {
            manifest: cloneManifest(manifest),
            loader: loader ?? (() => import(manifest.entry))
        };
        this.entries.set(manifestId, entry);
        this.lifecycleCache.delete(manifestId);
    }
    list() {
        return Array.from(this.entries.values()).map(entry => cloneManifest(entry.manifest));
    }
    get(id) {
        const entry = this.entries.get(id);
        return entry ? cloneManifest(entry.manifest) : undefined;
    }
    filterByArtifact(kind) {
        return this.list().filter(manifest => manifest.consumes.length === 0 || manifest.consumes.includes(kind));
    }
    async createLifecycle(id) {
        const resolved = await this.loadLifecycle(id);
        return resolved.lifecycle;
    }
    async loadLifecycle(id) {
        if (!this.entries.has(id)) {
            throw new Error(`Subagent with id "${id}" is not registered`);
        }
        let cached = this.lifecycleCache.get(id);
        if (!cached) {
            const entry = this.entries.get(id);
            cached = entry
                .loader()
                .then(module => this.instantiateLifecycle(entry.manifest, module))
                .then(lifecycle => ({
                manifest: cloneManifest(entry.manifest),
                lifecycle
            }));
            this.lifecycleCache.set(id, cached);
        }
        return cached;
    }
    async instantiateLifecycle(manifest, module) {
        const factory = this.resolveFactory(manifest, module);
        const lifecycle = await factory();
        if (!isSubagentLifecycle(lifecycle)) {
            throw new Error(`Factory for subagent "${manifest.id}" did not return a SubagentLifecycle`);
        }
        return lifecycle;
    }
    resolveFactory(manifest, module) {
        const exportCandidates = manifest.exportName
            ? [manifest.exportName]
            : [...DEFAULT_EXPORT_CANDIDATES];
        for (const candidate of exportCandidates) {
            const value = module[candidate];
            const factory = normalizeFactory(value);
            if (factory) {
                return factory;
            }
        }
        throw new Error(`Subagent module "${manifest.entry}" did not expose a factory via ${exportCandidates.join(', ')}`);
    }
}
