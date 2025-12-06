declare module '@product-agents/prd-shared' {
  export type SectionName = string
  export const ALL_SECTION_NAMES: SectionName[]
  export const SECTION_NAMES: SectionName[]

  export interface ConfidenceAssessment {
    level: 'high' | 'medium' | 'low'
    reasons?: string[]
    factors?: Record<string, unknown>
  }

  export type ClarificationResult = Record<string, unknown>

  export const assessConfidence: (...args: any[]) => ConfidenceAssessment
  export const assessInputCompleteness: (...args: any[]) => ConfidenceAssessment
  export const assessContextRichness: (...args: any[]) => ConfidenceAssessment
  export const assessContentSpecificity: (...args: any[]) => ConfidenceAssessment
  export const CONFIDENCE_THRESHOLDS: Record<string, number>
  export const CONTENT_VALIDATION: Record<string, unknown>
  export const DEFAULT_TEMPERATURE: number
  export const MAX_TARGET_USERS: number
  export const MIN_USER_DESCRIPTION_LENGTH: number
  export const MIN_SOLUTION_OVERVIEW_LENGTH: number
  export const MIN_SOLUTION_APPROACH_LENGTH: number
  export const MIN_KEY_FEATURES: number
  export const MAX_KEY_FEATURES: number
  export const MIN_FEATURE_DESCRIPTION_LENGTH: number
  export const MIN_SUCCESS_METRICS: number
  export const MAX_SUCCESS_METRICS: number
  export const MAX_CONSTRAINTS: number
  export const MIN_CONSTRAINTS: number
  export const MAX_ASSUMPTIONS: number
  export const MIN_ASSUMPTIONS: number
  export const MIN_CONSTRAINT_LENGTH: number
  export const MIN_ASSUMPTION_LENGTH: number

  export interface SectionRoutingRequest {
    message: string
    context?: {
      contextPayload?: unknown
      existingPRD?: unknown
      existingSection?: unknown
      targetSection?: string
      conversationHistory?: Array<{ role: string; content: string }>
    }
    settings?: {
      model: string
      temperature?: number
      maxTokens?: number
      apiKey?: string
      subAgentSettings?: Record<
        string,
        { model: string; temperature?: number; maxTokens?: number; apiKey?: string }
      >
    }
    targetSections?: string[]
  }

  export interface SectionRoutingResponse {
    sections?: Record<string, any>
    summary?: string
    confidence?: unknown
    metadata?: Record<string, unknown>
    notes?: string[] | string
  }
}
