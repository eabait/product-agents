import { z } from 'zod'

export const ArtifactTypeSchema = z.enum(['prd', 'persona', 'story-map', 'prompt'])

export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  content: z.string(),
  timestamp: z.union([z.string(), z.date()]).optional()
})

export const SettingsSchema = z.object({
  model: z.string(),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(1).max(100000),
  apiKey: z.string().optional(),
  streaming: z.boolean().optional()
})

export const StartRunSchema = z.object({
  artifactType: ArtifactTypeSchema.default('prd'),
  messages: z.array(MessageSchema).min(1),
  settings: SettingsSchema.optional(),
  contextPayload: z.any().optional(),
  targetSections: z.array(z.string()).optional(),
  approvalMode: z.enum(['auto', 'manual']).default('manual')
})

export type StartRunPayload = z.infer<typeof StartRunSchema>
