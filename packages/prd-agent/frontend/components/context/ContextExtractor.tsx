'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Download, X, Plus, AlertCircle } from 'lucide-react'
import { 
  CategorizedContextItem, 
  ContextCategory,
  CONTEXT_CATEGORY_LABELS 
} from '@/lib/context-types'
import { extractContextFromPRD } from '@/lib/context-utils'
import { contextStorage } from '@/lib/context-storage'

interface ContextExtractorProps {
  isOpen: boolean
  onClose: () => void
  prdContent: string
  onExtracted?: () => void
}

export function ContextExtractor({ isOpen, onClose, prdContent, onExtracted }: ContextExtractorProps) {
  const [selectedCategory, setSelectedCategory] = useState<ContextCategory>('requirement')
  const [extractedItems, setExtractedItems] = useState<CategorizedContextItem[]>([])
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [isExtracting, setIsExtracting] = useState(false)
  const [hasExtracted, setHasExtracted] = useState(false)

  const handleExtract = () => {
    setIsExtracting(true)
    
    // Simulate extraction process (in a real app, this might call an AI service)
    setTimeout(() => {
      const extracted = extractContextFromPRD(prdContent, selectedCategory)
      setExtractedItems(extracted)
      setSelectedItems(new Set(extracted.map(item => item.id)))
      setIsExtracting(false)
      setHasExtracted(true)
    }, 1000)
  }

  const handleToggleSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId)
    } else {
      newSelected.add(itemId)
    }
    setSelectedItems(newSelected)
  }

  const handleSelectAll = () => {
    setSelectedItems(new Set(extractedItems.map(item => item.id)))
  }

  const handleSelectNone = () => {
    setSelectedItems(new Set())
  }

  const handleSaveSelected = () => {
    const itemsToSave = extractedItems.filter(item => selectedItems.has(item.id))
    
    itemsToSave.forEach(item => {
      contextStorage.addContextItem({
        title: item.title,
        content: item.content,
        category: selectedCategory, // Use the selected category
        priority: item.priority,
        tags: item.tags,
        isActive: false
      })
    })

    if (onExtracted) {
      onExtracted()
    }

    // Reset state
    setExtractedItems([])
    setSelectedItems(new Set())
    setHasExtracted(false)
    onClose()
  }

  const handleClose = () => {
    setExtractedItems([])
    setSelectedItems(new Set())
    setHasExtracted(false)
    onClose()
  }

  return (
    <Sheet open={isOpen} onOpenChange={handleClose}>
      <SheetContent side="right" className="w-96 overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Extract Context from PRD</SheetTitle>
        </SheetHeader>

        <div className="space-y-4 mt-6">
          {!hasExtracted ? (
            <>
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-medium text-blue-900">
                    Extract Reusable Context
                  </p>
                </div>
                <p className="text-sm text-blue-800">
                  This will analyze the PRD content and extract key sections that can be reused 
                  as context items for future PRD generation.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Extract as Category
                </label>
                <Select 
                  value={selectedCategory} 
                  onValueChange={(value: ContextCategory) => setSelectedCategory(value)}
                >
                  <SelectTrigger>
                    <SelectValue />
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
                  All extracted items will be categorized under this type.
                </p>
              </div>

              <div className="text-sm text-muted-foreground bg-muted p-3 rounded">
                <p className="font-medium mb-1">PRD Preview:</p>
                <p className="line-clamp-3">
                  {prdContent.substring(0, 200)}...
                </p>
              </div>

              <Button 
                onClick={handleExtract} 
                disabled={isExtracting}
                className="w-full"
              >
                {isExtracting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Extracting Context...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Extract Context Items
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium">
                  Extracted Items ({extractedItems.length})
                </h3>
                <div className="flex gap-2">
                  <Button onClick={handleSelectAll} variant="ghost" size="sm">
                    All
                  </Button>
                  <Button onClick={handleSelectNone} variant="ghost" size="sm">
                    None
                  </Button>
                </div>
              </div>

              {extractedItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No extractable context found in this PRD.</p>
                  <p className="text-xs mt-1">
                    The PRD might be too short or lack distinct sections.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {extractedItems.map(item => (
                    <div 
                      key={item.id}
                      className={`p-3 border rounded-md ${
                        selectedItems.has(item.id) ? 'border-blue-500 bg-blue-50' : 'border-border'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedItems.has(item.id)}
                          onCheckedChange={() => handleToggleSelection(item.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <p className="font-medium text-sm truncate">
                              {item.title}
                            </p>
                            <Badge variant="outline" className="text-xs">
                              {CONTEXT_CATEGORY_LABELS[selectedCategory]}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {item.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {extractedItems.length > 0 && (
                <>
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span>Selected: {selectedItems.size} of {extractedItems.length}</span>
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        onClick={handleSaveSelected}
                        disabled={selectedItems.size === 0}
                        className="flex-1"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add {selectedItems.size} to Context Library
                      </Button>
                      <Button onClick={handleClose} variant="outline">
                        Cancel
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}