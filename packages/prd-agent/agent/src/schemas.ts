import { z } from 'zod'
import { 
  ContextSection, 
  ProblemStatementSection, 
  AssumptionsSection, 
  MetricsSection 
} from './section-writers'

// Modern PRD Schema focused on section-based structure
export const PRDSchema = z.object({
  // Core sections
  sections: z.object({
    context: z.any().optional(), // ContextSection (includes requirements)
    problemStatement: z.any().optional(), // ProblemStatementSection
    assumptions: z.any().optional(), // AssumptionsSection
    metrics: z.any().optional(), // MetricsSection
  }),
  
  // Metadata
  metadata: z.object({
    version: z.string().default('2.0'),
    lastUpdated: z.string(),
    generatedBy: z.string().default('PRD Orchestrator Agent'),
    sections_generated: z.array(z.string()),
    confidence_scores: z.record(z.number()).optional()
  }),

  // Flattened fields for frontend compatibility (auto-generated from sections)
  problemStatement: z.string().optional(),
  solutionOverview: z.string().optional(),
  targetUsers: z.array(z.string()).optional(),
  goals: z.array(z.string()).optional(),
  successMetrics: z.array(z.object({
    metric: z.string(),
    target: z.string(),
    timeline: z.string()
  })).optional(),
  constraints: z.array(z.string()).optional(),
  assumptions: z.array(z.string()).optional()
})

export type PRD = z.infer<typeof PRDSchema>

// Section-specific operation schemas
export const SectionOperationSchema = z.object({
  operation: z.enum(['generate', 'update', 'regenerate']),
  section: z.enum(['context', 'problemStatement', 'assumptions', 'metrics']),
  input: z.object({
    message: z.string(),
    context: z.object({
      contextPayload: z.any().optional(),
      existingPRD: z.any().optional(),
      existingSection: z.any().optional(),
      targetSection: z.string().optional()
    }).optional()
  })
})

export type SectionOperation = z.infer<typeof SectionOperationSchema>

// Section routing request
export const SectionRoutingRequestSchema = z.object({
  message: z.string(),
  context: z.object({
    contextPayload: z.any().optional(),
    existingPRD: z.any().optional(),
    conversationHistory: z.array(z.any()).optional()
  }).optional(),
  settings: z.object({
    model: z.string(),
    temperature: z.number(),
    maxTokens: z.number(),
    apiKey: z.string().optional()
  }).optional(),
  targetSections: z.array(z.string()).optional() // Specific sections to update
})

export type SectionRoutingRequest = z.infer<typeof SectionRoutingRequestSchema>

// Section routing response
export const SectionRoutingResponseSchema = z.object({
  sections: z.record(z.any()), // Map of section name to section content
  metadata: z.object({
    sections_updated: z.array(z.string()),
    confidence_scores: z.record(z.number()),
    total_confidence: z.number(),
    processing_time_ms: z.number(),
    should_regenerate_prd: z.boolean()
  }),
  validation: z.object({
    is_valid: z.boolean(),
    issues: z.array(z.string()),
    warnings: z.array(z.string())
  })
})

export type SectionRoutingResponse = z.infer<typeof SectionRoutingResponseSchema>

// Clarification schemas - for internal analyzer use
export const ClarificationResultSchema = z.object({
  needsClarification: z.boolean(),
  confidence: z.number().min(0).max(100),
  missingCritical: z.array(z.string()),
  questions: z.array(z.string())
})

export type ClarificationResult = z.infer<typeof ClarificationResultSchema>