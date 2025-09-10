'use client';

import { useState, useCallback } from 'react';
import { MarkdownMessage } from './MarkdownMessage';
import { PRDEditor } from './PRDEditor';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewPRD, FlattenedPRD, isNewPRD, isFlattenedPRD } from '@/lib/prd-schema';

interface SmartMessageRendererProps {
  content: string;
  messageId: string;
  onPRDUpdate?: (_messageId: string, _updatedPRD: NewPRD) => void;
  onRegenerateSection?: (_messageId: string, _sectionName: string) => void;
  isExpanded?: boolean;
  onToggleExpanded?: (_messageId: string) => void;
}

export function SmartMessageRenderer({ 
  content, 
  messageId, 
  onPRDUpdate, 
  onRegenerateSection,
  isExpanded = false, 
  onToggleExpanded 
}: SmartMessageRendererProps) {
  const [localPRD, setLocalPRD] = useState<NewPRD | FlattenedPRD | null>(() => {
    // Try to parse the content as PRD
    try {
      const parsed = JSON.parse(content);
      // Check if it has any PRD structure (new or flattened)
      if (isPRDObject(parsed)) {
        return parsed;
      }
    } catch {
      // Not JSON, continue to check other formats
    }
    return null;
  });

  const handlePRDChange = useCallback((updatedPRD: NewPRD) => {
    setLocalPRD(updatedPRD);
    onPRDUpdate?.(messageId, updatedPRD);
  }, [messageId, onPRDUpdate]);

  const handleRegenerateSection = useCallback((sectionName: string) => {
    onRegenerateSection?.(messageId, sectionName);
  }, [messageId, onRegenerateSection]);

  // If we have a valid PRD, render the collapsible editor
  if (localPRD) {
    const handleToggle = () => {
      onToggleExpanded?.(messageId);
    };

    // Get preview text from the PRD
    const previewText = getPreviewText(localPRD);

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
                {getMetadataText(localPRD) && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    {getMetadataText(localPRD)}
                  </span>
                )}
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
                {previewText}
              </p>
            </div>
          )}
          
          <CollapsibleContent className="border-t">
            <div className="p-4">
              <PRDEditor 
                prd={localPRD} 
                onChange={handlePRDChange}
                onRegenerateSection={onRegenerateSection ? handleRegenerateSection : undefined}
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

// Enhanced type guard to check if an object is a PRD (new or flattened format)
function isPRDObject(obj: any): obj is NewPRD | FlattenedPRD {
  if (!obj || typeof obj !== 'object') return false;

  // Check for new PRD structure (sections-based)
  if (isNewPRD(obj)) return true;

  // Check for flattened PRD structure
  if (isFlattenedPRD(obj)) return true;

  // Check for legacy structure patterns
  const hasLegacyFields = (
    (typeof obj.problemStatement === 'string' ||
     typeof obj.solutionOverview === 'string') &&
    (Array.isArray(obj.targetUsers) ||
     Array.isArray(obj.goals) ||
     Array.isArray(obj.successMetrics) ||
     Array.isArray(obj.constraints) ||
     Array.isArray(obj.assumptions))
  );

  // Check if it's a structured response from the backend
  const hasStructuredSections = obj.sections && typeof obj.sections === 'object';

  return hasLegacyFields || hasStructuredSections;
}

// Get preview text from PRD
function getPreviewText(prd: NewPRD | FlattenedPRD | any): string {
  // Try new format first
  if (isNewPRD(prd) && prd.sections.solution?.solutionOverview) {
    return prd.sections.solution.solutionOverview;
  }

  // Try flattened format
  if (isFlattenedPRD(prd) && prd.solutionOverview) {
    return prd.solutionOverview;
  }

  // Try legacy fields
  if (prd.problemStatement) {
    return prd.problemStatement;
  }

  if (prd.solutionOverview) {
    return prd.solutionOverview;
  }

  // Try to extract from sections if available
  if (prd.sections?.solution?.solutionOverview) {
    return prd.sections.solution.solutionOverview;
  }

  if (prd.sections?.problemStatement?.problemStatement) {
    return prd.sections.problemStatement.problemStatement;
  }

  return 'Product Requirements Document generated';
}

// Get metadata text for display
function getMetadataText(prd: NewPRD | FlattenedPRD | any): string {
  // Try new format first
  if (isNewPRD(prd) && prd.metadata) {
    const { sections_generated, total_confidence, processing_time_ms } = prd.metadata;
    
    if (total_confidence) {
      return `${Math.round(total_confidence * 100)}% confidence`;
    }
    
    if (sections_generated && sections_generated.length > 0) {
      return `${sections_generated.length} sections`;
    }
    
    if (processing_time_ms) {
      return `${processing_time_ms}ms`;
    }
  }

  // Try flattened format
  if (isFlattenedPRD(prd) && prd.metadata) {
    const { sections_generated, total_confidence } = prd.metadata;
    
    if (total_confidence) {
      return `${Math.round(total_confidence * 100)}% confidence`;
    }
    
    if (sections_generated && sections_generated.length > 0) {
      return `${sections_generated.length} sections`;
    }
  }

  return '';
}