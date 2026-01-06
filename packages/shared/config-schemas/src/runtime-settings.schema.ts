import { z } from 'zod'
import {
  TEMPERATURE_MIN,
  TEMPERATURE_MAX,
  MAX_TOKENS_MIN,
  MAX_TOKENS_MAX
} from './constants'

/**
 * Runtime override schema - all fields optional for partial overrides
 */
export const RuntimeOverridesSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(TEMPERATURE_MIN).max(TEMPERATURE_MAX).optional(),
  maxTokens: z.number().int().min(MAX_TOKENS_MIN).max(MAX_TOKENS_MAX).optional(),
  apiKey: z.string().optional()
})
export type RuntimeOverrides = z.infer<typeof RuntimeOverridesSchema>

/**
 * Full settings schema - required fields for API requests
 */
export const SettingsSchema = z.object({
  model: z.string().min(1),
  temperature: z.number().min(TEMPERATURE_MIN).max(TEMPERATURE_MAX),
  maxTokens: z.number().int().min(MAX_TOKENS_MIN).max(MAX_TOKENS_MAX),
  apiKey: z.string().optional(),
  streaming: z.boolean().optional()
})
export type Settings = z.infer<typeof SettingsSchema>

/**
 * Message schema for chat/run requests
 */
export const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system']).default('user'),
  content: z.string(),
  timestamp: z.union([z.string(), z.date()]).optional()
})
export type Message = z.infer<typeof MessageSchema>

/**
 * Artifact type schema
 */
export const ArtifactTypeSchema = z.enum(['prd', 'persona', 'story-map', 'prompt'])
export type ArtifactType = z.infer<typeof ArtifactTypeSchema>

/**
 * Start run request schema
 */
export const StartRunSchema = z.object({
  artifactType: ArtifactTypeSchema.default('prd'),
  messages: z.array(MessageSchema).min(1),
  settings: SettingsSchema.optional(),
  contextPayload: z.any().optional(),
  targetSections: z.array(z.string()).optional()
})
export type StartRunPayload = z.infer<typeof StartRunSchema>

/**
 * Chat request schema
 */
export const ChatRequestSchema = z.object({
  messages: z.array(MessageSchema),
  settings: SettingsSchema.optional(),
  contextPayload: z.any().optional()
})
export type ChatRequest = z.infer<typeof ChatRequestSchema>
