'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  Edit3, 
  Trash2, 
  Calendar,
  Tag
} from 'lucide-react'
import { 
  CategorizedContextItem, 
  CONTEXT_CATEGORY_LABELS 
} from '@/lib/context-types'
import { estimateTokens, checkCategoryMismatch } from '@/lib/context-utils'

interface ContextItemProps {
  item: CategorizedContextItem
  // eslint-disable-next-line no-unused-vars
  onEdit: (item: CategorizedContextItem) => void
  // eslint-disable-next-line no-unused-vars
  onDelete: (id: string) => void
  // eslint-disable-next-line no-unused-vars
  onToggleActive: (id: string) => void
  // eslint-disable-next-line no-unused-vars
  onUpdateCategory?: (id: string, category: string) => void
}

export function ContextItem({ item, onEdit, onDelete, onToggleActive, onUpdateCategory }: ContextItemProps) {
  const [showFullContent, setShowFullContent] = useState(false)
  
  const categoryLabel = CONTEXT_CATEGORY_LABELS[item.category]
  const tokenCount = estimateTokens(item.title + ' ' + item.content)
  const truncatedContent = item.content.length > 150 
    ? item.content.substring(0, 150) + '...'
    : item.content
  
  // Check for potential misclassification
  const mismatch = checkCategoryMismatch(item)

  const handleQuickRecategorize = () => {
    if (mismatch.isMismatch && onUpdateCategory) {
      onUpdateCategory(item.id, mismatch.suggestedCategory)
    }
  }

  const priorityColors = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-green-100 text-green-800 border-green-200'
  }

  const categoryColors = {
    requirement: 'bg-blue-100 text-blue-800 border-blue-200',
    constraint: 'bg-orange-100 text-orange-800 border-orange-200',
    assumption: 'bg-purple-100 text-purple-800 border-purple-200',
    stakeholder: 'bg-cyan-100 text-cyan-800 border-cyan-200',
    custom: 'bg-gray-100 text-gray-800 border-gray-200'
  }

  return (
    <Card className={`${item.isActive ? 'ring-2 ring-blue-500 ring-opacity-50' : ''} transition-all`}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Checkbox
              checked={item.isActive}
              onCheckedChange={() => onToggleActive(item.id)}
              className="flex-shrink-0"
            />
            <CardTitle className="text-sm font-medium truncate flex-1">
              {item.title}
            </CardTitle>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onEdit(item)}
              className="h-6 w-6 p-0"
            >
              <Edit3 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(item.id)}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-red-600"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className={categoryColors[item.category]}>
            {categoryLabel}
          </Badge>
          <Badge className={priorityColors[item.priority]}>
            {item.priority}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {tokenCount} tokens
          </Badge>
        </div>
        
        {/* Misclassification warning */}
        {mismatch.isMismatch && (
          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="text-xs font-medium text-yellow-800">
                  ⚠️ May be miscategorized
                </p>
                <p className="text-xs text-yellow-700">
                  {mismatch.explanation}
                </p>
              </div>
              {onUpdateCategory && (
                <Button
                  onClick={handleQuickRecategorize}
                  variant="outline"
                  size="sm"
                  className="ml-2 text-yellow-700 border-yellow-300 hover:bg-yellow-100 text-xs px-2 py-1 h-auto"
                >
                  Fix → {CONTEXT_CATEGORY_LABELS[mismatch.suggestedCategory]}
                </Button>
              )}
            </div>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">
            {showFullContent ? item.content : truncatedContent}
            {item.content.length > 150 && (
              <button
                onClick={() => setShowFullContent(!showFullContent)}
                className="ml-2 text-blue-600 hover:text-blue-800 text-xs underline"
              >
                {showFullContent ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>

          {item.tags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Tag className="h-3 w-3 text-muted-foreground" />
              {item.tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs py-0">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              <span>Created {new Date(item.createdAt).toLocaleDateString()}</span>
            </div>
            {item.lastUsed.getTime() !== item.createdAt.getTime() && (
              <div className="flex items-center gap-1">
                <span>Last used {new Date(item.lastUsed).toLocaleDateString()}</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}