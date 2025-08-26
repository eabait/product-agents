'use client'

// Import removed - Message type not needed for current functionality
import { 
  EnhancedContextPayload, 
  ContextUsage, 
  CategorizedContextItem, 
  SelectedMessage, 
  ContextSettings,
  ContextCategory,
  CONTEXT_CATEGORY_LABELS,
  CATEGORY_KEYWORDS,
  CONTEXT_CONSTRAINTS,
  createContextItemId
} from './context-types'
import { contextStorage } from './context-storage'

/**
 * Token counting cache to avoid recalculation
 */
const tokenCache = new Map<string, number>()

/**
 * Model-specific token estimation ratios
 */
const MODEL_TOKEN_RATIOS = {
  'anthropic/claude-3-5-sonnet': 3.8,
  'anthropic/claude-3-haiku': 4.2,
  'openai/gpt-4': 3.5,
  'openai/gpt-3.5-turbo': 4.0,
  default: 4.0
} as const

/**
 * Enhanced token estimation with caching and model-specific ratios
 */
export function estimateTokens(
  text: string, 
  model?: string, 
  useCache: boolean = true
): number {
  if (!text) return 0
  
  const cacheKey = `${text.length}-${model || 'default'}`
  
  if (useCache && tokenCache.has(cacheKey)) {
    return tokenCache.get(cacheKey)!
  }
  
  // Get model-specific ratio
  const ratio = model && model in MODEL_TOKEN_RATIOS 
    ? MODEL_TOKEN_RATIOS[model as keyof typeof MODEL_TOKEN_RATIOS]
    : MODEL_TOKEN_RATIOS.default
  
  // Enhanced estimation considering:
  // - Basic character to token ratio
  // - Word boundaries (spaces typically don't count as separate tokens)
  // - Common patterns (numbers, punctuation)
  const words = text.trim().split(/\s+/).length
  const basicEstimate = Math.ceil(text.length / ratio)
  const wordAdjustment = Math.max(0, words * 0.1) // Slight boost for word boundaries
  
  const estimate = Math.max(1, Math.floor(basicEstimate + wordAdjustment))
  
  if (useCache) {
    // Limit cache size to prevent memory leaks
    if (tokenCache.size > 1000) {
      const oldestKey = tokenCache.keys().next().value
      tokenCache.delete(oldestKey)
    }
    tokenCache.set(cacheKey, estimate)
  }
  
  return estimate
}

/**
 * Clear token estimation cache
 */
export function clearTokenCache(): void {
  tokenCache.clear()
}

/**
 * Build enhanced context payload for API requests with validation
 */
export function buildEnhancedContextPayload(
  messages: any[],
  currentPRD?: string,
  model?: string
): EnhancedContextPayload {
  try {
    const categorizedContext = contextStorage.getActiveContextItems()
    const selectedMessages = contextStorage.getSelectedMessagesForContext()
    const contextSettings = contextStorage.getContextSettings()

    // Add current PRD if enabled and available
    const prdToInclude = contextSettings.autoIncludeCurrentPRD ? currentPRD : undefined

    const payload: EnhancedContextPayload = {
      categorizedContext: categorizedContext as readonly CategorizedContextItem[],
      selectedMessages: selectedMessages as readonly SelectedMessage[],
      currentPRD: prdToInclude,
      contextSettings
    }

    // Validate token limits
    const usage = calculateContextUsage(payload, undefined, model)
    if (usage.percentageUsed > 100) {
      console.warn(`Context payload exceeds token limit: ${usage.percentageUsed}%`)
    }

    return payload
  } catch (error) {
    console.error('Error building context payload:', error)
    // Return minimal valid payload on error
    return {
      categorizedContext: [],
      selectedMessages: [],
      contextSettings: contextStorage.getContextSettings()
    }
  }
}

/**
 * Calculate context token usage with model-specific estimation
 */
export function calculateContextUsage(
  payload: EnhancedContextPayload,
  modelContextWindow?: number,
  model?: string
): ContextUsage {
  const { categorizedContext, selectedMessages, currentPRD, contextSettings } = payload
  
  // Use provided window size or default from constants
  const contextWindow = modelContextWindow || CONTEXT_CONSTRAINTS.DEFAULT_MODEL_CONTEXT_WINDOW

  // Calculate tokens for each component with model-specific estimation
  const categorizedTokens = categorizedContext.reduce((total, item) => {
    return total + estimateTokens(`${item.title} ${item.content}`, model)
  }, 0)

  const messagesTokens = selectedMessages.reduce((total, msg) => {
    return total + estimateTokens(msg.content, model)
  }, 0)

  const prdTokens = currentPRD ? estimateTokens(currentPRD, model) : 0

  const totalTokens = categorizedTokens + messagesTokens + prdTokens
  const limitTokens = Math.floor(modelContextWindow * (contextSettings.tokenLimitPercentage / 100))
  const percentageUsed = (totalTokens / limitTokens) * 100

  return {
    categorizedTokens,
    messagesTokens,
    prdTokens,
    totalTokens,
    limitTokens,
    percentageUsed
  }
}

// Build conversation context for AI with injected context
export function buildEnhancedConversationContext(
  messages: any[],
  payload: EnhancedContextPayload
): any[] {
  const { categorizedContext, selectedMessages, currentPRD } = payload

  // Build context injection message
  const contextParts: string[] = []

  // Add categorized context by priority
  if (categorizedContext.length > 0) {
    const contextByPriority = [...categorizedContext].sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })

    contextParts.push('## Categorized Context')
    
    for (const item of contextByPriority) {
      const categoryLabel = CONTEXT_CATEGORY_LABELS[item.category]
      contextParts.push(`### ${categoryLabel}: ${item.title}`)
      contextParts.push(item.content)
      contextParts.push('') // Empty line for separation
    }
  }

  // Add selected messages
  if (selectedMessages.length > 0) {
    contextParts.push('## Selected Previous Messages')
    
    for (const msg of selectedMessages) {
      const roleLabel = msg.role === 'user' ? 'User' : 'Assistant'
      contextParts.push(`### ${roleLabel}:`)
      contextParts.push(msg.content)
      contextParts.push('') // Empty line for separation
    }
  }

  // Add current PRD
  if (currentPRD) {
    contextParts.push('## Current PRD')
    contextParts.push(currentPRD)
    contextParts.push('') // Empty line for separation
  }

  // If no context to inject, return original messages
  if (contextParts.length === 0) {
    return messages
  }

  // Create context injection message
  const contextMessage: any = {
    id: 'context-injection',
    role: 'system',
    content: [
      '# Additional Context',
      'The following context should be considered when generating the PRD:',
      '',
      ...contextParts,
      '---',
      'Please use this context appropriately when processing the user\'s request.'
    ].join('\n')
  }

  // Insert context message before the last user message
  const messagesWithContext = [...messages]
  
  // Find the last user message index
  const lastUserMessageIndex = messagesWithContext.map((msg, index) => ({ msg, index }))
    .filter(({ msg }) => msg.role === 'user')
    .pop()?.index

  if (lastUserMessageIndex !== undefined) {
    // Insert context message right before the last user message
    messagesWithContext.splice(lastUserMessageIndex, 0, contextMessage)
  } else {
    // If no user message found, append context at the beginning
    messagesWithContext.unshift(contextMessage)
  }

  return messagesWithContext
}

// Sync messages from conversation to selectable messages
export function syncConversationMessages(messages: any[]): void {
  messages.forEach(message => {
    if (message.role === 'user' || message.role === 'assistant') {
      contextStorage.addSelectableMessage({
        id: message.id,
        content: message.content,
        role: message.role,
        timestamp: message.timestamp || new Date()
      })
    }
  })
}


// Get context summary for display
export function getContextSummary(payload: EnhancedContextPayload): string {
  const { categorizedContext, selectedMessages, currentPRD } = payload
  
  const parts: string[] = []
  
  if (categorizedContext.length > 0) {
    parts.push(`${categorizedContext.length} context items`)
  }
  
  if (selectedMessages.length > 0) {
    parts.push(`${selectedMessages.length} selected messages`)
  }
  
  if (currentPRD) {
    parts.push('current PRD')
  }
  
  return parts.length > 0 ? parts.join(', ') : 'No active context'
}

/**
 * Enhanced category suggestion with improved algorithm
 */
export function suggestCategory(title: string, content: string): {
  suggested: ContextCategory
  confidence: number
  reasons: string[]
} {
  if (!title || !content) {
    return { suggested: 'custom', confidence: 0, reasons: [] }
  }

  const text = `${title} ${content}`.toLowerCase()
  const words = text.split(/\b/).filter(word => word.trim().length > 2)
  const totalWords = words.length
  
  const categoryScores: Record<ContextCategory, { score: number; matches: string[]; weightedScore: number }> = {
    requirement: { score: 0, matches: [], weightedScore: 0 },
    constraint: { score: 0, matches: [], weightedScore: 0 },
    assumption: { score: 0, matches: [], weightedScore: 0 },
    stakeholder: { score: 0, matches: [], weightedScore: 0 },
    custom: { score: 0, matches: [], weightedScore: 0 }
  }

  // Enhanced keyword matching with word boundaries and context awareness
  Object.entries(CATEGORY_KEYWORDS).forEach(([category, keywords]) => {
    const categoryKey = category as ContextCategory
    
    keywords.forEach(keyword => {
      const keywordLower = keyword.toLowerCase()
      
      // Check for exact word boundary matches (higher weight)
      const wordBoundaryRegex = new RegExp(`\\b${keywordLower}\\b`, 'gi')
      const exactMatches = (text.match(wordBoundaryRegex) || []).length
      
      // Check for partial matches (lower weight)
      const partialMatches = text.includes(keywordLower) ? 1 : 0
      
      if (exactMatches > 0) {
        categoryScores[categoryKey].score += exactMatches * 2 // Higher weight for exact matches
        categoryScores[categoryKey].matches.push(keyword)
        
        // Additional weight for matches in title vs content
        if (title.toLowerCase().includes(keywordLower)) {
          categoryScores[categoryKey].weightedScore += exactMatches * 1.5 // Title matches are more important
        } else {
          categoryScores[categoryKey].weightedScore += exactMatches
        }
      } else if (partialMatches > 0 && !exactMatches) {
        categoryScores[categoryKey].score += 0.5 // Lower weight for partial matches
        categoryScores[categoryKey].matches.push(keyword)
        categoryScores[categoryKey].weightedScore += 0.3
      }
    })
  })

  // Find category with highest weighted score
  const sortedCategories = Object.entries(categoryScores)
    .sort(([,a], [,b]) => b.weightedScore - a.weightedScore)

  const topCategory = sortedCategories[0]
  const suggested = topCategory[0] as ContextCategory
  const topScore = topCategory[1].weightedScore
  const matches = Array.from(new Set(topCategory[1].matches)) // Remove duplicates

  // Improved confidence calculation
  let confidence = 0
  if (topScore > 0) {
    // Base confidence on score relative to text length and keyword density
    const keywordDensity = matches.length / Math.max(totalWords * 0.1, 1)
    const scoreRatio = topScore / Math.max(totalWords * 0.05, 1)
    confidence = Math.min(Math.round((keywordDensity + scoreRatio) * 30), 100)
    
    // Boost confidence for strong title matches
    if (title.toLowerCase().split(/\s+/).some(word => 
      matches.some(match => word.includes(match.toLowerCase()))
    )) {
      confidence = Math.min(confidence + 20, 100)
    }
    
    // Ensure minimum confidence for any matches
    confidence = Math.max(confidence, 15)
  }

  return {
    suggested: topScore > 0 ? suggested : 'custom',
    confidence,
    reasons: matches.slice(0, 3) // Top 3 matching keywords
  }
}

/**
 * Check if context item might be miscategorized with enhanced logic
 */
export function checkCategoryMismatch(item: CategorizedContextItem): {
  isMismatch: boolean
  suggestedCategory: ContextCategory
  confidence: number
  explanation: string
} {
  const suggestion = suggestCategory(item.title, item.content)
  const confidenceThreshold = 50 // Lower threshold for better sensitivity
  const isMismatch = suggestion.confidence > confidenceThreshold && 
                     suggestion.suggested !== item.category &&
                     suggestion.suggested !== 'custom'

  let explanation = ''
  if (isMismatch) {
    const categoryLabel = CONTEXT_CATEGORY_LABELS[suggestion.suggested]
    const currentLabel = CONTEXT_CATEGORY_LABELS[item.category]
    explanation = `Contains ${categoryLabel.toLowerCase()} keywords (${suggestion.reasons.join(', ')}) but categorized as ${currentLabel.toLowerCase()}`
  }

  return {
    isMismatch,
    suggestedCategory: suggestion.suggested,
    confidence: suggestion.confidence,
    explanation
  }
}

/**
 * Enhanced payload validation with comprehensive checks
 */
export function validateContextPayload(
  payload: EnhancedContextPayload, 
  model?: string
): {
  isValid: boolean
  errors: string[]
  warnings: string[]
  misclassifications: Array<{
    item: CategorizedContextItem
    suggestedCategory: ContextCategory
    explanation: string
  }>
  performance: {
    validationTime: number
    itemsProcessed: number
  }
} {
  const startTime = performance.now()
  const errors: string[] = []
  const warnings: string[] = []
  const misclassifications: Array<{
    item: CategorizedContextItem
    suggestedCategory: ContextCategory
    explanation: string
  }> = []
  
  try {
    // Check token limits with model-specific calculation
    const usage = calculateContextUsage(payload, undefined, model)
    
    if (usage.percentageUsed > 100) {
      errors.push(`Context exceeds token limit: ${usage.totalTokens} / ${usage.limitTokens} tokens (${Math.round(usage.percentageUsed)}%)`)
    } else if (usage.percentageUsed > 90) {
      errors.push(`Context is critically close to token limit: ${Math.round(usage.percentageUsed)}% used`)
    } else if (usage.percentageUsed > 80) {
      warnings.push(`Context is approaching token limit: ${Math.round(usage.percentageUsed)}% used`)
    }
    
    // Check for empty context
    if (payload.categorizedContext.length === 0 && 
        payload.selectedMessages.length === 0 && 
        !payload.currentPRD) {
      warnings.push('No context items are currently active')
    }
    
    // Enhanced validation for individual items
    payload.categorizedContext.forEach((item, index) => {
      // Token size check
      const tokens = estimateTokens(item.content, model)
      if (tokens > 2000) {
        errors.push(`Context item "${item.title}" is extremely large (${tokens} tokens) and may cause issues`)
      } else if (tokens > 1000) {
        warnings.push(`Context item "${item.title}" is very large (${tokens} tokens)`)
      }
      
      // Content quality checks
      if (item.content.trim().length < CONTEXT_CONSTRAINTS.MIN_CONTENT_LENGTH) {
        warnings.push(`Context item "${item.title}" has very short content`)
      }
      
      if (item.title.length > CONTEXT_CONSTRAINTS.MAX_TITLE_LENGTH) {
        warnings.push(`Context item "${item.title}" has a very long title`)
      }
      
      // Check for potential misclassifications
      const mismatch = checkCategoryMismatch(item)
      if (mismatch.isMismatch) {
        misclassifications.push({
          item,
          suggestedCategory: mismatch.suggestedCategory,
          explanation: mismatch.explanation
        })
        
        if (mismatch.confidence > 80) {
          warnings.push(`"${item.title}" is likely miscategorized - ${mismatch.explanation}`)
        } else {
          warnings.push(`"${item.title}" may be miscategorized - ${mismatch.explanation}`)
        }
      }
    })
    
    // Check for duplicate content
    const contentHashes = new Set<string>()
    payload.categorizedContext.forEach(item => {
      const contentHash = `${item.title.toLowerCase()}-${item.content.substring(0, 100).toLowerCase()}`
      if (contentHashes.has(contentHash)) {
        warnings.push(`Possible duplicate context item: "${item.title}"`)
      }
      contentHashes.add(contentHash)
    })
    
  } catch (error) {
    errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
  
  const endTime = performance.now()
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    misclassifications,
    performance: {
      validationTime: endTime - startTime,
      itemsProcessed: payload.categorizedContext.length + payload.selectedMessages.length + (payload.currentPRD ? 1 : 0)
    }
  }
}

/**
 * Rate limiting for expensive operations
 */
const rateLimiter = new Map<string, { count: number; resetTime: number }>()

export function isRateLimited(operation: string, limit: number = 10, windowMs: number = 60000): boolean {
  const now = Date.now()
  const key = operation
  
  let record = rateLimiter.get(key)
  
  if (!record || now > record.resetTime) {
    record = { count: 0, resetTime: now + windowMs }
    rateLimiter.set(key, record)
  }
  
  record.count++
  
  return record.count > limit
}