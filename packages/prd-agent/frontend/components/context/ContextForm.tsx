'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { X, Plus } from 'lucide-react'
import { 
  CategorizedContextItem, 
  ContextCategory, 
  ContextPriority,
  CONTEXT_CATEGORY_LABELS,
  CONTEXT_CATEGORY_DESCRIPTIONS
} from '@/lib/context-types'
import { estimateTokens, suggestCategory } from '@/lib/context-utils'

interface ContextFormProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (item: Omit<CategorizedContextItem, 'id' | 'createdAt' | 'lastUsed'>) => void
  editingItem?: CategorizedContextItem | null
}

export function ContextForm({ isOpen, onClose, onSubmit, editingItem }: ContextFormProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState<ContextCategory>('requirement')
  const [priority, setPriority] = useState<ContextPriority>('medium')
  const [tags, setTags] = useState<string[]>([])
  const [newTag, setNewTag] = useState('')
  const [isActive, setIsActive] = useState(false)

  // Reset form when opening/closing or editing different item
  useEffect(() => {
    if (isOpen && editingItem) {
      setTitle(editingItem.title)
      setContent(editingItem.content)
      setCategory(editingItem.category)
      setPriority(editingItem.priority)
      setTags([...editingItem.tags])
      setIsActive(editingItem.isActive)
    } else if (isOpen && !editingItem) {
      // Reset for new item
      setTitle('')
      setContent('')
      setCategory('requirement')
      setPriority('medium')
      setTags([])
      setIsActive(false)
    }
  }, [isOpen, editingItem])

  const tokenCount = estimateTokens(title + ' ' + content)
  
  // Get category suggestion based on content
  const suggestion = title || content ? suggestCategory(title, content) : null
  const showSuggestion = suggestion && suggestion.confidence > 40 && suggestion.suggested !== category

  const handleAddTag = () => {
    const trimmedTag = newTag.trim().toLowerCase()
    if (trimmedTag && !tags.includes(trimmedTag) && tags.length < 10) {
      setTags([...tags, trimmedTag])
      setNewTag('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove))
  }

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) return

    onSubmit({
      title: title.trim(),
      content: content.trim(),
      category,
      priority,
      tags,
      isActive
    })
  }

  const isValid = title.trim().length > 0 && content.trim().length > 0

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {editingItem ? 'Edit Context Item' : 'Add Context Item'}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Title <span className="text-red-500">*</span>
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief title for this context item"
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {title.length}/100 characters
            </p>
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Content <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Detailed context information..."
              className="min-h-[120px]"
              maxLength={2000}
            />
            <div className="flex justify-between items-center mt-1">
              <p className="text-xs text-muted-foreground">
                {content.length}/2000 characters
              </p>
              <Badge variant="outline" className="text-xs">
                ~{tokenCount} tokens
              </Badge>
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium mb-2">Category</label>
            
            {/* Category suggestion */}
            {showSuggestion && (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900 mb-1">
                      💡 Suggested: {CONTEXT_CATEGORY_LABELS[suggestion.suggested]}
                    </p>
                    <p className="text-xs text-blue-700">
                      Detected keywords: {suggestion.reasons.join(', ')} ({suggestion.confidence}% confidence)
                    </p>
                  </div>
                  <Button
                    onClick={() => setCategory(suggestion.suggested)}
                    variant="outline"
                    size="sm"
                    className="ml-2 text-blue-700 border-blue-300 hover:bg-blue-100"
                  >
                    Use This
                  </Button>
                </div>
              </div>
            )}
            
            <Select value={category} onValueChange={(value: ContextCategory) => setCategory(value)}>
              <SelectTrigger>
                <SelectValue placeholder="Select category">
                  {CONTEXT_CATEGORY_LABELS[category]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CONTEXT_CATEGORY_LABELS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Each category is handled by a specific AI worker for optimal processing.
            </p>
          </div>

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium mb-2">Priority</label>
            <Select value={priority} onValueChange={(value: ContextPriority) => setPriority(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                    High Priority
                  </div>
                </SelectItem>
                <SelectItem value="medium">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-yellow-500"></div>
                    Medium Priority
                  </div>
                </SelectItem>
                <SelectItem value="low">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500"></div>
                    Low Priority
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              High priority context is included first when building prompts.
            </p>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Tags (optional)
            </label>
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add a tag..."
                  maxLength={20}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag()
                    }
                  }}
                />
                <Button 
                  onClick={handleAddTag} 
                  variant="outline" 
                  size="sm"
                  disabled={!newTag.trim() || tags.length >= 10}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tags.map(tag => (
                    <Badge 
                      key={tag} 
                      variant="secondary" 
                      className="flex items-center gap-1"
                    >
                      {tag}
                      <button
                        onClick={() => handleRemoveTag(tag)}
                        className="ml-1 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
              
              <p className="text-xs text-muted-foreground">
                Tags help organize and search context items. Maximum 10 tags.
              </p>
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="isActive" className="text-sm font-medium">
              Include in active context
            </label>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button 
              onClick={handleSubmit} 
              disabled={!isValid}
              className="flex-1"
            >
              {editingItem ? 'Update' : 'Add'} Context Item
            </Button>
            <Button onClick={onClose} variant="outline">
              Cancel
            </Button>
          </div>

          {/* Token warning */}
          {tokenCount > 500 && (
            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
              <p className="text-sm text-yellow-800">
                ⚠️ This context item is quite large ({tokenCount} tokens). 
                Consider breaking it into smaller, more focused items for better performance.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}