import path from 'node:path'
import { z } from 'zod'

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
const PLANNER_STRATEGIES = ['intelligent', 'legacy-prd'] as const

const SkillPackReferenceSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  label: z.string().optional()
})

const RetryPolicySchema = z.object({
  attempts: z.number().int().min(1),
  backoffMs: z.number().int().min(0)
})

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
})

const PlannerConfigSchema = z.object({
  strategy: z.enum(PLANNER_STRATEGIES)
})

export const ProductAgentConfigSchema = z.object({
  runtime: z.object({
    defaultModel: z.string().min(1),
    skillsModel: z.string().min(1).nullable().default(null),
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
})

const SkillPackInputSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1).optional(),
  label: z.string().optional()
})

export const ProductAgentApiOverrideSchema = z.object({
  model: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxOutputTokens: z.number().int().min(128).max(200000).optional(),
  skillPackId: z.string().min(1).optional(),
  additionalSkillPacks: z.array(SkillPackInputSchema).optional(),
  workspaceRoot: z.string().min(1).optional(),
  logLevel: z.enum(LOG_LEVELS).optional()
})

export type SkillPackReference = z.infer<typeof SkillPackReferenceSchema>
export type RetryPolicy = z.infer<typeof RetryPolicySchema>
export type ProductAgentConfig = z.infer<typeof ProductAgentConfigSchema>
export type ProductAgentApiOverrides = z.infer<typeof ProductAgentApiOverrideSchema>
export type TelemetryLogLevel = typeof LOG_LEVELS[number]
export type SubagentConfigEntry = z.infer<typeof SubagentManifestConfigSchema>
export type PlannerConfig = z.infer<typeof PlannerConfigSchema>
export type PlannerStrategy = typeof PLANNER_STRATEGIES[number]

const DEFAULT_STORAGE_ROOT = path.resolve(process.cwd(), 'data', 'runs')

const DEFAULT_PERSONA_SUBAGENT_MANIFEST: SubagentConfigEntry = {
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
}

const DEFAULT_RESEARCH_SUBAGENT_MANIFEST: SubagentConfigEntry = {
  id: 'research.core.agent',
  package: '@product-agents/research-agent',
  version: '0.1.0',
  label: 'Research Agent',
  creates: 'research',
  consumes: ['prompt', 'prd', 'brief'],
  capabilities: ['plan', 'search', 'synthesize', 'clarify'],
  description: 'Conducts market research, competitor analysis, and contextual intelligence gathering with web search capabilities.',
  entry: '@product-agents/research-agent',
  exportName: 'createResearchAgentSubagent',
  tags: ['research', 'market-intelligence', 'web-search']
}

const DEFAULT_STORYMAP_SUBAGENT_MANIFEST: SubagentConfigEntry = {
  id: 'storymap.builder',
  package: '@product-agents/storymap-agent',
  version: '0.1.0',
  label: 'Story Map Agent',
  creates: 'story-map',
  consumes: ['prd', 'persona', 'research'],
  capabilities: ['synthesize', 'plan'],
  description: 'Generates user story maps from PRD, personas, and research artifacts.',
  entry: '@product-agents/storymap-agent',
  exportName: 'createStorymapAgentSubagent',
  tags: ['storymap', 'planning', 'user-stories']
}

const DEFAULT_CONFIG: ProductAgentConfig = {
  runtime: {
    defaultModel: process.env.ORCHESTRATOR_MODEL ?? 'qwen/qwen-2.5-72b-instruct',
    skillsModel: null,
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
        id: 'clarification-skill-pack',
        version: 'latest',
        label: 'Clarification Skill Pack'
      },
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
    manifests: [
      DEFAULT_PERSONA_SUBAGENT_MANIFEST,
      DEFAULT_RESEARCH_SUBAGENT_MANIFEST,
      DEFAULT_STORYMAP_SUBAGENT_MANIFEST
    ]
  },
  planner: {
    strategy: 'intelligent'
  }
}

const cloneConfig = (config: ProductAgentConfig): ProductAgentConfig => ({
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
})

type RuntimeOverrides = Partial<ProductAgentConfig['runtime']> & { retry?: Partial<RetryPolicy> }
type WorkspaceOverrides = Partial<ProductAgentConfig['workspace']>
type SkillsOverrides = Partial<ProductAgentConfig['skills']> & { enabledPacks?: SkillPackReference[] }
type TelemetryOverrides = Partial<ProductAgentConfig['telemetry']>
type SubagentOverrides = Partial<ProductAgentConfig['subagents']>
type PlannerOverrides = Partial<ProductAgentConfig['planner']>

type PartialProductAgentConfig = {
  runtime?: RuntimeOverrides
  workspace?: WorkspaceOverrides
  skills?: SkillsOverrides
  telemetry?: TelemetryOverrides
  subagents?: SubagentOverrides
  planner?: PlannerOverrides
}

const mergeConfig = (
  base: ProductAgentConfig,
  ...overrides: Array<PartialProductAgentConfig | undefined>
): ProductAgentConfig => {
  return overrides.reduce<ProductAgentConfig>((acc, override) => {
    if (!override) {
      return acc
    }

    const next: ProductAgentConfig = {
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
    }

    return next
  }, cloneConfig(base))
}

const toNumber = (value: string | undefined): number | undefined => {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const toBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined
  if (value === 'true') return true
  if (value === 'false') return false
  return undefined
}

const parseSkillPackList = (value: string | undefined): SkillPackReference[] | undefined => {
  if (!value) return undefined

  const packs = value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map<SkillPackReference>(token => {
      const [idPart, versionPart] = token.split('@')
      const id = idPart.trim()
      const version = versionPart?.trim() || 'latest'
      return { id, version }
    })

  return packs.length > 0 ? packs : undefined
}

const parseSubagentManifestList = (
  value: string | undefined
): SubagentConfigEntry[] | undefined => {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return undefined
    }

    const manifests: SubagentConfigEntry[] = []
    parsed.forEach(entry => {
      const result = SubagentManifestConfigSchema.safeParse(entry)
      if (result.success) {
        manifests.push(result.data)
      }
    })

    return manifests.length > 0 ? manifests : undefined
  } catch {
    return undefined
  }
}

const parseEnvOverrides = (env: NodeJS.ProcessEnv): PartialProductAgentConfig | undefined => {
  const runtime: RuntimeOverrides = {}
  const workspace: WorkspaceOverrides = {}
  const skills: SkillsOverrides = {}
  const telemetry: TelemetryOverrides = {}
  const subagents: SubagentOverrides = {}
  const planner: PlannerOverrides = {}

  // Support both ORCHESTRATOR_MODEL (new centralized config) and PRODUCT_AGENT_MODEL (legacy)
  // Prefer ORCHESTRATOR_MODEL for consistency with centralized .env
  if (env.ORCHESTRATOR_MODEL) {
    runtime.defaultModel = env.ORCHESTRATOR_MODEL
  } else if (env.PRODUCT_AGENT_MODEL) {
    runtime.defaultModel = env.PRODUCT_AGENT_MODEL
  }
  // Optional: Override model specifically for skills (falls back to defaultModel if not set)
  if (env.SKILLS_MODEL) {
    runtime.skillsModel = env.SKILLS_MODEL
  }
  // Support both ORCHESTRATOR_TEMPERATURE and PRODUCT_AGENT_TEMPERATURE
  const envTemp = toNumber(env.ORCHESTRATOR_TEMPERATURE ?? env.PRODUCT_AGENT_TEMPERATURE)
  if (envTemp !== undefined) {
    runtime.defaultTemperature = envTemp
  }
  // Support both ORCHESTRATOR_MAX_TOKENS and PRODUCT_AGENT_MAX_OUTPUT_TOKENS
  const envMaxTokens = toNumber(env.ORCHESTRATOR_MAX_TOKENS ?? env.PRODUCT_AGENT_MAX_OUTPUT_TOKENS)
  if (envMaxTokens !== undefined) {
    runtime.maxOutputTokens = envMaxTokens
  }
  const envRetryAttempts = toNumber(env.PRODUCT_AGENT_RETRY_ATTEMPTS)
  const envRetryBackoff = toNumber(env.PRODUCT_AGENT_RETRY_BACKOFF_MS)
  if (envRetryAttempts !== undefined || envRetryBackoff !== undefined) {
    runtime.retry = {
      attempts: envRetryAttempts ?? DEFAULT_CONFIG.runtime.retry.attempts,
      backoffMs: envRetryBackoff ?? DEFAULT_CONFIG.runtime.retry.backoffMs
    }
  }
  const envAllowStreaming = toBoolean(env.PRODUCT_AGENT_ALLOW_STREAMING)
  if (envAllowStreaming !== undefined) {
    runtime.allowStreaming = envAllowStreaming
  }
  if (env.PRODUCT_AGENT_FALLBACK_MODEL) {
    runtime.fallbackModel = env.PRODUCT_AGENT_FALLBACK_MODEL
  }

  if (env.PRODUCT_AGENT_WORKSPACE_ROOT) {
    workspace.storageRoot = path.resolve(env.PRODUCT_AGENT_WORKSPACE_ROOT)
  }
  const envPersistArtifacts = toBoolean(env.PRODUCT_AGENT_WORKSPACE_PERSIST)
  if (envPersistArtifacts !== undefined) {
    workspace.persistArtifacts = envPersistArtifacts
  }
  const envRetentionDays = toNumber(env.PRODUCT_AGENT_WORKSPACE_RETENTION_DAYS)
  if (envRetentionDays !== undefined) {
    workspace.retentionDays = envRetentionDays
  }
  if (env.PRODUCT_AGENT_WORKSPACE_TEMP_SUBDIR) {
    workspace.tempSubdir = env.PRODUCT_AGENT_WORKSPACE_TEMP_SUBDIR
  }

  const envSkillPacks = parseSkillPackList(env.PRODUCT_AGENT_SKILL_PACKS)
  if (envSkillPacks) {
    skills.enabledPacks = envSkillPacks
  }
  const envAllowDynamicSkills = toBoolean(env.PRODUCT_AGENT_ALLOW_DYNAMIC_SKILLS)
  if (envAllowDynamicSkills !== undefined) {
    skills.allowDynamicOverrides = envAllowDynamicSkills
  }

  const envStreamTelemetry = toBoolean(env.PRODUCT_AGENT_TELEMETRY_STREAM)
  if (envStreamTelemetry !== undefined) {
    telemetry.enableProgressStream = envStreamTelemetry
  }
  const envMetrics = toBoolean(env.PRODUCT_AGENT_TELEMETRY_METRICS)
  if (envMetrics !== undefined) {
    telemetry.enableMetrics = envMetrics
  }
  if (env.PRODUCT_AGENT_TELEMETRY_LOG_LEVEL && LOG_LEVELS.includes(env.PRODUCT_AGENT_TELEMETRY_LOG_LEVEL as TelemetryLogLevel)) {
    telemetry.logLevel = env.PRODUCT_AGENT_TELEMETRY_LOG_LEVEL as TelemetryLogLevel
  }
  const envThrottle = toNumber(env.PRODUCT_AGENT_TELEMETRY_THROTTLE_MS)
  if (envThrottle !== undefined) {
    telemetry.eventThrottleMs = envThrottle
  }

  const envSubagents = parseSubagentManifestList(env.PRODUCT_AGENT_SUBAGENTS)
  if (envSubagents) {
    subagents.manifests = envSubagents
  }

  const envPlannerStrategy = env.PRODUCT_AGENT_PLANNER_STRATEGY
  if (
    envPlannerStrategy &&
    (PLANNER_STRATEGIES as readonly string[]).includes(envPlannerStrategy as PlannerStrategy)
  ) {
    planner.strategy = envPlannerStrategy as PlannerStrategy
  }

  const overrides: PartialProductAgentConfig = {}
  if (Object.keys(runtime as Record<string, unknown>).length > 0) {
    overrides.runtime = runtime
  }
  if (Object.keys(workspace as Record<string, unknown>).length > 0) {
    overrides.workspace = workspace
  }
  if (Object.keys(skills as Record<string, unknown>).length > 0) {
    overrides.skills = skills
  }
  if (Object.keys(telemetry as Record<string, unknown>).length > 0) {
    overrides.telemetry = telemetry
  }
  if (subagents.manifests && subagents.manifests.length > 0) {
    overrides.subagents = subagents
  }
  if (Object.keys(planner as Record<string, unknown>).length > 0) {
    overrides.planner = planner
  }

  return Object.keys(overrides as Record<string, unknown>).length > 0 ? overrides : undefined
}

export const loadProductAgentConfig = (options?: {
  env?: NodeJS.ProcessEnv
  overrides?: PartialProductAgentConfig
}): ProductAgentConfig => {
  const base = cloneConfig(DEFAULT_CONFIG)
  const envOverrides = parseEnvOverrides(options?.env ?? process.env)
  const merged = mergeConfig(base, envOverrides, options?.overrides)
  return ProductAgentConfigSchema.parse(merged)
}

export interface EffectiveRunSettings {
  model: string
  temperature: number
  maxOutputTokens: number
  skillPacks: SkillPackReference[]
  workspaceRoot: string
  logLevel: TelemetryLogLevel
}

export const resolveRunSettings = (
  config: ProductAgentConfig,
  overrides?: ProductAgentApiOverrides | null
): EffectiveRunSettings => {
  if (!overrides) {
    return {
      model: config.runtime.defaultModel,
      temperature: config.runtime.defaultTemperature,
      maxOutputTokens: config.runtime.maxOutputTokens,
      skillPacks: config.skills.enabledPacks.map(pack => ({ ...pack })),
      workspaceRoot: config.workspace.storageRoot,
      logLevel: config.telemetry.logLevel
    }
  }

  const parsed = ProductAgentApiOverrideSchema.parse(overrides)
  const resolvedAdditionalSkillPacks =
    parsed.additionalSkillPacks?.map<SkillPackReference>(pack => ({
      id: pack.id,
      version: pack.version ?? 'latest',
      ...(pack.label ? { label: pack.label } : {})
    })) ?? []

  const primarySkillPack =
    parsed.skillPackId !== undefined
      ? [
          {
            id: parsed.skillPackId,
            version: 'latest'
          }
        ]
      : config.skills.enabledPacks.map(pack => ({ ...pack }))

  const combinedSkillPacks = [
    ...primarySkillPack,
    ...resolvedAdditionalSkillPacks.filter(
      pack => !primarySkillPack.some(existing => existing.id === pack.id && existing.version === pack.version)
    )
  ]

  return {
    model: parsed.model ?? config.runtime.defaultModel,
    temperature: parsed.temperature ?? config.runtime.defaultTemperature,
    maxOutputTokens: parsed.maxOutputTokens ?? config.runtime.maxOutputTokens,
    skillPacks: combinedSkillPacks,
    workspaceRoot: parsed.workspaceRoot ?? config.workspace.storageRoot,
    logLevel: parsed.logLevel ?? config.telemetry.logLevel
  }
}

export const getDefaultProductAgentConfig = (): ProductAgentConfig => cloneConfig(DEFAULT_CONFIG)
