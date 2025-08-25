export type ContextCategory = 
  | 'requirement'    // Business and functional requirements (RequirementsExtractionWorker)
  | 'constraint'     // Technical, budget, timeline constraints (ContextAnalysisWorker)
  | 'assumption'     // Business assumptions and hypotheses (ProblemStatementWorker)
  | 'stakeholder'    // Key stakeholders and their needs (SolutionFrameworkWorker)
  | 'custom'         // Flexible category for domain-specific context

export type ContextPriority = 'high' | 'medium' | 'low'

export interface CategorizedContextItem {
  id: string
  title: string
  content: string
  category: ContextCategory
  priority: ContextPriority
  tags: string[]
  isActive: boolean
  createdAt: Date
  lastUsed: Date
}

export interface SelectedMessage {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: Date
  isSelected: boolean
}

export interface ContextSettings {
  tokenLimitPercentage: number // Percentage of model context window (default: 30%)
  autoIncludeCurrentPRD: boolean
  defaultCategory: ContextCategory
}

export interface EnhancedContextPayload {
  categorizedContext: CategorizedContextItem[]
  selectedMessages: SelectedMessage[]
  currentPRD?: string
  contextSettings: ContextSettings
}

export interface ContextUsage {
  categorizedTokens: number
  messagesTokens: number
  prdTokens: number
  totalTokens: number
  limitTokens: number
  percentageUsed: number
}

export const CONTEXT_CATEGORY_LABELS: Record<ContextCategory, string> = {
  requirement: 'Business Requirements',
  constraint: 'Technical Constraints', 
  assumption: 'Business Assumptions',
  stakeholder: 'Stakeholder Needs',
  custom: 'Custom Context'
}

export const CONTEXT_CATEGORY_DESCRIPTIONS: Record<ContextCategory, string> = {
  requirement: 'Business and functional requirements (→ RequirementsExtractionWorker)',
  constraint: 'Technical frameworks, budget, and timeline constraints (→ ContextAnalysisWorker)',
  assumption: 'Business assumptions and hypotheses (→ ProblemStatementWorker)',
  stakeholder: 'Key stakeholders and their needs (→ SolutionFrameworkWorker)',
  custom: 'Domain-specific context for general use'
}

// Helper to suggest correct category based on content
export const CATEGORY_KEYWORDS: Record<ContextCategory, string[]> = {
  constraint: ['flutter', 'react native', 'ios', 'android', 'framework', 'technology', 'platform', 'architecture', 'budget', 'timeline', 'deadline', 'cost', 'technical', 'infrastructure', 'database', 'api', 'security'],
  requirement: ['feature', 'functionality', 'user story', 'must have', 'should have', 'business rule', 'workflow', 'process', 'integration', 'compliance'],
  assumption: ['assume', 'hypothesis', 'expect', 'anticipate', 'likely', 'market', 'user behavior', 'growth', 'adoption'],
  stakeholder: ['user', 'customer', 'admin', 'manager', 'developer', 'business owner', 'end user', 'persona', 'role'],
  custom: []
}

export const DEFAULT_CONTEXT_SETTINGS: ContextSettings = {
  tokenLimitPercentage: 30,
  autoIncludeCurrentPRD: true,
  defaultCategory: 'requirement'
}