// Re-export all types and schemas
export type {
  PRD,
  SectionRoutingRequest,
  SectionRoutingResponse,
  ClarificationResult,
  ConfidenceAssessment
} from '@product-agents/prd-shared'
export {
  PRDSchema,
  SectionRoutingRequestSchema,
  SectionRoutingResponseSchema,
  ClarificationResultSchema,
  ConfidenceAssessmentSchema
} from '@product-agents/prd-shared'

// Re-export utility functions
export { applyPatch, ensureArrayFields, postProcessStructuredResponse } from './utils'

// Re-export constants
export {
  CONFIDENCE_THRESHOLDS,
  CONTENT_VALIDATION,
  CONFIDENCE_SCORING,
  CONTENT_THRESHOLDS,
  DEFAULT_TEMPERATURE,
  SECTION_NAMES,
  ALL_SECTION_NAMES
} from '@product-agents/prd-shared'

// Re-export analyzers, section writers, and prompts
export * from '@product-agents/skills-prd'

// Re-export main agent
export { PRDOrchestratorAgent } from './prd-orchestrator-agent'
export type { ProgressEvent, ProgressCallback } from './prd-orchestrator-agent'

// Re-export base types from agent-core
export type { WorkerResult } from '@product-agents/agent-core'
