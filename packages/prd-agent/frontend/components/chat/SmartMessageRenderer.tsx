'use client';

import { useState, useCallback } from 'react';
import { MarkdownMessage } from './MarkdownMessage';
import { PRDEditor, PRD } from './PRDEditor';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SmartMessageRendererProps {
  content: string;
  messageId: string;
  onPRDUpdate?: (messageId: string, updatedPRD: PRD) => void;
  isExpanded?: boolean;
  onToggleExpanded?: (messageId: string) => void;
}

export function SmartMessageRenderer({ content, messageId, onPRDUpdate, isExpanded = false, onToggleExpanded }: SmartMessageRendererProps) {
  const [localPRD, setLocalPRD] = useState<PRD | null>(() => {
    // Try to parse the content as PRD
    try {
      const parsed = JSON.parse(content);
      // Check if it has the PRD structure
      if (isPRDObject(parsed)) {
        return parsed;
      }
    } catch {
      // Not JSON, continue to check other formats
    }
    return null;
  });


  const handlePRDChange = useCallback((updatedPRD: PRD) => {
    setLocalPRD(updatedPRD);
    onPRDUpdate?.(messageId, updatedPRD);
  }, [messageId, onPRDUpdate]);

  // If we have a valid PRD, render the collapsible editor
  if (localPRD) {
    const handleToggle = () => {
      onToggleExpanded?.(messageId);
    };

    return (
      <Collapsible open={isExpanded} onOpenChange={handleToggle}>
        <div className="border rounded-lg bg-card">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghost"
              className="flex w-full justify-between items-center p-4 hover:bg-muted/50"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="font-medium">Product Requirements Document</span>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          
          {!isExpanded && (
            <div className="px-4 pb-4">
              <p className="text-sm text-muted-foreground line-clamp-2">
                {localPRD.problemStatement}
              </p>
            </div>
          )}
          
          <CollapsibleContent className="border-t">
            <div className="p-4">
              <PRDEditor 
                prd={localPRD} 
                onChange={handlePRDChange}
              />
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    );
  }

  // Otherwise, render as markdown
  return <MarkdownMessage content={content} />;
}

// Type guard to check if an object is a PRD
function isPRDObject(obj: any): obj is PRD {
  return (
    obj &&
    typeof obj === 'object' &&
    typeof obj.problemStatement === 'string' &&
    typeof obj.solutionOverview === 'string' &&
    Array.isArray(obj.targetUsers) &&
    Array.isArray(obj.goals) &&
    Array.isArray(obj.successMetrics) &&
    Array.isArray(obj.constraints) &&
    Array.isArray(obj.assumptions) &&
    obj.successMetrics.every((metric: any) => 
      metric && 
      typeof metric.metric === 'string' && 
      typeof metric.target === 'string' && 
      typeof metric.timeline === 'string'
    )
  );
}