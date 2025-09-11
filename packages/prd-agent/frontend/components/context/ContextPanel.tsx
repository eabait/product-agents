'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { 
  Plus, 
  Search, 
  Filter, 
  FileText,
  AlertCircle,
  CheckSquare,
  XSquare
} from 'lucide-react'
import { 
  CategorizedContextItem, 
  ContextCategory, 
  ContextPriority,
  CONTEXT_CATEGORY_LABELS
} from '@/lib/context-types'
import { contextStorage } from '@/lib/context-storage'
import { buildEnhancedContextPayload, calculateContextUsage } from '@/lib/context-utils'
import { ContextUsage } from '@/lib/context-types'
import { ContextItem } from './ContextItem'
import { ContextForm } from './ContextForm'

// UI Layout Constants
const CONTEXT_PANEL_WIDTH = 'w-96'
const EMPTY_STATE_ICON_SIZE = 'h-8 w-8'

// Token Usage Thresholds
const TOKEN_USAGE_WARNING_THRESHOLD = 70
const TOKEN_USAGE_CRITICAL_THRESHOLD = 90

// Display Constants
const MAX_PERCENTAGE = 100
const CONTEXT_WINDOW_DIVISOR = 1000
const SINGULAR_ITEM_COUNT = 1

interface ContextPanelProps {
  isOpen: boolean
  onClose: () => void
}

export function ContextPanel({ isOpen, onClose }: ContextPanelProps) {
  const [contextItems, setContextItems] = useState<CategorizedContextItem[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<ContextCategory | 'all'>('all')
  const [selectedPriority, setSelectedPriority] = useState<ContextPriority | 'all'>('all')
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState<CategorizedContextItem | null>(null)
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)

  // Load context items on mount and when panel opens
  useEffect(() => {
    if (isOpen) {
      loadContextItems()
    }
  }, [isOpen])

  const loadContextItems = () => {
    const items = contextStorage.getCategorizedContext()
    setContextItems(items)
    updateContextUsage()
  }

  const updateContextUsage = () => {
    try {
      // Build context payload to calculate current usage
      const contextPayload = buildEnhancedContextPayload([], undefined)
      const usage = calculateContextUsage(contextPayload, undefined, undefined)
      setContextUsage(usage)
    } catch (error) {
      console.error('Error calculating context usage:', error)
      setContextUsage(null)
    }
  }

  const filteredItems = contextItems.filter(item => {
    const matchesSearch = !searchQuery || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
    
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
    const matchesPriority = selectedPriority === 'all' || item.priority === selectedPriority
    
    return matchesSearch && matchesCategory && matchesPriority
  })

  const activeItems = contextItems.filter(item => item.isActive)

  const handleCreateItem = () => {
    setEditingItem(null)
    setShowForm(true)
  }

  const handleEditItem = (item: CategorizedContextItem) => {
    setEditingItem(item)
    setShowForm(true)
  }

  const handleDeleteItem = (id: string) => {
    contextStorage.deleteContextItem(id)
    loadContextItems()
  }

  const handleToggleActive = (id: string) => {
    contextStorage.toggleContextItemActive(id)
    loadContextItems()
  }

  const handleUpdateCategory = (id: string, newCategory: ContextCategory) => {
    contextStorage.updateContextItemCategory(id, newCategory)
    loadContextItems()
  }

  const handleFormSubmit = (item: Omit<CategorizedContextItem, 'id' | 'createdAt' | 'lastUsed'>) => {
    if (editingItem) {
      contextStorage.updateContextItem(editingItem.id, item)
    } else {
      contextStorage.addContextItem(item)
    }
    loadContextItems()
    setShowForm(false)
    setEditingItem(null)
  }


  const handleSelectAll = () => {
    filteredItems.forEach(item => {
      if (!item.isActive) {
        contextStorage.toggleContextItemActive(item.id)
      }
    })
    loadContextItems()
  }

  const handleClearAll = () => {
    contextItems.forEach(item => {
      if (item.isActive) {
        contextStorage.toggleContextItemActive(item.id)
      }
    })
    loadContextItems()
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className={`${CONTEXT_PANEL_WIDTH} p-0 overflow-hidden`}>
        <div className="flex flex-col h-full">
          <SheetHeader className="p-4 border-b">
            <SheetTitle>Context Management</SheetTitle>
            
            {/* Active context summary */}
            {activeItems.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                <span>{activeItems.length} context item{activeItems.length !== SINGULAR_ITEM_COUNT ? 's' : ''} active</span>
              </div>
            )}
            
            {/* Context usage visualization */}
            {contextUsage && contextUsage.totalTokens > 0 && (
              <div className="mt-3 p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Token Usage</span>
                  <span className={`text-sm font-medium ${
                    contextUsage.percentageUsed > TOKEN_USAGE_CRITICAL_THRESHOLD ? 'text-red-600' : 
                    contextUsage.percentageUsed > TOKEN_USAGE_WARNING_THRESHOLD ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    {Math.round(contextUsage.percentageUsed)}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 mb-2">
                  <div 
                    className={`h-2 rounded-full transition-all duration-300 ${
                      contextUsage.percentageUsed > TOKEN_USAGE_CRITICAL_THRESHOLD ? 'bg-red-500' : 
                      contextUsage.percentageUsed > TOKEN_USAGE_WARNING_THRESHOLD ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(contextUsage.percentageUsed, MAX_PERCENTAGE)}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground">
                  {contextUsage.totalTokens.toLocaleString()} / {contextUsage.limitTokens.toLocaleString()} tokens
                  {contextUsage.modelContextWindow && (
                    <span className="ml-1">
                      ({((contextUsage.modelContextWindow / CONTEXT_WINDOW_DIVISOR)).toFixed(0)}K window)
                    </span>
                  )}
                </div>
              </div>
            )}
          </SheetHeader>

          {/* Controls */}
          <div className="p-4 border-b space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search context..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <Select className='flex-1' value={selectedCategory} onValueChange={(value: ContextCategory | 'all') => setSelectedCategory(value)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {Object.entries(CONTEXT_CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select className='flex-1' value={selectedPriority} onValueChange={(value: ContextPriority | 'all') => setSelectedPriority(value)}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Filter by priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button onClick={handleCreateItem} size="sm" className="flex-1">
                <Plus className="h-4 w-4 mr-2" />
                Add Context
              </Button>
            </div>

            {/* Bulk operations */}
            {filteredItems.length > 0 && (
              <div className="flex gap-2 text-sm">
                <Button onClick={handleSelectAll} variant="outline" size="sm" className="flex-1 text-green-600 border-green-200 hover:bg-green-50">
                  <CheckSquare className="h-4 w-4 mr-2" />
                  Select All
                </Button>
                <Button onClick={handleClearAll} variant="outline" size="sm" className="flex-1 text-red-600 border-red-200 hover:bg-red-50">
                  <XSquare className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              </div>
            )}
          </div>

          {/* Context items list */}
          <div className="flex-1 overflow-auto p-4">
            {filteredItems.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchQuery || selectedCategory !== 'all' || selectedPriority !== 'all' ? (
                  <div>
                    <Filter className={`${EMPTY_STATE_ICON_SIZE} mx-auto mb-2 opacity-50`} />
                    <p>No context items match your filters</p>
                  </div>
                ) : (
                  <div>
                    <FileText className={`${EMPTY_STATE_ICON_SIZE} mx-auto mb-2 opacity-50`} />
                    <p>No context items yet</p>
                    <Button onClick={handleCreateItem} variant="outline" size="sm" className="mt-2">
                      <Plus className="h-4 w-4 mr-2" />
                      Create your first context item
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredItems.map(item => (
                  <ContextItem
                    key={item.id}
                    item={item}
                    onEdit={handleEditItem}
                    onDelete={handleDeleteItem}
                    onToggleActive={handleToggleActive}
                    onUpdateCategory={handleUpdateCategory}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Context Form Modal */}
        <ContextForm
          isOpen={showForm}
          onClose={() => {
            setShowForm(false)
            setEditingItem(null)
          }}
          onSubmit={handleFormSubmit}
          editingItem={editingItem}
        />

      </SheetContent>
    </Sheet>
  )
}