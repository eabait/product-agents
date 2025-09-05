'use client'

import { 
  CategorizedContextItem, 
  ContextSettings, 
  SelectedMessage, 
  DEFAULT_CONTEXT_SETTINGS,
  ContextCategory,
  ContextItemId,
  MessageId,
  createContextItemId,
  createMessageId,
  validateContextItem
} from './context-types'
import {
  CacheSettings,
  RetrySettings,
  ErrorCodes
} from './ui-constants'

/**
 * Storage keys for localStorage
 */
const STORAGE_KEYS = {
  CATEGORIZED_CONTEXT: 'prd-agent-categorized-context',
  CONTEXT_SETTINGS: 'prd-agent-context-settings',
  SELECTED_MESSAGES: 'prd-agent-selected-messages'
} as const

/**
 * Custom error types for better error handling
 */
export class ContextStorageError extends Error {
  constructor(message: string, public readonly operation: string, public readonly cause?: Error) {
    super(message)
    this.name = 'ContextStorageError'
  }
}

export class StorageQuotaExceededError extends ContextStorageError {
  constructor(operation: string, cause?: Error) {
    super('Storage quota exceeded. Please remove some context items.', operation, cause)
    this.name = 'StorageQuotaExceededError'
  }
}

/**
 * Debounced operation tracking
 */
interface DebounceState {
  timer?: NodeJS.Timeout
  pendingData?: any
}

const debounceState = new Map<string, DebounceState>()

/**
 * Context storage manager with enhanced error handling and performance optimizations
 */
class ContextStorage {
  private cache = new Map<string, { data: any; timestamp: number }>()
  private readonly CACHE_TTL = CacheSettings.TTL_MS
  private readonly MAX_RETRY_ATTEMPTS = RetrySettings.MAX_ATTEMPTS  
  private readonly DEBOUNCE_DELAY = RetrySettings.DEBOUNCE_DELAY_MS

  /**
   * Retrieves categorized context items with caching
   */
  getCategorizedContext(): CategorizedContextItem[] {
    return this.getCachedOrFetch(
      STORAGE_KEYS.CATEGORIZED_CONTEXT,
      () => this.loadCategorizedContextFromStorage()
    )
  }

  /**
   * Loads categorized context from localStorage with validation and error handling
   */
  private loadCategorizedContextFromStorage(): CategorizedContextItem[] {
    try {
      // Return empty array during SSR or when localStorage is unavailable
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return []
      }
      
      const stored = localStorage.getItem(STORAGE_KEYS.CATEGORIZED_CONTEXT)
      if (!stored) return []
      
      const parsed = JSON.parse(stored)
      if (!Array.isArray(parsed)) {
        throw new ContextStorageError('Invalid data format', 'load')
      }
      
      return parsed
        .filter(this.isValidStoredContextItem)
        .map((item: any) => ({
          ...item,
          id: createContextItemId(item.id),
          createdAt: new Date(item.createdAt),
          lastUsed: new Date(item.lastUsed),
          tags: Array.isArray(item.tags) ? item.tags : []
        }))
    } catch (error) {
      if (error instanceof ContextStorageError) {
        throw error
      }
      throw new ContextStorageError(
        'Failed to load categorized context',
        'load',
        error as Error
      )
    }
  }

  /**
   * Type guard for validating stored context items
   */
  private isValidStoredContextItem(item: any): boolean {
    return (
      typeof item === 'object' &&
      item !== null &&
      typeof item.id === 'string' &&
      typeof item.title === 'string' &&
      typeof item.content === 'string' &&
      typeof item.category === 'string' &&
      typeof item.priority === 'string' &&
      typeof item.isActive === 'boolean'
    )
  }

  /**
   * Saves categorized context with retry logic and quota handling
   */
  saveCategorizedContext(context: CategorizedContextItem[]): void {
    this.saveWithRetry(
      STORAGE_KEYS.CATEGORIZED_CONTEXT,
      context,
      'save categorized context'
    )
    this.invalidateCache(STORAGE_KEYS.CATEGORIZED_CONTEXT)
  }

  /**
   * Debounced save for frequent operations
   */
  saveCategorizedContextDebounced(context: CategorizedContextItem[]): void {
    this.debouncedSave(
      STORAGE_KEYS.CATEGORIZED_CONTEXT,
      context,
      () => this.saveCategorizedContext(context)
    )
  }

  /**
   * Adds a new context item with validation
   */
  addContextItem(item: Omit<CategorizedContextItem, 'id' | 'createdAt' | 'lastUsed'>): CategorizedContextItem {
    // Validate input
    const errors = validateContextItem(item)
    if (errors.length > 0) {
      throw new ContextStorageError(`Validation failed: ${errors.join(', ')}`, 'add')
    }

    const newItem: CategorizedContextItem = {
      ...item,
      id: createContextItemId(crypto.randomUUID()),
      createdAt: new Date(),
      lastUsed: new Date(),
      tags: Array.isArray(item.tags) ? [...item.tags] : []
    }

    const context = this.getCategorizedContext()
    const updatedContext = [...context, newItem]
    this.saveCategorizedContext(updatedContext)
    
    return newItem
  }

  /**
   * Updates a context item with validation
   */
  updateContextItem(id: ContextItemId | string, updates: Partial<CategorizedContextItem>): CategorizedContextItem | null {
    const context = this.getCategorizedContext()
    const contextId = typeof id === 'string' ? createContextItemId(id) : id
    const itemIndex = context.findIndex(item => item.id === contextId)
    
    if (itemIndex === -1) {
      throw new ContextStorageError(`Context item not found: ${id}`, 'update')
    }
    
    const currentItem = context[itemIndex]
    const proposedItem = { ...currentItem, ...updates }
    
    // Validate the updated item
    const errors = validateContextItem(proposedItem)
    if (errors.length > 0) {
      throw new ContextStorageError(`Update validation failed: ${errors.join(', ')}`, 'update')
    }
    
    const updatedItem: CategorizedContextItem = {
      ...proposedItem,
      id: currentItem.id, // Preserve original ID
      createdAt: currentItem.createdAt, // Preserve creation time
      lastUsed: new Date(),
      tags: Array.isArray(proposedItem.tags) ? [...proposedItem.tags] : []
    }
    
    const updatedContext = [...context]
    updatedContext[itemIndex] = updatedItem
    this.saveCategorizedContextDebounced(updatedContext)
    
    return updatedItem
  }

  /**
   * Deletes a context item
   */
  deleteContextItem(id: ContextItemId | string): boolean {
    const context = this.getCategorizedContext()
    const contextId = typeof id === 'string' ? createContextItemId(id) : id
    const initialLength = context.length
    const filteredContext = context.filter(item => item.id !== contextId)
    
    if (filteredContext.length === initialLength) {
      return false // Item not found
    }
    
    this.saveCategorizedContext(filteredContext)
    return true
  }

  getActiveContextItems(): CategorizedContextItem[] {
    return this.getCategorizedContext().filter(item => item.isActive)
  }

  getContextItemsByCategory(category: ContextCategory): CategorizedContextItem[] {
    return this.getCategorizedContext().filter(item => item.category === category)
  }

  /**
   * Toggles the active state of a context item
   */
  toggleContextItemActive(id: ContextItemId | string): CategorizedContextItem | null {
    const context = this.getCategorizedContext()
    const contextId = typeof id === 'string' ? createContextItemId(id) : id
    const itemIndex = context.findIndex(item => item.id === contextId)
    
    if (itemIndex === -1) return null
    
    const currentItem = context[itemIndex]
    const updatedItem: CategorizedContextItem = {
      ...currentItem,
      isActive: !currentItem.isActive,
      lastUsed: new Date()
    }
    
    // Create new context array with updated item
    const updatedContext = [...context]
    updatedContext[itemIndex] = updatedItem
    
    // Use immediate save to prevent race conditions
    this.saveCategorizedContext(updatedContext)
    
    return updatedItem
  }

  /**
   * Updates the category of a context item
   */
  updateContextItemCategory(id: ContextItemId | string, newCategory: ContextCategory): CategorizedContextItem | null {
    return this.updateContextItem(id, { category: newCategory })
  }

  /**
   * Utility methods for caching, retry logic, and debouncing
   */
  private getCachedOrFetch<T>(key: string, fetcher: () => T): T {
    const cached = this.cache.get(key)
    const now = Date.now()
    
    if (cached && (now - cached.timestamp) < this.CACHE_TTL) {
      return cached.data
    }
    
    const data = fetcher()
    this.cache.set(key, { data, timestamp: now })
    return data
  }

  private invalidateCache(key: string): void {
    this.cache.delete(key)
  }

  private saveWithRetry(key: string, data: any, operation: string): void {
    // Skip saving during SSR or when localStorage is unavailable
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return
    }
    
    let attempts = 0
    
    while (attempts < this.MAX_RETRY_ATTEMPTS) {
      try {
        localStorage.setItem(key, JSON.stringify(data))
        return
      } catch (error) {
        attempts++
        
        if (this.isQuotaExceededError(error)) {
          throw new StorageQuotaExceededError(operation, error as Error)
        }
        
        if (attempts >= this.MAX_RETRY_ATTEMPTS) {
          throw new ContextStorageError(
            `Failed to ${operation} after ${attempts} attempts`,
            operation,
            error as Error
          )
        }
        
        // Brief delay before retry
        const delay = Math.pow(2, attempts) * 100
        this.sleep(delay)
      }
    }
  }

  private debouncedSave(key: string, data: any, saveFunction: () => void): void {
    const state = debounceState.get(key) || {}
    
    if (state.timer) {
      clearTimeout(state.timer)
    }
    
    state.pendingData = data
    state.timer = setTimeout(() => {
      saveFunction()
      debounceState.delete(key)
    }, this.DEBOUNCE_DELAY)
    
    debounceState.set(key, state)
  }

  private isQuotaExceededError(error: unknown): boolean {
    return error instanceof DOMException && 
           (error.code === ErrorCodes.QUOTA_EXCEEDED || error.name === 'QuotaExceededError')
  }

  private sleep(ms: number): void {
    // Simple synchronous sleep for retry delays
    const start = Date.now()
    while (Date.now() - start < ms) {
      // Busy wait
    }
  }

  // Context Settings
  getContextSettings(): ContextSettings {
    try {
      // Return defaults during SSR or when localStorage is unavailable
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return DEFAULT_CONTEXT_SETTINGS
      }
      
      const stored = localStorage.getItem(STORAGE_KEYS.CONTEXT_SETTINGS)
      if (!stored) return DEFAULT_CONTEXT_SETTINGS
      
      return { ...DEFAULT_CONTEXT_SETTINGS, ...JSON.parse(stored) }
    } catch (error) {
      console.error('Error loading context settings:', error)
      return DEFAULT_CONTEXT_SETTINGS
    }
  }

  saveContextSettings(settings: ContextSettings): void {
    try {
      // Skip saving during SSR or when localStorage is unavailable
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return
      }
      
      localStorage.setItem(STORAGE_KEYS.CONTEXT_SETTINGS, JSON.stringify(settings))
      // Emit event for reactive updates
      window.dispatchEvent(new CustomEvent('contextSettingsChanged', { 
        detail: settings 
      }))
    } catch (error) {
      console.error('Error saving context settings:', error)
    }
  }

  updateContextSettings(updates: Partial<ContextSettings>): ContextSettings {
    const currentSettings = this.getContextSettings()
    const newSettings = { ...currentSettings, ...updates }
    this.saveContextSettings(newSettings)
    return newSettings
  }

  // Selected Messages
  getSelectedMessages(): SelectedMessage[] {
    try {
      // Return empty array during SSR or when localStorage is unavailable
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return []
      }
      
      const stored = localStorage.getItem(STORAGE_KEYS.SELECTED_MESSAGES)
      if (!stored) return []
      
      const parsed = JSON.parse(stored)
      return parsed.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }))
    } catch (error) {
      console.error('Error loading selected messages:', error)
      return []
    }
  }

  saveSelectedMessages(messages: SelectedMessage[]): void {
    try {
      // Skip saving during SSR or when localStorage is unavailable
      if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
        return
      }
      
      localStorage.setItem(STORAGE_KEYS.SELECTED_MESSAGES, JSON.stringify(messages))
    } catch (error) {
      console.error('Error saving selected messages:', error)
    }
  }

  toggleMessageSelection(messageId: MessageId | string): boolean {
    const selectedMessages = this.getSelectedMessages()
    const id = typeof messageId === 'string' ? createMessageId(messageId) : messageId
    const messageIndex = selectedMessages.findIndex(msg => msg.id === id)
    
    if (messageIndex === -1) return false
    
    selectedMessages[messageIndex].isSelected = !selectedMessages[messageIndex].isSelected
    this.saveSelectedMessages(selectedMessages)
    
    return selectedMessages[messageIndex].isSelected
  }

  addSelectableMessage(message: Omit<SelectedMessage, 'isSelected'> | { id: string; content: string; role: 'user' | 'assistant'; timestamp: Date }): SelectedMessage {
    const selectedMessages = this.getSelectedMessages()
    const messageId = createMessageId(message.id as string)
    const existingIndex = selectedMessages.findIndex(msg => msg.id === messageId)
    
    const selectableMessage: SelectedMessage = {
      ...message,
      id: messageId,
      isSelected: false
    }
    
    if (existingIndex === -1) {
      selectedMessages.push(selectableMessage)
      this.saveSelectedMessages(selectedMessages)
      return selectableMessage
    } else {
      // Preserve the existing isSelected state when updating
      const updatedMessage = { 
        ...selectedMessages[existingIndex], 
        ...selectableMessage, 
        isSelected: selectedMessages[existingIndex].isSelected 
      }
      selectedMessages[existingIndex] = updatedMessage
      this.saveSelectedMessages(selectedMessages)
      return updatedMessage
    }
  }

  getSelectedMessagesForContext(): SelectedMessage[] {
    return this.getSelectedMessages().filter(msg => msg.isSelected)
  }

  clearAllSelections(): void {
    const messages = this.getSelectedMessages()
    messages.forEach(msg => msg.isSelected = false)
    this.saveSelectedMessages(messages)
  }

  // Bulk Operations
  importContextItems(items: CategorizedContextItem[]): number {
    const existing = this.getCategorizedContext()
    let imported = 0
    
    items.forEach(item => {
      const existingItem = existing.find(e => e.title === item.title && e.category === item.category)
      if (!existingItem) {
        this.addContextItem(item)
        imported++
      }
    })
    
    return imported
  }

  exportContextItems(): CategorizedContextItem[] {
    return this.getCategorizedContext()
  }

  clearAllContext(): void {
    // Skip clearing during SSR or when localStorage is unavailable
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return
    }
    
    localStorage.removeItem(STORAGE_KEYS.CATEGORIZED_CONTEXT)
    localStorage.removeItem(STORAGE_KEYS.SELECTED_MESSAGES)
  }

  // Search and Filter
  searchContextItems(query: string): CategorizedContextItem[] {
    const items = this.getCategorizedContext()
    const lowercaseQuery = query.toLowerCase()
    
    return items.filter(item => 
      item.title.toLowerCase().includes(lowercaseQuery) ||
      item.content.toLowerCase().includes(lowercaseQuery) ||
      item.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))
    )
  }
}

export const contextStorage = new ContextStorage()