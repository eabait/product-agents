'use client';

import { useState, useCallback } from 'react';
import { MarkdownMessage } from './MarkdownMessage';
import { PRDEditor, PRD } from './PRDEditor';

interface SmartMessageRendererProps {
  content: string;
  messageId: string;
  onPRDUpdate?: (messageId: string, updatedPRD: PRD) => void;
}

export function SmartMessageRenderer({ content, messageId, onPRDUpdate }: SmartMessageRendererProps) {
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

  // If we have a valid PRD, render the editor
  if (localPRD) {
    return (
      <PRDEditor 
        prd={localPRD} 
        onChange={handlePRDChange}
      />
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