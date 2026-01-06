import { z } from 'zod'
import {
  TEMPERATURE_MIN,
  TEMPERATURE_MAX,
  TEMPERATURE_DEFAULT,
  MAX_TOKENS_MIN,
  MAX_TOKENS_MAX,
  MAX_TOKENS_DEFAULT,
  DEFAULT_ORCHESTRATOR_MODEL,
  DEFAULT_RESEARCH_MODEL,
  LOG_LEVELS,
  DEFAULT_LOG_LEVEL,
  STREAMING_DEFAULT
} from './constants'

/**
 * Transform string to number, returning undefined if invalid
 */
const toNumber = z.string().transform((val) => {
  const num = Number(val)
  return Number.isFinite(num) ? num : undefined
})

/**
 * Transform string to boolean
 */
const toBoolean = z.string().transform((val) => {
  if (val === 'true') return true
  if (val === 'false') return false
  return undefined
})

/**
 * Environment configuration schema with transforms
 * Used to parse and validate environment variables
 */
export const EnvConfigSchema = z.object({
  // API Keys
  OPENROUTER_API_KEY: z.string().optional(),
  TAVILY_API_KEY: z.string().optional(),

  // Orchestrator settings
  ORCHESTRATOR_MODEL: z.string().default(DEFAULT_ORCHESTRATOR_MODEL),
  ORCHESTRATOR_TEMPERATURE: toNumber
    .pipe(z.number().min(TEMPERATURE_MIN).max(TEMPERATURE_MAX).optional())
    .default(String(TEMPERATURE_DEFAULT)),
  ORCHESTRATOR_MAX_TOKENS: toNumber
    .pipe(z.number().int().min(MAX_TOKENS_MIN).max(MAX_TOKENS_MAX).optional())
    .default(String(MAX_TOKENS_DEFAULT)),

  // Subagent model overrides (optional - inherit from orchestrator if not set)
  PERSONA_AGENT_MODEL: z.string().optional(),
  RESEARCH_AGENT_MODEL: z.string().default(DEFAULT_RESEARCH_MODEL),

  // Runtime settings
  STREAMING_ENABLED: toBoolean.pipe(z.boolean().optional()).default(String(STREAMING_DEFAULT)),
  LOG_LEVEL: z.enum(LOG_LEVELS).default(DEFAULT_LOG_LEVEL)
})
export type EnvConfig = z.infer<typeof EnvConfigSchema>

/**
 * Parse environment variables into typed config
 */
export function parseEnvConfig(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  return EnvConfigSchema.parse(env)
}

/**
 * Resolved configuration after applying env vars and defaults
 */
export interface ResolvedConfig {
  apiKeys: {
    openRouter?: string
    tavily?: string
  }
  orchestrator: {
    model: string
    temperature: number
    maxTokens: number
  }
  subagents: {
    personaModel?: string
    researchModel: string
  }
  runtime: {
    streaming: boolean
    logLevel: 'debug' | 'info' | 'warn' | 'error'
  }
}

/**
 * Get resolved configuration from environment
 */
export function getResolvedConfig(env: NodeJS.ProcessEnv = process.env): ResolvedConfig {
  const parsed = parseEnvConfig(env)

  return {
    apiKeys: {
      openRouter: parsed.OPENROUTER_API_KEY,
      tavily: parsed.TAVILY_API_KEY
    },
    orchestrator: {
      model: parsed.ORCHESTRATOR_MODEL,
      temperature: parsed.ORCHESTRATOR_TEMPERATURE ?? TEMPERATURE_DEFAULT,
      maxTokens: parsed.ORCHESTRATOR_MAX_TOKENS ?? MAX_TOKENS_DEFAULT
    },
    subagents: {
      personaModel: parsed.PERSONA_AGENT_MODEL,
      researchModel: parsed.RESEARCH_AGENT_MODEL
    },
    runtime: {
      streaming: parsed.STREAMING_ENABLED ?? STREAMING_DEFAULT,
      logLevel: parsed.LOG_LEVEL
    }
  }
}

/**
 * Get model for a specific subagent, falling back to orchestrator model
 */
export function getSubagentModel(
  subagentId: string,
  config: ResolvedConfig
): string {
  const modelMap: Record<string, string | undefined> = {
    'persona.builder': config.subagents.personaModel,
    'research.core.agent': config.subagents.researchModel
  }

  return modelMap[subagentId] ?? config.orchestrator.model
}
