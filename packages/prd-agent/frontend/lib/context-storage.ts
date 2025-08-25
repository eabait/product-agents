'use client'

import { 
  CategorizedContextItem, 
  ContextSettings, 
  SelectedMessage, 
  DEFAULT_CONTEXT_SETTINGS,
  ContextCategory 
} from './context-types'

const STORAGE_KEYS = {
  CATEGORIZED_CONTEXT: 'prd-agent-categorized-context',
  CONTEXT_SETTINGS: 'prd-agent-context-settings',
  SELECTED_MESSAGES: 'prd-agent-selected-messages'
} as const

class ContextStorage {
  // Categorized Context CRUD Operations
  getCategorizedContext(): CategorizedContextItem[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CATEGORIZED_CONTEXT)
      if (!stored) return []
      
      const parsed = JSON.parse(stored)
      return parsed.map((item: any) => ({
        ...item,
        createdAt: new Date(item.createdAt),
        lastUsed: new Date(item.lastUsed)
      }))
    } catch (error) {
      console.error('Error loading categorized context:', error)
      return []
    }
  }

  saveCategorizedContext(context: CategorizedContextItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CATEGORIZED_CONTEXT, JSON.stringify(context))
    } catch (error) {
      console.error('Error saving categorized context:', error)
    }
  }

  addContextItem(item: Omit<CategorizedContextItem, 'id' | 'createdAt' | 'lastUsed'>): CategorizedContextItem {
    const newItem: CategorizedContextItem = {
      ...item,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      lastUsed: new Date()
    }

    const context = this.getCategorizedContext()
    context.push(newItem)
    this.saveCategorizedContext(context)
    
    return newItem
  }

  updateContextItem(id: string, updates: Partial<CategorizedContextItem>): CategorizedContextItem | null {
    const context = this.getCategorizedContext()
    const itemIndex = context.findIndex(item => item.id === id)
    
    if (itemIndex === -1) return null
    
    const updatedItem = {
      ...context[itemIndex],
      ...updates,
      lastUsed: new Date()
    }
    
    context[itemIndex] = updatedItem
    this.saveCategorizedContext(context)
    
    return updatedItem
  }

  deleteContextItem(id: string): boolean {
    const context = this.getCategorizedContext()
    const filteredContext = context.filter(item => item.id !== id)
    
    if (filteredContext.length === context.length) return false
    
    this.saveCategorizedContext(filteredContext)
    return true
  }

  getActiveContextItems(): CategorizedContextItem[] {
    return this.getCategorizedContext().filter(item => item.isActive)
  }

  getContextItemsByCategory(category: ContextCategory): CategorizedContextItem[] {
    return this.getCategorizedContext().filter(item => item.category === category)
  }

  toggleContextItemActive(id: string): CategorizedContextItem | null {
    const context = this.getCategorizedContext()
    const item = context.find(item => item.id === id)
    
    if (!item) return null
    
    return this.updateContextItem(id, { isActive: !item.isActive })
  }

  updateContextItemCategory(id: string, newCategory: ContextCategory): CategorizedContextItem | null {
    return this.updateContextItem(id, { category: newCategory })
  }

  // Context Settings
  getContextSettings(): ContextSettings {
    try {
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
      localStorage.setItem(STORAGE_KEYS.CONTEXT_SETTINGS, JSON.stringify(settings))
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
      localStorage.setItem(STORAGE_KEYS.SELECTED_MESSAGES, JSON.stringify(messages))
    } catch (error) {
      console.error('Error saving selected messages:', error)
    }
  }

  toggleMessageSelection(messageId: string): boolean {
    const selectedMessages = this.getSelectedMessages()
    const messageIndex = selectedMessages.findIndex(msg => msg.id === messageId)
    
    if (messageIndex === -1) return false
    
    selectedMessages[messageIndex].isSelected = !selectedMessages[messageIndex].isSelected
    this.saveSelectedMessages(selectedMessages)
    
    return selectedMessages[messageIndex].isSelected
  }

  addSelectableMessage(message: Omit<SelectedMessage, 'isSelected'>): SelectedMessage {
    const selectedMessages = this.getSelectedMessages()
    const existingIndex = selectedMessages.findIndex(msg => msg.id === message.id)
    
    const selectableMessage: SelectedMessage = {
      ...message,
      isSelected: false
    }
    
    if (existingIndex === -1) {
      selectedMessages.push(selectableMessage)
    } else {
      selectedMessages[existingIndex] = { ...selectedMessages[existingIndex], ...selectableMessage }
    }
    
    this.saveSelectedMessages(selectedMessages)
    return selectableMessage
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