import path from 'node:path';
import { z } from 'zod';
const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const PLANNER_STRATEGIES = ['intelligent', 'legacy-prd'];
const SkillPackReferenceSchema = z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    label: z.string().optional()
});
const RetryPolicySchema = z.object({
    attempts: z.number().int().min(1),
    backoffMs: z.number().int().min(0)
});
const SubagentManifestConfigSchema = z.object({
    id: z.string().min(1),
    package: z.string().min(1),
    version: z.string().min(1),
    label: z.string().min(1),
    creates: z.string().min(1),
    consumes: z.array(z.string().min(1)).default([]),
    capabilities: z.array(z.string().min(1)).default([]),
    description: z.string().optional(),
    entry: z.string().min(1),
    exportName: z.string().min(1).default('createSubagent'),
    tags: z.array(z.string().min(1)).default([])
});
const PlannerConfigSchema = z.object({
    strategy: z.enum(PLANNER_STRATEGIES)
});
export const ProductAgentConfigSchema = z.object({
    runtime: z.object({
        defaultModel: z.string().min(1),
        defaultTemperature: z.number().min(0).max(2),
        maxOutputTokens: z.number().int().min(128),
        allowStreaming: z.boolean(),
        fallbackModel: z.string().min(1).nullable().default(null),
        retry: RetryPolicySchema
    }),
    workspace: z.object({
        storageRoot: z.string().min(1),
        persistArtifacts: z.boolean(),
        retentionDays: z.number().int().min(0).nullable(),
        tempSubdir: z.string().min(1)
    }),
    skills: z.object({
        enabledPacks: z.array(SkillPackReferenceSchema).min(1),
        allowDynamicOverrides: z.boolean()
    }),
    telemetry: z.object({
        enableProgressStream: z.boolean(),
        enableMetrics: z.boolean(),
        logLevel: z.enum(LOG_LEVELS),
        eventThrottleMs: z.number().int().min(0)
    }),
    subagents: z
        .object({
        manifests: z.array(SubagentManifestConfigSchema)
    })
        .default({ manifests: [] }),
    planner: PlannerConfigSchema
});
const SkillPackInputSchema = z.object({
    id: z.string().min(1),
    version: z.string().min(1).optional(),
    label: z.string().optional()
});
export const ProductAgentApiOverrideSchema = z.object({
    model: z.string().min(1).optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(128).max(200000).optional(),
    skillPackId: z.string().min(1).optional(),
    additionalSkillPacks: z.array(SkillPackInputSchema).optional(),
    workspaceRoot: z.string().min(1).optional(),
    logLevel: z.enum(LOG_LEVELS).optional()
});
const DEFAULT_STORAGE_ROOT = path.resolve(process.cwd(), 'data', 'runs');
const DEFAULT_PERSONA_SUBAGENT_MANIFEST = {
    id: 'persona.builder',
    package: '@product-agents/persona-agent',
    version: '0.2.0',
    label: 'Persona Agent',
    creates: 'persona',
    consumes: ['prd', 'prompt'],
    capabilities: ['analyze', 'synthesize'],
    description: 'LLM-backed persona analyst that can start from PRD sections or raw prompts.',
    entry: '@product-agents/persona-agent',
    exportName: 'createPersonaAgentSubagent',
    tags: ['persona', 'agent']
};
const DEFAULT_CONFIG = {
    runtime: {
        defaultModel: 'qwen/qwen3-235b-a22b-2507', //'anthropic/claude-3.5-haiku',
        defaultTemperature: 0.2,
        maxOutputTokens: 8000,
        allowStreaming: true,
        fallbackModel: null,
        retry: {
            attempts: 3,
            backoffMs: 500
        }
    },
    workspace: {
        storageRoot: DEFAULT_STORAGE_ROOT,
        persistArtifacts: true,
        retentionDays: 30,
        tempSubdir: 'tmp'
    },
    skills: {
        enabledPacks: [
            {
                id: 'prd-skill-pack',
                version: 'latest',
                label: 'PRD Skill Pack'
            }
        ],
        allowDynamicOverrides: true
    },
    telemetry: {
        enableProgressStream: true,
        enableMetrics: true,
        logLevel: 'info',
        eventThrottleMs: 250
    },
    subagents: {
        manifests: [DEFAULT_PERSONA_SUBAGENT_MANIFEST]
    },
    planner: {
        strategy: 'intelligent'
    }
};
const cloneConfig = (config) => ({
    runtime: {
        ...config.runtime,
        retry: { ...config.runtime.retry }
    },
    workspace: { ...config.workspace },
    skills: {
        ...config.skills,
        enabledPacks: config.skills.enabledPacks.map(pack => ({ ...pack }))
    },
    telemetry: { ...config.telemetry },
    subagents: {
        manifests: config.subagents.manifests.map(manifest => ({
            ...manifest,
            consumes: [...manifest.consumes],
            capabilities: [...manifest.capabilities],
            tags: [...manifest.tags]
        }))
    },
    planner: { ...config.planner }
});
const mergeConfig = (base, ...overrides) => {
    return overrides.reduce((acc, override) => {
        if (!override) {
            return acc;
        }
        const next = {
            runtime: {
                ...acc.runtime,
                ...override.runtime,
                retry: {
                    ...acc.runtime.retry,
                    ...(override.runtime?.retry ?? {})
                }
            },
            workspace: {
                ...acc.workspace,
                ...override.workspace
            },
            skills: {
                ...acc.skills,
                ...override.skills,
                enabledPacks: override.skills?.enabledPacks ?? acc.skills.enabledPacks
            },
            telemetry: {
                ...acc.telemetry,
                ...override.telemetry
            },
            subagents: {
                manifests: override.subagents?.manifests ?? acc.subagents.manifests
            },
            planner: {
                ...acc.planner,
                ...override.planner
            }
        };
        return next;
    }, cloneConfig(base));
};
const toNumber = (value) => {
    if (value === undefined)
        return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const toBoolean = (value) => {
    if (value === undefined)
        return undefined;
    if (value === 'true')
        return true;
    if (value === 'false')
        return false;
    return undefined;
};
const parseSkillPackList = (value) => {
    if (!value)
        return undefined;
    const packs = value
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean)
        .map(token => {
        const [idPart, versionPart] = token.split('@');
        const id = idPart.trim();
        const version = versionPart?.trim() || 'latest';
        return { id, version };
    });
    return packs.length > 0 ? packs : undefined;
};
const parseSubagentManifestList = (value) => {
    if (!value)
        return undefined;
    try {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) {
            return undefined;
        }
        const manifests = [];
        parsed.forEach(entry => {
            const result = SubagentManifestConfigSchema.safeParse(entry);
            if (result.success) {
                manifests.push(result.data);
            }
        });
        return manifests.length > 0 ? manifests : undefined;
    }
    catch {
        return undefined;
    }
};
const parseEnvOverrides = (env) => {
    const runtime = {};
    const workspace = {};
    const skills = {};
    const telemetry = {};
    const subagents = {};
    const planner = {};
    if (env.PRODUCT_AGENT_MODEL) {
        runtime.defaultModel = env.PRODUCT_AGENT_MODEL;
    }
    const envTemp = toNumber(env.PRODUCT_AGENT_TEMPERATURE);
    if (envTemp !== undefined) {
        runtime.defaultTemperature = envTemp;
    }
    const envMaxTokens = toNumber(env.PRODUCT_AGENT_MAX_OUTPUT_TOKENS);
    if (envMaxTokens !== undefined) {
        runtime.maxOutputTokens = envMaxTokens;
    }
    const envRetryAttempts = toNumber(env.PRODUCT_AGENT_RETRY_ATTEMPTS);
    const envRetryBackoff = toNumber(env.PRODUCT_AGENT_RETRY_BACKOFF_MS);
    if (envRetryAttempts !== undefined || envRetryBackoff !== undefined) {
        runtime.retry = {
            attempts: envRetryAttempts ?? DEFAULT_CONFIG.runtime.retry.attempts,
            backoffMs: envRetryBackoff ?? DEFAULT_CONFIG.runtime.retry.backoffMs
        };
    }
    const envAllowStreaming = toBoolean(env.PRODUCT_AGENT_ALLOW_STREAMING);
    if (envAllowStreaming !== undefined) {
        runtime.allowStreaming = envAllowStreaming;
    }
    if (env.PRODUCT_AGENT_FALLBACK_MODEL) {
        runtime.fallbackModel = env.PRODUCT_AGENT_FALLBACK_MODEL;
    }
    if (env.PRODUCT_AGENT_WORKSPACE_ROOT) {
        workspace.storageRoot = path.resolve(env.PRODUCT_AGENT_WORKSPACE_ROOT);
    }
    const envPersistArtifacts = toBoolean(env.PRODUCT_AGENT_WORKSPACE_PERSIST);
    if (envPersistArtifacts !== undefined) {
        workspace.persistArtifacts = envPersistArtifacts;
    }
    const envRetentionDays = toNumber(env.PRODUCT_AGENT_WORKSPACE_RETENTION_DAYS);
    if (envRetentionDays !== undefined) {
        workspace.retentionDays = envRetentionDays;
    }
    if (env.PRODUCT_AGENT_WORKSPACE_TEMP_SUBDIR) {
        workspace.tempSubdir = env.PRODUCT_AGENT_WORKSPACE_TEMP_SUBDIR;
    }
    const envSkillPacks = parseSkillPackList(env.PRODUCT_AGENT_SKILL_PACKS);
    if (envSkillPacks) {
        skills.enabledPacks = envSkillPacks;
    }
    const envAllowDynamicSkills = toBoolean(env.PRODUCT_AGENT_ALLOW_DYNAMIC_SKILLS);
    if (envAllowDynamicSkills !== undefined) {
        skills.allowDynamicOverrides = envAllowDynamicSkills;
    }
    const envStreamTelemetry = toBoolean(env.PRODUCT_AGENT_TELEMETRY_STREAM);
    if (envStreamTelemetry !== undefined) {
        telemetry.enableProgressStream = envStreamTelemetry;
    }
    const envMetrics = toBoolean(env.PRODUCT_AGENT_TELEMETRY_METRICS);
    if (envMetrics !== undefined) {
        telemetry.enableMetrics = envMetrics;
    }
    if (env.PRODUCT_AGENT_TELEMETRY_LOG_LEVEL && LOG_LEVELS.includes(env.PRODUCT_AGENT_TELEMETRY_LOG_LEVEL)) {
        telemetry.logLevel = env.PRODUCT_AGENT_TELEMETRY_LOG_LEVEL;
    }
    const envThrottle = toNumber(env.PRODUCT_AGENT_TELEMETRY_THROTTLE_MS);
    if (envThrottle !== undefined) {
        telemetry.eventThrottleMs = envThrottle;
    }
    const envSubagents = parseSubagentManifestList(env.PRODUCT_AGENT_SUBAGENTS);
    if (envSubagents) {
        subagents.manifests = envSubagents;
    }
    const envPlannerStrategy = env.PRODUCT_AGENT_PLANNER_STRATEGY;
    if (envPlannerStrategy &&
        PLANNER_STRATEGIES.includes(envPlannerStrategy)) {
        planner.strategy = envPlannerStrategy;
    }
    const overrides = {};
    if (Object.keys(runtime).length > 0) {
        overrides.runtime = runtime;
    }
    if (Object.keys(workspace).length > 0) {
        overrides.workspace = workspace;
    }
    if (Object.keys(skills).length > 0) {
        overrides.skills = skills;
    }
    if (Object.keys(telemetry).length > 0) {
        overrides.telemetry = telemetry;
    }
    if (subagents.manifests && subagents.manifests.length > 0) {
        overrides.subagents = subagents;
    }
    if (Object.keys(planner).length > 0) {
        overrides.planner = planner;
    }
    return Object.keys(overrides).length > 0 ? overrides : undefined;
};
export const loadProductAgentConfig = (options) => {
    const base = cloneConfig(DEFAULT_CONFIG);
    const envOverrides = parseEnvOverrides(options?.env ?? process.env);
    const merged = mergeConfig(base, envOverrides, options?.overrides);
    return ProductAgentConfigSchema.parse(merged);
};
export const resolveRunSettings = (config, overrides) => {
    if (!overrides) {
        return {
            model: config.runtime.defaultModel,
            temperature: config.runtime.defaultTemperature,
            maxOutputTokens: config.runtime.maxOutputTokens,
            skillPacks: config.skills.enabledPacks.map(pack => ({ ...pack })),
            workspaceRoot: config.workspace.storageRoot,
            logLevel: config.telemetry.logLevel
        };
    }
    const parsed = ProductAgentApiOverrideSchema.parse(overrides);
    const resolvedAdditionalSkillPacks = parsed.additionalSkillPacks?.map(pack => ({
        id: pack.id,
        version: pack.version ?? 'latest',
        ...(pack.label ? { label: pack.label } : {})
    })) ?? [];
    const primarySkillPack = parsed.skillPackId !== undefined
        ? [
            {
                id: parsed.skillPackId,
                version: 'latest'
            }
        ]
        : config.skills.enabledPacks.map(pack => ({ ...pack }));
    const combinedSkillPacks = [
        ...primarySkillPack,
        ...resolvedAdditionalSkillPacks.filter(pack => !primarySkillPack.some(existing => existing.id === pack.id && existing.version === pack.version))
    ];
    return {
        model: parsed.model ?? config.runtime.defaultModel,
        temperature: parsed.temperature ?? config.runtime.defaultTemperature,
        maxOutputTokens: parsed.maxOutputTokens ?? config.runtime.maxOutputTokens,
        skillPacks: combinedSkillPacks,
        workspaceRoot: parsed.workspaceRoot ?? config.workspace.storageRoot,
        logLevel: parsed.logLevel ?? config.telemetry.logLevel
    };
};
export const getDefaultProductAgentConfig = () => cloneConfig(DEFAULT_CONFIG);
