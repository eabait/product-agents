/**
 * Constants for PRD Agent
 * Centralized location for all magic numbers, strings, and configuration values
 */

// API and Token Configuration
export const DEFAULT_TEMPERATURE = 0.3
export const DEFAULT_MAX_TOKENS = 8000
export const FALLBACK_MAX_TOKENS = 4000

// PRD Version Configuration
export const CURRENT_PRD_VERSION = '2.0'

// Confidence and Assessment Constants
export const DEFAULT_EXISTING_RESULT_CONFIDENCE = 0.8
export const DEFAULT_SECTION_CONFIDENCE = 0.85

// Validation Thresholds
export const MAX_TARGET_USERS = 5
export const MIN_TARGET_USERS = 1
export const MIN_USER_DESCRIPTION_LENGTH = 10
export const MAX_KEY_FEATURES = 8
export const MIN_KEY_FEATURES = 3
export const MIN_FEATURE_DESCRIPTION_LENGTH = 15
export const MAX_SUCCESS_METRICS = 6
export const MIN_SUCCESS_METRICS = 2
export const MAX_CONSTRAINTS = 8
export const MIN_CONSTRAINTS = 1
export const MAX_ASSUMPTIONS = 6
export const MIN_ASSUMPTIONS = 1
export const MIN_CONSTRAINT_LENGTH = 15
export const MIN_ASSUMPTION_LENGTH = 15

// Section Names (for type safety and consistency)
export const SECTION_NAMES = {
  TARGET_USERS: 'targetUsers',
  SOLUTION: 'solution', 
  KEY_FEATURES: 'keyFeatures',
  SUCCESS_METRICS: 'successMetrics',
  CONSTRAINTS: 'constraints'
} as const

// All section names array for iteration
export const ALL_SECTION_NAMES = Object.values(SECTION_NAMES)

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
} as const

// Error Messages
export const ERROR_MESSAGES = {
  MISSING_MESSAGE: 'Message is required',
  MISSING_API_KEY: 'No API key configured. Please set OPENROUTER_API_KEY environment variable or provide apiKey in settings.',
  INVALID_MODEL: 'No model specified. Please provide a valid model in settings.',
  GENERATION_FAILED: 'Failed to generate response',
  INVALID_EXISTING_PRD: 'Missing message or existingPRD',
  MISSING_SETTINGS: 'Settings are required'
} as const

// Default Settings
export const DEFAULT_AGENT_SETTINGS = {
  model: 'anthropic/claude-3-5-sonnet',
  temperature: DEFAULT_TEMPERATURE,
  maxTokens: DEFAULT_MAX_TOKENS
} as const

// Timeout and Retry Configuration
export const REQUEST_TIMEOUT_MS = 30000
export const MAX_RETRY_ATTEMPTS = 3
export const RETRY_DELAY_MS = 1000

// Content Length Limits
export const MAX_MESSAGE_LENGTH = 50000
export const MAX_PRD_SIZE_BYTES = 100000
export const MIN_CONTENT_LENGTH_FOR_HIGH_CONFIDENCE = 500
export const MIN_CONTENT_LENGTH_FOR_MEDIUM_CONFIDENCE = 200

// Solution Validation
export const MIN_SOLUTION_OVERVIEW_LENGTH = 50
export const MIN_SOLUTION_APPROACH_LENGTH = 30

// Analysis Configuration
export const MIN_THEMES_COUNT = 1
export const MAX_THEMES_COUNT = 5
export const MIN_REQUIREMENTS_COUNT = 1
export const MAX_EPICS_COUNT = 10

// Type definitions for better type safety
export type SectionName = typeof SECTION_NAMES[keyof typeof SECTION_NAMES]
export type HttpStatusCode = typeof HTTP_STATUS[keyof typeof HTTP_STATUS]
export type ErrorMessage = typeof ERROR_MESSAGES[keyof typeof ERROR_MESSAGES]

// Union types for all possible values
export type AllSectionNames = 'targetUsers' | 'solution' | 'keyFeatures' | 'successMetrics' | 'constraints'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
