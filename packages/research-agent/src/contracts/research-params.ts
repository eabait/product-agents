import { z } from 'zod'
import type { ResearchPlan } from './research-plan'

export const ResearchFocusAreaSchema = z.enum([
  'market-size',
  'competitors',
  'trends',
  'user-needs',
  'regulations',
  'technology',
  'opportunities'
])

export const ResearchDepthSchema = z.enum(['quick', 'standard', 'deep'])

export const ResearchBuilderParamsSchema = z.object({
  query: z.string().min(1),

  industry: z.string().optional(),
  region: z.string().optional(),
  timeframe: z.string().optional(),

  focusAreas: z.array(ResearchFocusAreaSchema).optional(),

  depth: ResearchDepthSchema.default('standard'),
  maxSources: z.number().min(5).max(100).default(20),

  contextPayload: z.unknown().optional(),
  description: z.string().optional(),

  requirePlanConfirmation: z.boolean().default(true),

  approvedPlan: z.unknown().optional(),

  clarificationAnswers: z.record(z.string(), z.string()).optional()
})

export type ResearchFocusArea = z.infer<typeof ResearchFocusAreaSchema>
export type ResearchDepth = z.infer<typeof ResearchDepthSchema>
export type ResearchBuilderParams = z.infer<typeof ResearchBuilderParamsSchema>

export interface ResearchBuilderParamsWithPlan extends ResearchBuilderParams {
  approvedPlan?: ResearchPlan
}
