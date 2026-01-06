/**
 * Default configuration values and limits for product agents
 */

export const TEMPERATURE_MIN = 0
export const TEMPERATURE_MAX = 2
export const TEMPERATURE_DEFAULT = 0.2

export const MAX_TOKENS_MIN = 1
export const MAX_TOKENS_MAX = 200000
export const MAX_TOKENS_DEFAULT = 8000

export const DEFAULT_ORCHESTRATOR_MODEL = 'qwen/qwen-2.5-72b-instruct'
export const DEFAULT_RESEARCH_MODEL = 'google/gemini-3-flash-preview'

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]
export const DEFAULT_LOG_LEVEL: LogLevel = 'info'

export const STREAMING_DEFAULT = true

/**
 * Environment variable names for configuration
 */
export const ENV_VARS = {
  // API Keys
  OPENROUTER_API_KEY: 'OPENROUTER_API_KEY',
  TAVILY_API_KEY: 'TAVILY_API_KEY',

  // Orchestrator settings
  ORCHESTRATOR_MODEL: 'ORCHESTRATOR_MODEL',
  ORCHESTRATOR_TEMPERATURE: 'ORCHESTRATOR_TEMPERATURE',
  ORCHESTRATOR_MAX_TOKENS: 'ORCHESTRATOR_MAX_TOKENS',

  // Subagent model overrides
  PERSONA_AGENT_MODEL: 'PERSONA_AGENT_MODEL',
  RESEARCH_AGENT_MODEL: 'RESEARCH_AGENT_MODEL',

  // Runtime
  STREAMING_ENABLED: 'STREAMING_ENABLED',
  LOG_LEVEL: 'LOG_LEVEL'
} as const
