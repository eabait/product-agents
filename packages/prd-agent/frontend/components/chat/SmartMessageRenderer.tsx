'use client';

import { useState, useCallback } from 'react';
import { MarkdownMessage } from './MarkdownMessage';
import { PRDEditor, PRD } from './PRDEditor';
import { ContextExtractor } from '../context';

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

  const [showContextExtractor, setShowContextExtractor] = useState(false);

  const handlePRDChange = useCallback((updatedPRD: PRD) => {
    setLocalPRD(updatedPRD);
    onPRDUpdate?.(messageId, updatedPRD);
  }, [messageId, onPRDUpdate]);

  // If we have a valid PRD, render the editor with context extractor
  if (localPRD) {
    return (
      <div>
        <PRDEditor 
          prd={localPRD} 
          onChange={handlePRDChange}
        />
        <div className="mt-4 pt-4 border-t">
          <button
            onClick={() => setShowContextExtractor(true)}
            className="text-sm text-blue-600 hover:text-blue-800 underline flex items-center gap-2"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 14a1 1 0 0 1-.78-1.63L9.44 6H4a1 1 0 1 1 0-2h8a1 1 0 0 1 .78 1.63L6.56 12H12a1 1 0 1 1 0 2H4zM16 10a1 1 0 0 1 .78 1.63L10.56 18H16a1 1 0 1 1 0 2H8a1 1 0 0 1-.78-1.63L13.44 12H8a1 1 0 1 1 0-2h8z"/>
            </svg>
            Extract context from this PRD
          </button>
        </div>
        <ContextExtractor 
          isOpen={showContextExtractor}
          onClose={() => setShowContextExtractor(false)}
          prdContent={content}
        />
      </div>
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