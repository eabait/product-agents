'use client'

import { Message } from 'ai'
import { 
  EnhancedContextPayload, 
  ContextUsage, 
  CategorizedContextItem, 
  SelectedMessage, 
  ContextSettings,
  ContextCategory,
  CONTEXT_CATEGORY_LABELS,
  CATEGORY_KEYWORDS 
} from './context-types'
import { contextStorage } from './context-storage'

// Approximate token counting (rough estimation: 1 token ≈ 4 characters)
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// Build enhanced context payload for API requests
export function buildEnhancedContextPayload(
  messages: any[],
  currentPRD?: string
): EnhancedContextPayload {
  const categorizedContext = contextStorage.getActiveContextItems()
  const selectedMessages = contextStorage.getSelectedMessagesForContext()
  const contextSettings = contextStorage.getContextSettings()

  // Add current PRD if enabled and available
  const prdToInclude = contextSettings.autoIncludeCurrentPRD ? currentPRD : undefined

  return {
    categorizedContext,
    selectedMessages,
    currentPRD: prdToInclude,
    contextSettings
  }
}

// Calculate context token usage
export function calculateContextUsage(
  payload: EnhancedContextPayload,
  modelContextWindow: number = 128000 // Default for Claude 3.5 Sonnet
): ContextUsage {
  const { categorizedContext, selectedMessages, currentPRD, contextSettings } = payload

  // Calculate tokens for each component
  const categorizedTokens = categorizedContext.reduce((total, item) => {
    return total + estimateTokens(item.title + ' ' + item.content)
  }, 0)

  const messagesTokens = selectedMessages.reduce((total, msg) => {
    return total + estimateTokens(msg.content)
  }, 0)

  const prdTokens = currentPRD ? estimateTokens(currentPRD) : 0

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
    const contextByPriority = categorizedContext.sort((a, b) => {
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

// Extract context from PRD content (for future enhancement)
export function extractContextFromPRD(prdContent: string, category: string = 'requirement'): CategorizedContextItem[] {
  // This is a basic implementation - could be enhanced with AI parsing
  const sections = prdContent.split(/#{1,3}\s+/).filter(section => section.trim())
  
  const extractedItems: CategorizedContextItem[] = []
  
  sections.forEach((section, index) => {
    const lines = section.split('\n').filter(line => line.trim())
    if (lines.length < 2) return
    
    const title = lines[0].trim()
    const content = lines.slice(1).join('\n').trim()
    
    if (title && content && content.length > 50) { // Only meaningful content
      extractedItems.push({
        id: crypto.randomUUID(),
        title: `Extracted: ${title}`,
        content,
        category: category as any,
        priority: 'medium',
        tags: ['extracted', 'prd'],
        isActive: false,
        createdAt: new Date(),
        lastUsed: new Date()
      })
    }
  })
  
  return extractedItems
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

// Suggest category based on content analysis
export function suggestCategory(title: string, content: string): {
  suggested: ContextCategory
  confidence: number
  reasons: string[]
} {
  const text = (title + ' ' + content).toLowerCase()
  const categoryScores: Record<ContextCategory, { score: number; matches: string[] }> = {
    requirement: { score: 0, matches: [] },
    constraint: { score: 0, matches: [] },
    assumption: { score: 0, matches: [] },
    stakeholder: { score: 0, matches: [] },
    custom: { score: 0, matches: [] }
  }

  // Score each category based on keyword matches
  Object.entries(CATEGORY_KEYWORDS).forEach(([category, keywords]) => {
    keywords.forEach(keyword => {
      if (text.includes(keyword.toLowerCase())) {
        categoryScores[category as ContextCategory].score++
        categoryScores[category as ContextCategory].matches.push(keyword)
      }
    })
  })

  // Find category with highest score
  const sortedCategories = Object.entries(categoryScores)
    .sort(([,a], [,b]) => b.score - a.score)

  const topCategory = sortedCategories[0]
  const suggested = topCategory[0] as ContextCategory
  const topScore = topCategory[1].score
  const matches = topCategory[1].matches

  // Calculate confidence (0-100)
  const totalWords = text.split(/\s+/).length
  const confidence = Math.min(Math.round((topScore / Math.max(totalWords * 0.1, 1)) * 100), 100)

  return {
    suggested: topScore > 0 ? suggested : 'custom',
    confidence: topScore > 0 ? confidence : 0,
    reasons: matches.slice(0, 3) // Top 3 matching keywords
  }
}

// Check if context item might be miscategorized
export function checkCategoryMismatch(item: CategorizedContextItem): {
  isMismatch: boolean
  suggestedCategory: ContextCategory
  confidence: number
  explanation: string
} {
  const suggestion = suggestCategory(item.title, item.content)
  const isMismatch = suggestion.confidence > 60 && suggestion.suggested !== item.category

  let explanation = ''
  if (isMismatch) {
    explanation = `Contains ${suggestion.suggested} keywords: ${suggestion.reasons.join(', ')}`
  }

  return {
    isMismatch,
    suggestedCategory: suggestion.suggested,
    confidence: suggestion.confidence,
    explanation
  }
}

// Validate context payload
export function validateContextPayload(payload: EnhancedContextPayload): {
  isValid: boolean
  errors: string[]
  warnings: string[]
  misclassifications: Array<{
    item: CategorizedContextItem
    suggestedCategory: ContextCategory
    explanation: string
  }>
} {
  const errors: string[] = []
  const warnings: string[] = []
  const misclassifications: Array<{
    item: CategorizedContextItem
    suggestedCategory: ContextCategory
    explanation: string
  }> = []
  
  // Check token limits
  const usage = calculateContextUsage(payload)
  
  if (usage.percentageUsed > 100) {
    errors.push(`Context exceeds token limit: ${usage.totalTokens} / ${usage.limitTokens} tokens`)
  } else if (usage.percentageUsed > 80) {
    warnings.push(`Context is approaching token limit: ${Math.round(usage.percentageUsed)}% used`)
  }
  
  // Check for empty context
  if (payload.categorizedContext.length === 0 && 
      payload.selectedMessages.length === 0 && 
      !payload.currentPRD) {
    warnings.push('No context items are currently active')
  }
  
  // Check for very large individual items
  payload.categorizedContext.forEach(item => {
    const tokens = estimateTokens(item.content)
    if (tokens > 1000) {
      warnings.push(`Context item "${item.title}" is very large (${tokens} tokens)`)
    }
  })

  // Check for potential misclassifications
  payload.categorizedContext.forEach(item => {
    const mismatch = checkCategoryMismatch(item)
    if (mismatch.isMismatch) {
      misclassifications.push({
        item,
        suggestedCategory: mismatch.suggestedCategory,
        explanation: mismatch.explanation
      })
      warnings.push(`"${item.title}" may be miscategorized - ${mismatch.explanation}`)
    }
  })
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    misclassifications
  }
}