// Re-export all types and schemas
export type { PRD, PRDPatch } from './schemas'
export { PRDSchema, PRDPatchSchema } from './schemas'

// Re-export utility functions
export { applyPatch, cleanPatchResponse } from './utils'

// Re-export all workers
export * from './workers'

// Re-export main agent
export { PRDGeneratorAgent } from './prd-generator-agent'

// Re-export WorkerResult type from agent-core for backward compatibility
export type { WorkerResult } from '@product-agents/agent-core'
