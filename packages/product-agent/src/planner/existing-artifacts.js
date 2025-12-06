const asArray = (value) => {
    if (!value)
        return [];
    return Array.isArray(value) ? value : [value];
};
const coerceArtifact = (candidate, kind, index = 0) => {
    const id = (typeof candidate.id === 'string' && candidate.id.trim().length > 0
        ? candidate.id
        : `existing-${kind}-${index}`) ?? `existing-${kind}-${index}`;
    const version = (typeof candidate.version === 'string' && candidate.version.trim().length > 0
        ? candidate.version
        : '1.0.0') ?? '1.0.0';
    const label = typeof candidate.label === 'string' && candidate.label.trim().length > 0
        ? candidate.label
        : undefined;
    return {
        id,
        kind: candidate.kind ?? kind,
        version,
        label,
        data: candidate.data ?? candidate,
        metadata: candidate.metadata
    };
};
const addArtifacts = (map, kind, candidates) => {
    candidates.forEach((candidate, index) => {
        try {
            const artifact = coerceArtifact(candidate, kind, index);
            const existing = map.get(kind) ?? [];
            existing.push(artifact);
            map.set(kind, existing);
        }
        catch {
            // ignore malformed candidates
        }
    });
};
/**
 * Extracts any pre-existing artifacts supplied on the request/context so
 * planners and intent resolvers can skip regenerating them.
 */
export const extractExistingArtifactsFromContext = (context) => {
    const artifactsByKind = new Map();
    const input = context.request.input;
    const sectionContext = input?.context;
    if (sectionContext?.existingPRD) {
        addArtifacts(artifactsByKind, 'prd', asArray(sectionContext.existingPRD));
    }
    if (sectionContext?.existingPersonas) {
        addArtifacts(artifactsByKind, 'persona', asArray(sectionContext.existingPersonas));
    }
    if (sectionContext?.existingStoryMap) {
        addArtifacts(artifactsByKind, 'story-map', asArray(sectionContext.existingStoryMap));
    }
    if (sectionContext?.existingResearch) {
        addArtifacts(artifactsByKind, 'research', asArray(sectionContext.existingResearch));
    }
    // If callers pass already-normalized artifacts in attributes.intentPlan or metadata, pick them up.
    const metadataArtifacts = context.metadata?.artifacts;
    if (Array.isArray(metadataArtifacts)) {
        metadataArtifacts.forEach(entry => {
            if (entry && typeof entry === 'object' && typeof entry.kind === 'string') {
                addArtifacts(artifactsByKind, entry.kind, [entry]);
            }
        });
    }
    return {
        artifactsByKind,
        kinds: Array.from(artifactsByKind.keys())
    };
};
