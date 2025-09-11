'use client'

import { useState, useEffect, useMemo } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AlertCircle, BarChart3, CheckCircle } from 'lucide-react'
import { calculateContextUsage, buildEnhancedContextPayload, formatContextWindow } from '@/lib/context-utils'
import { ContextUsage } from '@/lib/context-types'
import { useModelContext, useContextSettings } from '@/contexts/AppStateProvider'

interface ContextUsageIndicatorProps {
  currentMessages?: any[]
  currentPRD?: string
  className?: string
}

export function ContextUsageIndicator(props: ContextUsageIndicatorProps) {
  const { 
    currentMessages = [], 
    currentPRD,
    className = ""
  } = props
  
  // Get reactive context data
  const { currentModelContextWindow } = useModelContext()
  const { contextSettings } = useContextSettings()
  const [contextUsage, setContextUsage] = useState<ContextUsage | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  
  // Calculate context usage whenever inputs change
  useEffect(() => {
    let isMounted = true
    
    const calculateUsage = async () => {
      if (!isMounted) return
      
      setIsLoading(true)
      
      try {
        // Build enhanced context payload
        const contextPayload = buildEnhancedContextPayload(
          currentMessages,
          currentPRD,
          undefined // No need to pass model since contextSettings will be used
        )
        
        // Calculate usage with model-specific context window
        const usage = calculateContextUsage(
          contextPayload,
          currentModelContextWindow,
          undefined // Model info not needed for token estimation in this case
        )
        
        if (isMounted) {
          setContextUsage(usage)
        }
      } catch (error) {
        console.error('Error calculating context usage:', error)
        if (isMounted) {
          setContextUsage(null)
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }
    
    calculateUsage()
    
    return () => {
      isMounted = false
    }
  }, [currentMessages, currentPRD, currentModelContextWindow, contextSettings])
  
  // Memoized display values
  const displayData = useMemo(() => {
    if (!contextUsage) return null
    
    const { totalTokens, limitTokens, percentageUsed, modelContextWindow: usageModelContextWindow, modelWindowPercentage } = contextUsage
    
    // This is the main percentage that should be displayed: used tokens / allowed tokens
    const contextUsagePercentage = Math.min(Math.round(percentageUsed), 100)
    
    // This is the percentage against the total model window (for reference)
    const modelWindowUsagePercentage = modelWindowPercentage ? Math.min(Math.round(modelWindowPercentage), 100) : 0
    
    // Status colors and icons based on context usage percentage (used/allowed)
    let status: 'safe' | 'warning' | 'critical' = 'safe'
    let statusColor = 'text-green-600'
    let progressColor = 'bg-green-500'
    let StatusIcon = CheckCircle
    
    if (contextUsagePercentage >= 90) {
      status = 'critical'
      statusColor = 'text-red-600'
      progressColor = 'bg-red-500'
      StatusIcon = AlertCircle
    } else if (contextUsagePercentage >= 70) {
      status = 'warning'
      statusColor = 'text-yellow-600'
      progressColor = 'bg-yellow-500'
      StatusIcon = AlertCircle
    }
    
    return {
      totalTokens,
      limitTokens,
      contextUsagePercentage,
      modelWindowUsagePercentage,
      modelContextWindow: usageModelContextWindow,
      status,
      statusColor,
      progressColor,
      StatusIcon
    }
  }, [contextUsage])
  
  if (isLoading || !contextUsage || !displayData) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <BarChart3 className="h-4 w-4 text-muted-foreground" />
        <div className="text-xs text-muted-foreground">
          {isLoading ? 'Calculating...' : 'No context'}
        </div>
      </div>
    )
  }
  
  const { 
    totalTokens, 
    limitTokens, 
    contextUsagePercentage,
    modelWindowUsagePercentage,
    modelContextWindow: displayModelContextWindow,
    status, 
    statusColor, 
    progressColor, 
    StatusIcon 
  } = displayData
  
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={`flex items-center gap-2 cursor-pointer ${className}`}>
          <StatusIcon className={`h-4 w-4 ${statusColor}`} />
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-300 ${progressColor}`}
                style={{ width: `${contextUsagePercentage}%` }}
              />
            </div>
            <div className="flex flex-col items-end">
              <div className={`text-xs font-medium ${statusColor} whitespace-nowrap`}>
                {contextUsagePercentage}% used
              </div>
              <div className="text-xs text-muted-foreground whitespace-nowrap">
                {formatContextWindow(totalTokens)} of {formatContextWindow(limitTokens)} allowed
              </div>
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-sm">
        <div className="space-y-2">
          <div className="font-medium">Context Window Usage</div>
          
          {/* Current Usage Summary */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Context Used:</span>
              <span className="font-mono">{totalTokens.toLocaleString()} tokens</span>
            </div>
          </div>
          
          {/* Dual Percentage Breakdown */}
          <div className="pt-2 border-t space-y-1 text-sm">
            <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Usage Breakdown</div>
            <div className="flex justify-between">
              <span>Used vs Allowed:</span>
              <span className={`font-medium ${statusColor}`}>
                {contextUsagePercentage}% ({limitTokens.toLocaleString()} allowed)
              </span>
            </div>
            <div className="flex justify-between">
              <span>Used vs Model Window:</span>
              <span className="text-muted-foreground">
                {modelWindowUsagePercentage}% ({formatContextWindow(displayModelContextWindow || 0)} total)
              </span>
            </div>
          </div>
          
          {/* Detailed Component Breakdown */}
          {contextUsage && (
            <div className="pt-2 border-t text-xs space-y-1">
              <div className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Component Breakdown</div>
              <div className="flex justify-between">
                <span>Context Items:</span>
                <span className="font-mono">{contextUsage.categorizedTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>Messages:</span>
                <span className="font-mono">{contextUsage.messagesTokens.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span>PRD:</span>
                <span className="font-mono">{contextUsage.prdTokens.toLocaleString()}</span>
              </div>
            </div>
          )}
          
          {/* Status Messages */}
          {status === 'critical' && (
            <div className="pt-2 border-t text-xs text-red-600">
              ⚠️ Context approaching limit. Consider removing items.
            </div>
          )}
          {status === 'warning' && (
            <div className="pt-2 border-t text-xs text-yellow-600">
              ⚠️ High context usage. Monitor closely.
            </div>
          )}
          
          {/* Model Window Info */}
          <div className="pt-2 border-t text-xs text-muted-foreground">
            💡 Your token limit is set to {Math.round((limitTokens / (displayModelContextWindow || 1)) * 100)}% of the model&apos;s {formatContextWindow(displayModelContextWindow || 0)} context window.
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}