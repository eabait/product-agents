'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Plus, X, Zap, RefreshCw } from 'lucide-react';
import { KeyFeaturesSection as KeyFeaturesSectionType } from '@/lib/prd-schema';
import { getConfidenceBadgeText, getConfidenceBadgeClasses, type ConfidenceValue } from '@/lib/confidence-display';

interface KeyFeaturesSectionProps {
  section?: KeyFeaturesSectionType;
  // eslint-disable-next-line no-unused-vars
  onChange: (updatedSection: KeyFeaturesSectionType) => void;
  onRegenerate?: () => void;
  readOnly?: boolean;
  confidence?: number;
  isRegenerating?: boolean;
}

export function KeyFeaturesSection({ 
  section, 
  onChange, 
  onRegenerate, 
  readOnly = false, 
  confidence,
  isRegenerating = false 
}: KeyFeaturesSectionProps) {
  // eslint-disable-next-line no-unused-vars
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  const keyFeatures = section?.keyFeatures || [];

  const updateKeyFeature = useCallback((index: number, value: string) => {
    const updated = [...keyFeatures];
    updated[index] = value;
    onChange({ keyFeatures: updated });
  }, [keyFeatures, onChange]);

  const addKeyFeature = useCallback(() => {
    const updated = [...keyFeatures, ''];
    onChange({ keyFeatures: updated });
    setEditingIndex(updated.length - 1);
  }, [keyFeatures, onChange]);

  const removeKeyFeature = useCallback((index: number) => {
    const updated = keyFeatures.filter((_, i) => i !== index);
    onChange({ keyFeatures: updated });
  }, [keyFeatures, onChange]);

  const renderHeader = () => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Key Features</h3>
        {confidence !== undefined && (
          <span className={getConfidenceBadgeClasses(confidence as ConfidenceValue)}>
            {getConfidenceBadgeText(confidence as ConfidenceValue)}
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

  const renderKeyFeatures = () => (
    <div className="space-y-3">
      {keyFeatures.map((feature, index) => (
        <div key={index} className="flex gap-2">
          {readOnly ? (
            <div className="flex-1 p-3 bg-muted rounded-md text-sm">
              <div className="flex items-start gap-2">
                <span className="text-xs font-mono text-muted-foreground mt-0.5 min-w-[20px]">
                  {index + 1}.
                </span>
                <div>{feature || `Key Feature ${index + 1}`}</div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center">
                <span className="text-xs font-mono text-muted-foreground min-w-[20px] text-center">
                  {index + 1}.
                </span>
              </div>
              <Input
                value={feature}
                onChange={(e) => updateKeyFeature(index, e.target.value)}
                placeholder={`Key feature ${index + 1} - describe functionality and user benefit`}
                className="flex-1"
                onFocus={() => setEditingIndex(index)}
                onBlur={() => setEditingIndex(null)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeKeyFeature(index)}
                className="px-2"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      ))}
      
      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={addKeyFeature}
          className="w-full mt-3"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Key Feature
        </Button>
      )}
      
      {keyFeatures.length === 0 && !readOnly && (
        <div className="text-sm text-muted-foreground italic p-4 text-center border-2 border-dashed border-muted rounded-lg">
          No key features defined. Click &quot;Add Key Feature&quot; to specify the core functionality.
        </div>
      )}
    </div>
  );

  if (!section && readOnly) {
    return null;
  }

  return (
    <Card className="p-6">
      {renderHeader()}
      {renderKeyFeatures()}
      
      {/* Help text */}
      {!readOnly && (
        <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-xs text-purple-800">
            <strong>Tip:</strong> Focus on user-facing functionality, not technical implementation. 
            Example: &quot;Real-time collaboration: Multiple team members can edit documents simultaneously with live cursors&quot;
          </p>
        </div>
      )}
    </Card>
  );
}