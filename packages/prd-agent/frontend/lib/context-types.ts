/**
 * Context categories mapped to specific AI workers for optimal processing
 */
export type ContextCategory = 
  | 'requirement'    // Business and functional requirements (RequirementsExtractionWorker)
  | 'constraint'     // Technical, budget, timeline constraints (ContextAnalysisWorker)
  | 'assumption'     // Business assumptions and hypotheses (ProblemStatementWorker)
  | 'stakeholder'    // Key stakeholders and their needs (SolutionFrameworkWorker)
  | 'custom'         // Flexible category for domain-specific context

/**
 * Priority levels for context items (affects processing order)
 */
export type ContextPriority = 'high' | 'medium' | 'low'

/**
 * Branded type for context item IDs to prevent mixing with other ID types
 */
export type ContextItemId = string & { readonly __brand: 'ContextItemId' }

/**
 * Branded type for message IDs to prevent mixing with other ID types
 */
export type MessageId = string & { readonly __brand: 'MessageId' }

/**
 * Common predefined tags for context items
 */
export type CommonTag = 
  | 'extracted' | 'prd' | 'user-created' | 'imported' 
  | 'high-confidence' | 'needs-review' | 'validated'

/**
 * Configuration constants
 */
export const CONTEXT_CONSTRAINTS = {
  MAX_TITLE_LENGTH: 100,
  MAX_CONTENT_LENGTH: 5000,
  MAX_TAGS_COUNT: 10,
  MIN_CONTENT_LENGTH: 10,
  TOKEN_ESTIMATION_RATIO: 4, // characters per token approximation
  DEFAULT_MODEL_CONTEXT_WINDOW: 128000,
} as const

/**
 * Categorized context item with enhanced type safety and validation
 */
export interface CategorizedContextItem {
  /** Unique identifier for the context item */
  readonly id: ContextItemId
  /** Human-readable title (max 100 chars) */
  title: string
  /** Main content of the context item (10-5000 chars) */
  content: string
  /** Category determines which AI worker processes this item */
  category: ContextCategory
  /** Processing priority level */
  priority: ContextPriority
  /** Searchable tags for organization (max 10 tags) */
  tags: readonly (string | CommonTag)[]
  /** Whether this item is included in context payload */
  isActive: boolean
  /** When the item was created */
  readonly createdAt: Date
  /** Last time the item was used in a request */
  lastUsed: Date
}

/**
 * Message that can be selected for context inclusion
 */
export interface SelectedMessage {
  /** Unique identifier for the message */
  readonly id: MessageId
  /** Message content */
  content: string
  /** Message role in the conversation */
  role: 'user' | 'assistant'
  /** When the message was created */
  readonly timestamp: Date
  /** Whether this message is selected for context */
  isSelected: boolean
}

/**
 * Configuration settings for context management
 */
export interface ContextSettings {
  /** Percentage of model context window to allocate for context (1-100) */
  tokenLimitPercentage: number
  /** Whether to automatically include current PRD in context */
  autoIncludeCurrentPRD: boolean
  /** Default category for new context items */
  defaultCategory: ContextCategory
}

/**
 * Complete context payload sent to AI backend
 */
export interface EnhancedContextPayload {
  /** Active categorized context items */
  readonly categorizedContext: readonly CategorizedContextItem[]
  /** Selected conversation messages */
  readonly selectedMessages: readonly SelectedMessage[]
  /** Current PRD content if available */
  readonly currentPRD?: string
  /** Context configuration settings */
  readonly contextSettings: ContextSettings
}

/**
 * Token usage metrics for context management
 */
export interface ContextUsage {
  /** Tokens used by categorized context items */
  readonly categorizedTokens: number
  /** Tokens used by selected messages */
  readonly messagesTokens: number
  /** Tokens used by current PRD */
  readonly prdTokens: number
  /** Total tokens in context payload */
  readonly totalTokens: number
  /** Maximum tokens allowed based on settings */
  readonly limitTokens: number
  /** Percentage of limit being used (0-100+) */
  readonly percentageUsed: number
}

/**
 * Human-readable labels for context categories
 */
export const CONTEXT_CATEGORY_LABELS: Readonly<Record<ContextCategory, string>> = {
  requirement: 'Business Requirements',
  constraint: 'Technical Constraints', 
  assumption: 'Business Assumptions',
  stakeholder: 'Stakeholder Needs',
  custom: 'Custom Context'
} as const

/**
 * Detailed descriptions of context categories and their AI worker mappings
 */
export const CONTEXT_CATEGORY_DESCRIPTIONS: Readonly<Record<ContextCategory, string>> = {
  requirement: 'Business and functional requirements (→ RequirementsExtractionWorker)',
  constraint: 'Technical frameworks, budget, and timeline constraints (→ ContextAnalysisWorker)',
  assumption: 'Business assumptions and hypotheses (→ ProblemStatementWorker)',
  stakeholder: 'Key stakeholders and their needs (→ SolutionFrameworkWorker)',
  custom: 'Domain-specific context for general use'
} as const

/**
 * Keywords used for automatic category suggestion based on content analysis
 */
export const CATEGORY_KEYWORDS: Readonly<Record<ContextCategory, readonly string[]>> = {
  constraint: ['flutter', 'react native', 'ios', 'android', 'framework', 'technology', 'platform', 'architecture', 'budget', 'timeline', 'deadline', 'cost', 'technical', 'infrastructure', 'database', 'api', 'security', 'compliance', 'pci', 'aws', 'cloud', 'microservices'] as const,
  requirement: ['feature', 'functionality', 'user story', 'must have', 'should have', 'business rule', 'workflow', 'process', 'integration', 'onboarding', 'payment', 'automation'] as const,
  assumption: ['assume', 'hypothesis', 'expect', 'anticipate', 'likely', 'market', 'user behavior', 'growth', 'adoption', 'risk', 'assessment'] as const,
  stakeholder: ['user', 'customer', 'admin', 'manager', 'developer', 'business owner', 'end user', 'persona', 'role', 'stakeholder'] as const,
  custom: [] as const
} as const

/**
 * Default configuration for context management
 */
export const DEFAULT_CONTEXT_SETTINGS: Readonly<ContextSettings> = {
  tokenLimitPercentage: 30,
  autoIncludeCurrentPRD: true,
  defaultCategory: 'requirement'
} as const

/**
 * Type guards for runtime validation
 */
export function isValidContextCategory(value: unknown): value is ContextCategory {
  return typeof value === 'string' && 
    ['requirement', 'constraint', 'assumption', 'stakeholder', 'custom'].includes(value)
}

export function isValidContextPriority(value: unknown): value is ContextPriority {
  return typeof value === 'string' && ['high', 'medium', 'low'].includes(value)
}

export function isValidTokenPercentage(value: unknown): value is number {
  return typeof value === 'number' && value >= 1 && value <= 100
}

/**
 * Helper functions for branded types
 */
export function createContextItemId(id: string): ContextItemId {
  return id as ContextItemId
}

export function createMessageId(id: string): MessageId {
  return id as MessageId
}

/**
 * Validation helpers
 */
export function validateContextItem(item: Partial<CategorizedContextItem>): string[] {
  const errors: string[] = []
  
  if (!item.title || item.title.length === 0) {
    errors.push('Title is required')
  } else if (item.title.length > CONTEXT_CONSTRAINTS.MAX_TITLE_LENGTH) {
    errors.push(`Title must be ${CONTEXT_CONSTRAINTS.MAX_TITLE_LENGTH} characters or less`)
  }
  
  if (!item.content || item.content.length < CONTEXT_CONSTRAINTS.MIN_CONTENT_LENGTH) {
    errors.push(`Content must be at least ${CONTEXT_CONSTRAINTS.MIN_CONTENT_LENGTH} characters`)
  } else if (item.content.length > CONTEXT_CONSTRAINTS.MAX_CONTENT_LENGTH) {
    errors.push(`Content must be ${CONTEXT_CONSTRAINTS.MAX_CONTENT_LENGTH} characters or less`)
  }
  
  if (item.category && !isValidContextCategory(item.category)) {
    errors.push('Invalid category')
  }
  
  if (item.priority && !isValidContextPriority(item.priority)) {
    errors.push('Invalid priority')
  }
  
  if (item.tags && item.tags.length > CONTEXT_CONSTRAINTS.MAX_TAGS_COUNT) {
    errors.push(`Maximum ${CONTEXT_CONSTRAINTS.MAX_TAGS_COUNT} tags allowed`)
  }
  
  return errors
}