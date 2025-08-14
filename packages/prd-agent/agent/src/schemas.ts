import { z } from 'zod'

export const PRDSchema = z.object({
  problemStatement: z.string(),
  solutionOverview: z.string(),
  targetUsers: z.array(z.string()),
  goals: z.array(z.string()),
  successMetrics: z.array(z.object({
    metric: z.string(),
    target: z.string(),
    timeline: z.string()
  })),
  constraints: z.array(z.string()),
  assumptions: z.array(z.string())
})

export type PRD = z.infer<typeof PRDSchema>

// Simplified PRD Patch schema for Cerebras/DeepSeek compatibility
// Using only required non-null types to avoid JSON schema issues
export const PRDPatchSchema = z.object({
  mode: z.literal('patch'),
  patch: z.object({
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
  }).strict()  // Only allow defined fields, no additional properties
})

export type PRDPatch = z.infer<typeof PRDPatchSchema>