'use client';

import { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Lightbulb, RefreshCw } from 'lucide-react';
import { SolutionSection as SolutionSectionType } from '@/lib/prd-schema';

interface SolutionSectionProps {
  section?: SolutionSectionType;
  onChange: (updatedSection: SolutionSectionType) => void;
  onRegenerate?: () => void;
  readOnly?: boolean;
  confidence?: number;
  isRegenerating?: boolean;
}

export function SolutionSection({ 
  section, 
  onChange, 
  onRegenerate, 
  readOnly = false, 
  confidence,
  isRegenerating = false 
}: SolutionSectionProps) {
  
  const solutionOverview = section?.solutionOverview || '';
  const approach = section?.approach || '';

  const updateSolutionOverview = useCallback((value: string) => {
    onChange({
      solutionOverview: value,
      approach: approach
    });
  }, [approach, onChange]);

  const updateApproach = useCallback((value: string) => {
    onChange({
      solutionOverview: solutionOverview,
      approach: value
    });
  }, [solutionOverview, onChange]);

  const renderHeader = () => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Solution Overview</h3>
        {confidence !== undefined && (
          <span className="text-xs bg-muted px-2 py-1 rounded-full">
            {Math.round(confidence * 100)}% confidence
          </span>
        )}
      </div>
      {onRegenerate && !readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
          {isRegenerating ? 'Regenerating...' : 'Regenerate'}
        </Button>
      )}
    </div>
  );

  const renderSolutionOverview = () => (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">
        What are we building? (Solution Overview)
      </label>
      {readOnly ? (
        <div className="text-sm whitespace-pre-wrap p-3 bg-muted rounded-md min-h-[100px]">
          {solutionOverview || 'No solution overview provided'}
        </div>
      ) : (
        <Textarea
          value={solutionOverview}
          onChange={(e) => updateSolutionOverview(e.target.value)}
          placeholder="Describe the high-level solution approach and what you're building..."
          className="min-h-[100px] resize-none"
        />
      )}
    </div>
  );

  const renderApproach = () => (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">
        How will we build it? (Implementation Approach)
      </label>
      {readOnly ? (
        <div className="text-sm whitespace-pre-wrap p-3 bg-muted rounded-md min-h-[80px]">
          {approach || 'No implementation approach specified'}
        </div>
      ) : (
        <Textarea
          value={approach}
          onChange={(e) => updateApproach(e.target.value)}
          placeholder="Describe the strategy, methodology, or technical approach for implementation..."
          className="min-h-[80px] resize-none"
        />
      )}
    </div>
  );

  if (!section && readOnly) {
    return null;
  }

  return (
    <Card className="p-6">
      {renderHeader()}
      
      <div className="space-y-6">
        {renderSolutionOverview()}
        {renderApproach()}
      </div>
      
      {/* Help text */}
      {!readOnly && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-xs text-green-800">
            <strong>Tip:</strong> Solution Overview should focus on WHAT you&apos;re building. 
            Implementation Approach should describe HOW you plan to build it (methodology, technology choices, phased approach, etc.).
          </p>
        </div>
      )}
    </Card>
  );
}