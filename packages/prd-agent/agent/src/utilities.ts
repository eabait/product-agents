/**
 * Utility functions for PRD Agent
 * Common patterns extracted from the codebase to reduce duplication
 */

import { CURRENT_PRD_VERSION, HTTP_STATUS, ERROR_MESSAGES, FALLBACK_MAX_TOKENS } from './constants'
import { ConfidenceAssessment } from './schemas'

/**
 * Creates a standardized HTTP response
 */
export function createHttpResponse(
  statusCode: number, 
  data: any, 
  contentType: string = 'application/json'
): { statusCode: number; contentType: string; body: string } {
  return {
    statusCode,
    contentType,
    body: JSON.stringify(data)
  }
}

/**
 * Creates a success HTTP response
 */
export function createSuccessResponse(data: any): ReturnType<typeof createHttpResponse> {
  return createHttpResponse(HTTP_STATUS.OK, data)
}

/**
 * Creates an error HTTP response
 */
export function createErrorResponse(
  statusCode: number, 
  message: string
): ReturnType<typeof createHttpResponse> {
  return createHttpResponse(statusCode, { error: message })
}

/**
 * Builds PRD metadata with consistent structure
 */
export function buildPRDMetadata(options: {
  sectionsGenerated: string[]
  confidenceAssessments: Record<string, ConfidenceAssessment>
  overallConfidence: ConfidenceAssessment
  processingTimeMs?: number
  existingMetadata?: any
  usageSummary?: any
}): any {
  return {
    ...options.existingMetadata,
    version: CURRENT_PRD_VERSION,
    lastUpdated: new Date().toISOString(),
    generatedBy: 'PRD Orchestrator Agent',
    sections_generated: options.sectionsGenerated,
    confidence_assessments: options.confidenceAssessments,
    overall_confidence: options.overallConfidence,
    ...(options.processingTimeMs && { processing_time_ms: options.processingTimeMs }),
    ...(options.usageSummary ? { usage: options.usageSummary } : {})
  }
}

/**
 * Validates agent settings and provides defaults
 */
export function validateAgentSettings(settings: any, defaults: any): any {
  const requestedSettings = settings || {}

  const effectiveSettings: any = {
    ...defaults,
    ...requestedSettings,
    // Use request API key if provided, otherwise fall back to environment
    apiKey: requestedSettings?.apiKey || defaults.apiKey
  }

  // Validate critical settings
  if (!effectiveSettings.apiKey) {
    throw new Error(ERROR_MESSAGES.MISSING_API_KEY)
  }

  if (!effectiveSettings.model) {
    throw new Error(ERROR_MESSAGES.INVALID_MODEL)
  }

  // Validate numeric settings
  if (typeof effectiveSettings.temperature !== 'number' || effectiveSettings.temperature < 0 || effectiveSettings.temperature > 2) {
    console.warn(`Invalid temperature ${effectiveSettings.temperature}, using default ${defaults.temperature}`)
    effectiveSettings.temperature = defaults.temperature
  }

  if (typeof effectiveSettings.maxTokens !== 'number' || effectiveSettings.maxTokens < 1) {
    console.warn(`Invalid maxTokens ${effectiveSettings.maxTokens}, using fallback ${FALLBACK_MAX_TOKENS}`)
    effectiveSettings.maxTokens = FALLBACK_MAX_TOKENS
  }

  const defaultSubAgentSettings = defaults.subAgentSettings || {}
  const requestedSubAgentSettings = requestedSettings.subAgentSettings || {}

  const mergedSubAgentSettings = Object.keys({
    ...defaultSubAgentSettings,
    ...requestedSubAgentSettings
  }).reduce<Record<string, any>>((acc, subAgentId) => {
    const baseDefaults = defaultSubAgentSettings[subAgentId] || {
      model: effectiveSettings.model,
      temperature: effectiveSettings.temperature,
      maxTokens: effectiveSettings.maxTokens,
      apiKey: effectiveSettings.apiKey,
      advanced: effectiveSettings.advanced
    }

    const requested = requestedSubAgentSettings[subAgentId] || {}

    const merged = {
      ...baseDefaults,
      ...requested,
      apiKey: requested.apiKey || effectiveSettings.apiKey
    }

    if (!merged.model) {
      merged.model = effectiveSettings.model
    }

    if (typeof merged.temperature !== 'number' || merged.temperature < 0 || merged.temperature > 2) {
      console.warn(`Invalid temperature ${merged.temperature} for subAgent ${subAgentId}, falling back to ${baseDefaults.temperature}`)
      merged.temperature = baseDefaults.temperature
    }

    if (typeof merged.maxTokens !== 'number' || merged.maxTokens < 1) {
      console.warn(`Invalid maxTokens ${merged.maxTokens} for subAgent ${subAgentId}, falling back to ${baseDefaults.maxTokens}`)
      merged.maxTokens = baseDefaults.maxTokens
    }

    acc[subAgentId] = merged
    return acc
  }, {})

  if (Object.keys(mergedSubAgentSettings).length > 0) {
    effectiveSettings.subAgentSettings = mergedSubAgentSettings
  }

  return effectiveSettings
}

/**
 * Extracts section names from various input formats
 */
export function extractSectionNames(input: string[] | string | undefined): string[] {
  if (!input) return []
  if (Array.isArray(input)) return input
  if (typeof input === 'string') return [input]
  return []
}

/**
 * Checks if a section name is valid
 */
export function isValidSectionName(sectionName: string, validSections: readonly string[]): boolean {
  return validSections.includes(sectionName)
}

/**
 * Creates a standardized validation result
 */
export function createValidationResult(isValid: boolean, issues: string[] = [], warnings: string[] = []) {
  return {
    is_valid: isValid,
    issues,
    warnings
  }
}

/**
 * Safely parses JSON with fallback
 */
export function safeParseJSON(jsonString: string, fallback: any = {}): any {
  try {
    return jsonString ? JSON.parse(jsonString) : fallback
  } catch {
    return fallback
  }
}
