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
import {
  CacheSettings,
  UsageThreshold,
  ConfidenceThreshold,
  TokenSizeLimits,
  PROVIDER_TOKEN_RATIOS,
  TEXT_TYPE_MULTIPLIERS,
  LEGACY_MODEL_TOKEN_RATIOS,
  CALCULATION_WEIGHTS,
  CATEGORY_SUGGESTION_WEIGHTS,
  VALIDATION_LIMITS
} from './ui-constants'

/**
 * Token counting cache to avoid recalculation
 */
const tokenCache = new Map<string, number>()

/**
 * Extract provider name from model ID (e.g., "anthropic/claude-3-5-sonnet" → "anthropic")
 */
function extractProviderFromModelId(modelId?: string): string {
  if (!modelId) return 'default'
  
  const parts = modelId.split('/')
  return parts.length > 1 ? parts[0] : 'default'
}

/**
 * Detect text type for more accurate token estimation
 */
function detectTextType(text: unknown): keyof typeof TEXT_TYPE_MULTIPLIERS {
  // Type guard - ensure we have a valid string
  if (!text || typeof text !== 'string') {
    return 'natural' // Safe fallback for non-string inputs
  }
  
  // Simple heuristics to detect text type
  const codePatterns = /^\s*(?:function|class|import|export|const|let|var|if|for|while|\{|\})/m
  const jsonPattern = /^\s*[{\[].*[}\]]\s*$/s
  const markdownPattern = /(?:^#{1,6}\s|\*\*|__|\_|\_|\[.*\]\(.*\)|```)/m
  
  try {
    const trimmedText = text.trim()
    
    if (jsonPattern.test(trimmedText)) {
      return 'json'
    } else if (codePatterns.test(text)) {
      return 'code'
    } else if (markdownPattern.test(text)) {
      return 'markdown'
    } else {
      return 'natural'
    }
  } catch (error) {
    // If any regex operation fails, fall back to natural
    console.warn('Error detecting text type:', error)
    return 'natural'
  }
}

/**
 * Enhanced token estimation with provider-based ratios, text type detection, and caching
 * 
 * @param text - The text to estimate tokens for (accepts any type, safely handles non-strings)
 * @param model - Full model ID (e.g., "anthropic/claude-3-5-sonnet-20241022")
 * @param textType - Optional text type override for more accurate estimation
 * @param useCache - Whether to use caching (default: true)
 */
export function estimateTokens(
  text: unknown, 
  model?: string, 
  textType?: keyof typeof TEXT_TYPE_MULTIPLIERS,
  useCache: boolean = true
): number {
  // Type guard - handle non-string inputs safely
  if (!text || typeof text !== 'string') {
    return 0
  }
  
  // Ensure we have actual text content
  const textString = text.trim()
  if (textString.length === 0) {
    return 0
  }
  
  // Create cache key that includes text type for better accuracy
  const detectedTextType = textType || detectTextType(textString)
  const cacheKey = `${textString.length}-${model || 'default'}-${detectedTextType}`
  
  if (useCache && tokenCache.has(cacheKey)) {
    return tokenCache.get(cacheKey)!
  }
  
  // Get provider-based ratio with fallbacks
  let ratio: number
  
  // 1. Try legacy model-specific ratios first (backwards compatibility)
  if (model && model in LEGACY_MODEL_TOKEN_RATIOS) {
    ratio = LEGACY_MODEL_TOKEN_RATIOS[model as keyof typeof LEGACY_MODEL_TOKEN_RATIOS]
  } else {
    // 2. Use provider-based ratio
    const provider = extractProviderFromModelId(model)
    ratio = provider in PROVIDER_TOKEN_RATIOS 
      ? PROVIDER_TOKEN_RATIOS[provider as keyof typeof PROVIDER_TOKEN_RATIOS]
      : PROVIDER_TOKEN_RATIOS.default
  }
  
  // 3. Apply text type multiplier for better accuracy
  const textTypeMultiplier = TEXT_TYPE_MULTIPLIERS[detectedTextType]
  const adjustedRatio = ratio * textTypeMultiplier
  
  // Enhanced estimation considering:
  // - Basic character to token ratio
  // - Word boundaries (spaces typically don't count as separate tokens)
  // - Common patterns (numbers, punctuation)
  const words = textString.split(/\s+/).length
  const basicEstimate = Math.ceil(textString.length / adjustedRatio)
  const wordAdjustment = Math.max(0, words * CALCULATION_WEIGHTS.WORD_BOUNDARY_ADJUSTMENT)
  
  const estimate = Math.max(1, Math.floor(basicEstimate + wordAdjustment))
  
  if (useCache) {
    // Limit cache size to prevent memory leaks
    if (tokenCache.size > CacheSettings.TOKEN_CACHE_MAX_SIZE) {
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
    if (usage.percentageUsed > UsageThreshold.MAXIMUM) {
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
    // Safely handle potentially undefined/null title and content
    const title = item.title || ''
    const content = item.content || ''
    const textToAnalyze = `${title} ${content}`.trim()
    return total + estimateTokens(textToAnalyze, model)
  }, 0)

  const messagesTokens = selectedMessages.reduce((total, msg) => {
    // Safely handle potentially undefined/null message content
    return total + estimateTokens(msg.content || '', model)
  }, 0)

  const prdTokens = currentPRD ? estimateTokens(currentPRD, model) : 0

  const totalTokens = categorizedTokens + messagesTokens + prdTokens
  const limitTokens = Math.floor(contextWindow * (contextSettings.tokenLimitPercentage / UsageThreshold.MAXIMUM))
  const percentageUsed = (totalTokens / limitTokens) * UsageThreshold.MAXIMUM
  
  // Also calculate percentage against actual model window (useful for warnings)
  const modelWindowPercentage = (totalTokens / contextWindow) * UsageThreshold.MAXIMUM

  return {
    categorizedTokens,
    messagesTokens,
    prdTokens,
    totalTokens,
    limitTokens,
    percentageUsed,
    modelContextWindow: contextWindow,
    modelWindowPercentage
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
        categoryScores[categoryKey].score += exactMatches * CALCULATION_WEIGHTS.EXACT_MATCH_MULTIPLIER
        categoryScores[categoryKey].matches.push(keyword)
        
        // Additional weight for matches in title vs content
        if (title.toLowerCase().includes(keywordLower)) {
          categoryScores[categoryKey].weightedScore += exactMatches * CALCULATION_WEIGHTS.TITLE_MATCH_BONUS
        } else {
          categoryScores[categoryKey].weightedScore += exactMatches
        }
      } else if (partialMatches > 0 && !exactMatches) {
        categoryScores[categoryKey].score += CALCULATION_WEIGHTS.PARTIAL_MATCH_WEIGHT
        categoryScores[categoryKey].matches.push(keyword)
        categoryScores[categoryKey].weightedScore += CALCULATION_WEIGHTS.PARTIAL_WEIGHTED_SCORE
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
    confidence = Math.min(Math.round((keywordDensity + scoreRatio) * CATEGORY_SUGGESTION_WEIGHTS.CONFIDENCE_BASE_MULTIPLIER), UsageThreshold.MAXIMUM)
    
    // Boost confidence for strong title matches
    if (title.toLowerCase().split(/\s+/).some(word => 
      matches.some(match => word.includes(match.toLowerCase()))
    )) {
      confidence = Math.min(confidence + CATEGORY_SUGGESTION_WEIGHTS.TITLE_MATCH_CONFIDENCE_BONUS, UsageThreshold.MAXIMUM)
    }
    
    // Ensure minimum confidence for any matches
    confidence = Math.max(confidence, ConfidenceThreshold.MINIMUM)
  }

  return {
    suggested: topScore > 0 ? suggested : 'custom',
    confidence,
    reasons: matches.slice(0, CATEGORY_SUGGESTION_WEIGHTS.MAX_KEYWORD_REASONS)
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
  const isMismatch = suggestion.confidence > ConfidenceThreshold.MISMATCH_DETECTION && 
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
    
    if (usage.percentageUsed > UsageThreshold.MAXIMUM) {
      errors.push(`Context exceeds token limit: ${usage.totalTokens} / ${usage.limitTokens} tokens (${Math.round(usage.percentageUsed)}%)`)
    } else if (usage.percentageUsed > UsageThreshold.CRITICAL) {
      errors.push(`Context is critically close to token limit: ${Math.round(usage.percentageUsed)}% used`)
    } else if (usage.percentageUsed > UsageThreshold.APPROACHING) {
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
      if (tokens > TokenSizeLimits.ERROR) {
        errors.push(`Context item "${item.title}" is extremely large (${tokens} tokens) and may cause issues`)
      } else if (tokens > TokenSizeLimits.WARNING) {
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
        
        if (mismatch.confidence > ConfidenceThreshold.HIGH) {
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
 * Format context window size for display (e.g., "200K", "1M", "128K")
 */
export function formatContextWindow(tokens: number): string {
  if (!tokens || tokens === 0) return 'Unknown'
  
  if (tokens >= VALIDATION_LIMITS.CONTEXT_WINDOW_DIVISOR * VALIDATION_LIMITS.CONTEXT_WINDOW_DIVISOR) {
    const millions = tokens / (VALIDATION_LIMITS.CONTEXT_WINDOW_DIVISOR * VALIDATION_LIMITS.CONTEXT_WINDOW_DIVISOR)
    return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1)}M`
  } else if (tokens >= VALIDATION_LIMITS.CONTEXT_WINDOW_DIVISOR) {
    const thousands = tokens / VALIDATION_LIMITS.CONTEXT_WINDOW_DIVISOR
    return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(0)}K`
  } else {
    return tokens.toString()
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