declare module '@product-agents/agent-core' {
  export interface AgentRuntimeSettings {
    model: string
    temperature: number
    maxTokens: number
    apiKey?: string
    advanced?: Record<string, any>
  }

  export interface AgentSettings extends AgentRuntimeSettings {
    subAgentSettings?: Record<string, AgentRuntimeSettings>
  }
}

declare module '@product-agents/prd-shared' {
  export type SectionName =
    | 'targetUsers'
    | 'solution'
    | 'keyFeatures'
    | 'successMetrics'
    | 'constraints'

  export const SECTION_NAMES: {
    readonly TARGET_USERS: SectionName
    readonly SOLUTION: SectionName
    readonly KEY_FEATURES: SectionName
    readonly SUCCESS_METRICS: SectionName
    readonly CONSTRAINTS: SectionName
  }
  export const ALL_SECTION_NAMES: readonly SectionName[]
  export const DEFAULT_TEMPERATURE: number
  export const DEFAULT_MAX_TOKENS: number
  export const FALLBACK_MAX_TOKENS: number
  export const CURRENT_PRD_VERSION: string
  export const DEFAULT_AGENT_SETTINGS: {
    readonly model: string
    readonly temperature: number
    readonly maxTokens: number
  }
  export const HTTP_STATUS: Record<string, number>
  export const ERROR_MESSAGES: Record<string, string>

  export interface ConfidenceAssessment {
    level: 'high' | 'medium' | 'low'
    reasons?: string[]
    metadata?: Record<string, unknown>
  }

  export interface ClarificationResult {
    needsClarification: boolean
    questions?: string[]
    details?: Record<string, unknown>
  }

  export interface SectionContext {
    contextPayload?: unknown
    existingPRD?: {
      sections?: Record<string, unknown>
      [key: string]: unknown
    }
    existingSection?: unknown
    targetSection?: SectionName
    sharedAnalysisResults?: Map<string, unknown> | Record<string, unknown>
  }

  export interface SectionRoutingRequest {
    message: string
    context?: SectionContext
    settings?: {
      apiKey?: string
      [key: string]: unknown
    }
    targetSections?: SectionName[]
  }

  export interface SectionRoutingResponse {
    sections: Record<string, unknown>
    metadata: {
      sections_updated?: string[]
      confidence_assessments?: Record<string, ConfidenceAssessment>
      overall_confidence?: ConfidenceAssessment
      processing_time_ms?: number
      should_regenerate_prd?: boolean
      [key: string]: unknown
    }
    validation: {
      is_valid: boolean
      issues: string[]
      warnings: string[]
    }
  }

  export function combineConfidenceAssessments(
    assessments: Record<string, ConfidenceAssessment> | ConfidenceAssessment[]
  ): ConfidenceAssessment
}

declare module '@product-agents/skill-analyzer-core' {
  import type { AgentSettings } from '@product-agents/agent-core'
  import type { ConfidenceAssessment } from '@product-agents/prd-shared'
  import type { z } from 'zod'

  export interface AnalyzerResult<T = unknown> {
    name: string
    data: T
    confidence?: ConfidenceAssessment
    metadata?: Record<string, unknown>
  }

  export interface AnalyzerInput {
    message: string
    context?: {
      contextPayload?: any
      existingPRD?: any
      previousResults?: Map<string, any>
    }
  }

  export abstract class BaseAnalyzer {
    protected client: any
    protected settings: AgentSettings
    constructor(settings: AgentSettings)
    abstract analyze(input: AnalyzerInput): Promise<AnalyzerResult>
    protected generateStructured<T>(params: {
      schema: z.ZodType<T, z.ZodTypeDef, any>
      prompt: string
      temperature?: number
      arrayFields?: string[]
    }): Promise<T>
    protected generateText(params: {
      prompt: string
      temperature?: number
      maxTokens?: number
    }): Promise<string>
    protected composeMetadata(baseMetadata?: Record<string, unknown>):
      | Record<string, unknown>
      | undefined
  }
}

declare module '@product-agents/skills-clarifications' {
  import type { AgentSettings } from '@product-agents/agent-core'
  import type { ClarificationResult, ConfidenceAssessment } from '@product-agents/prd-shared'

  interface ClarificationAnalysisResult<TData = unknown> {
    name: string
    data: TData
    confidence?: ConfidenceAssessment
    metadata?: Record<string, unknown>
  }

  export class ClarificationAnalyzer {
    constructor(settings: AgentSettings)
    analyze(input: {
      message: string
      context?: {
        contextPayload?: unknown
        existingPRD?: unknown
      }
    }): Promise<ClarificationAnalysisResult<ClarificationResult>>
  }

  export interface ClarificationSkillManifestEntry {
    id: string
    label: string
    version: string
    category: string
    description?: string
  }

  export interface ClarificationSkillPackManifest {
    id: string
    version: string
    label: string
    description?: string
    skills: ClarificationSkillManifestEntry[]
  }

  export const clarificationSkillPack: ClarificationSkillPackManifest
  export function listClarificationSkills(): ClarificationSkillManifestEntry[]
  export function createClarificationPrompt(userMessage: string): string
  export function ensureArrayFields<T>(response: unknown, arrayFields: string[]): T
}

declare module '@product-agents/skills-prd' {
  import type { AgentSettings } from '@product-agents/agent-core'
  import type {
    ClarificationResult,
    ConfidenceAssessment,
    SectionName,
    SectionRoutingRequest,
    SectionRoutingResponse
  } from '@product-agents/prd-shared'

  interface AnalysisResult<TData = unknown> {
    name: string
    data: TData
    confidence: ConfidenceAssessment
    metadata?: Record<string, unknown>
  }

  export class ContextAnalyzer {
    constructor(settings: AgentSettings)
    analyze(input: {
      message: string
      context?: {
        contextPayload?: unknown
        existingPRD?: unknown
      }
    }): Promise<AnalysisResult>
  }

  export class ClarificationAnalyzer {
    constructor(settings: AgentSettings)
    analyze(input: {
      message: string
      context?: {
        contextPayload?: unknown
        existingPRD?: unknown
      }
    }): Promise<AnalysisResult<ClarificationResult>>
  }

  export interface SectionWriterResponse {
    content: unknown
    confidence: ConfidenceAssessment
    metadata?: Record<string, unknown>
    validation?: {
      is_valid: boolean
      issues: string[]
      warnings: string[]
    }
  }

  export class TargetUsersSectionWriter {
    constructor(settings: AgentSettings)
    writeSection(input: SectionRoutingRequest): Promise<SectionWriterResponse>
  }
  export class SolutionSectionWriter {
    constructor(settings: AgentSettings)
    writeSection(input: SectionRoutingRequest): Promise<SectionWriterResponse>
  }
  export class KeyFeaturesSectionWriter {
    constructor(settings: AgentSettings)
    writeSection(input: SectionRoutingRequest): Promise<SectionWriterResponse>
  }
  export class SuccessMetricsSectionWriter {
    constructor(settings: AgentSettings)
    writeSection(input: SectionRoutingRequest): Promise<SectionWriterResponse>
  }
  export class ConstraintsSectionWriter {
    constructor(settings: AgentSettings)
    writeSection(input: SectionRoutingRequest): Promise<SectionWriterResponse>
  }
}
