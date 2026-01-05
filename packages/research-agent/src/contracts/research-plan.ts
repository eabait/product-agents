import { z } from 'zod'

export const ResearchStepTypeSchema = z.enum([
  'web-search',
  'competitor-analysis',
  'market-sizing',
  'trend-analysis',
  'user-research-synthesis',
  'regulatory-scan',
  'opportunity-analysis'
])

export const ResearchStepSchema = z.object({
  id: z.string(),
  type: ResearchStepTypeSchema,
  label: z.string(),
  description: z.string(),
  queries: z.array(z.string()),
  targetSources: z.array(z.string()).optional(),
  estimatedSources: z.number().optional(),
  dependsOn: z.array(z.string()).default([])
})

export const ClarificationQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  context: z.string().optional(),
  required: z.boolean().default(false),
  options: z.array(z.string()).optional()
})

export const ResearchPlanStatusSchema = z.enum([
  'draft',
  'awaiting-confirmation',
  'awaiting-clarification',
  'confirmed',
  'in-progress',
  'completed',
  'failed'
])

export const ResearchPlanSchema = z.object({
  id: z.string(),
  topic: z.string(),
  scope: z.string(),
  objectives: z.array(z.string()),
  steps: z.array(ResearchStepSchema),
  estimatedDuration: z.string().optional(),
  estimatedSources: z.number().optional(),
  clarificationQuestions: z.array(ClarificationQuestionSchema).optional(),
  status: ResearchPlanStatusSchema,
  createdAt: z.string()
})

export type ResearchStepType = z.infer<typeof ResearchStepTypeSchema>
export type ResearchStep = z.infer<typeof ResearchStepSchema>
export type ClarificationQuestion = z.infer<typeof ClarificationQuestionSchema>
export type ResearchPlanStatus = z.infer<typeof ResearchPlanStatusSchema>
export type ResearchPlan = z.infer<typeof ResearchPlanSchema>
