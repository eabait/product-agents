import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
const ARTIFACTS_DIR = 'artifacts';
const EVENTS_DIR = 'events';
const ARTIFACT_INDEX_FILE = 'index.json';
const EVENTS_FILE = 'events.jsonl';
const ensureTrailingSeparator = (input) => input.endsWith(path.sep) ? input : `${input}${path.sep}`;
const serializeArtifactSummary = (artifact, createdAt, updatedAt) => ({
    id: artifact.id,
    kind: artifact.kind,
    label: artifact.label,
    version: artifact.version,
    createdAt,
    updatedAt,
    metadata: artifact.metadata?.extras
});
const readJsonFile = async (filePath) => {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        return JSON.parse(content);
    }
    catch (error) {
        if (error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
};
const writeJsonFile = async (filePath, payload) => {
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
};
export class FilesystemWorkspaceDAO {
    root;
    persistArtifacts;
    defaultTempSubdir;
    clock;
    descriptorCache = new Map();
    constructor(options) {
        this.root = ensureTrailingSeparator(path.resolve(options.root));
        this.persistArtifacts = options.persistArtifacts ?? true;
        this.defaultTempSubdir = options.defaultTempSubdir ?? 'tmp';
        this.clock = options.clock ?? (() => new Date());
    }
    async ensureWorkspace(runId, artifactKind, options) {
        const runRoot = path.join(this.root, runId);
        await fs.mkdir(runRoot, { recursive: true });
        await fs.mkdir(path.join(runRoot, ARTIFACTS_DIR), { recursive: true });
        await fs.mkdir(path.join(runRoot, EVENTS_DIR), { recursive: true });
        const descriptor = this.descriptorCache.get(runId) ??
            (() => {
                const createdAt = this.clock();
                const descriptor = {
                    runId,
                    root: runRoot,
                    createdAt,
                    kind: artifactKind,
                    metadata: {
                        persistArtifacts: options?.persistArtifacts ?? this.persistArtifacts,
                        tempSubdir: options?.tempSubdir ?? this.defaultTempSubdir
                    }
                };
                this.descriptorCache.set(runId, descriptor);
                return descriptor;
            })();
        return {
            descriptor,
            resolve: (...segments) => path.join(runRoot, ...segments)
        };
    }
    async writeArtifact(runId, artifact) {
        const descriptor = this.getDescriptor(runId);
        const persist = descriptor.metadata?.persistArtifacts ?? this.persistArtifacts;
        if (!persist) {
            return;
        }
        const artifactsDir = path.join(descriptor.root, ARTIFACTS_DIR);
        await fs.mkdir(artifactsDir, { recursive: true });
        const artifactPath = path.join(artifactsDir, `${artifact.id}.json`);
        const timestamp = this.clock().toISOString();
        const payload = {
            ...artifact,
            metadata: {
                ...(artifact.metadata ?? {}),
                updatedAt: timestamp,
                createdAt: artifact.metadata?.createdAt ?? timestamp
            }
        };
        await writeJsonFile(artifactPath, payload);
        const indexPath = path.join(artifactsDir, ARTIFACT_INDEX_FILE);
        const index = (await readJsonFile(indexPath)) ?? [];
        const summary = serializeArtifactSummary(payload, payload.metadata.createdAt, payload.metadata.updatedAt);
        const existingIndex = index.findIndex(entry => entry.id === artifact.id);
        if (existingIndex >= 0) {
            index.splice(existingIndex, 1, summary);
        }
        else {
            index.push(summary);
        }
        await writeJsonFile(indexPath, index);
    }
    async readArtifact(runId, artifactId) {
        const descriptor = this.getDescriptor(runId);
        const artifactPath = path.join(descriptor.root, ARTIFACTS_DIR, `${artifactId}.json`);
        const artifact = await readJsonFile(artifactPath);
        return artifact;
    }
    async listArtifacts(runId) {
        const descriptor = this.getDescriptor(runId);
        const indexPath = path.join(descriptor.root, ARTIFACTS_DIR, ARTIFACT_INDEX_FILE);
        return (await readJsonFile(indexPath)) ?? [];
    }
    async appendEvent(runId, event) {
        const descriptor = this.getDescriptor(runId);
        const eventsDir = path.join(descriptor.root, EVENTS_DIR);
        await fs.mkdir(eventsDir, { recursive: true });
        const eventRecord = {
            ...event,
            id: event.id ?? randomUUID(),
            createdAt: event.createdAt ?? this.clock().toISOString()
        };
        const eventLine = `${JSON.stringify(eventRecord)}\n`;
        await fs.appendFile(path.join(eventsDir, EVENTS_FILE), eventLine, 'utf8');
    }
    async getEvents(runId) {
        const descriptor = this.getDescriptor(runId);
        const eventsPath = path.join(descriptor.root, EVENTS_DIR, EVENTS_FILE);
        let content;
        try {
            content = await fs.readFile(eventsPath, 'utf8');
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                return [];
            }
            throw error;
        }
        if (!content) {
            return [];
        }
        const lines = content.split('\n').filter(Boolean);
        return lines.map(line => JSON.parse(line));
    }
    async teardown(runId) {
        const descriptor = this.descriptorCache.get(runId);
        this.descriptorCache.delete(runId);
        const runRoot = descriptor?.root ?? path.join(this.root, runId);
        await fs.rm(runRoot, { recursive: true, force: true });
    }
    getDescriptor(runId) {
        const descriptor = this.descriptorCache.get(runId);
        if (!descriptor) {
            throw new Error(`Workspace for run ${runId} has not been initialized`);
        }
        return descriptor;
    }
}
