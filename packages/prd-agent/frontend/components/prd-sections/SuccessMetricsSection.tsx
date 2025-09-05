'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Plus, X, Target, RefreshCw } from 'lucide-react';
import { SuccessMetricsSection as SuccessMetricsSectionType, SuccessMetric } from '@/lib/prd-schema';

interface SuccessMetricsSectionProps {
  section?: SuccessMetricsSectionType;
  onChange: (updatedSection: SuccessMetricsSectionType) => void;
  onRegenerate?: () => void;
  readOnly?: boolean;
  confidence?: number;
  isRegenerating?: boolean;
}

export function SuccessMetricsSection({ 
  section, 
  onChange, 
  onRegenerate, 
  readOnly = false, 
  confidence,
  isRegenerating = false 
}: SuccessMetricsSectionProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  
  const successMetrics = section?.successMetrics || [];

  const updateSuccessMetric = useCallback((index: number, field: keyof SuccessMetric, value: string) => {
    const updated = [...successMetrics];
    updated[index] = { ...updated[index], [field]: value };
    onChange({ successMetrics: updated });
  }, [successMetrics, onChange]);

  const addSuccessMetric = useCallback(() => {
    const newMetric: SuccessMetric = { metric: '', target: '', timeline: '' };
    const updated = [...successMetrics, newMetric];
    onChange({ successMetrics: updated });
    setEditingIndex(updated.length - 1);
  }, [successMetrics, onChange]);

  const removeSuccessMetric = useCallback((index: number) => {
    const updated = successMetrics.filter((_, i) => i !== index);
    onChange({ successMetrics: updated });
  }, [successMetrics, onChange]);

  const renderHeader = () => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <Target className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Success Metrics</h3>
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

  const renderSuccessMetrics = () => (
    <div className="space-y-4">
      {successMetrics.map((metric, index) => (
        <div key={index} className="p-4 border rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">
              Metric {index + 1}
            </span>
            {!readOnly && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeSuccessMetric(index)}
                className="px-2"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Metric Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Metric</label>
              {readOnly ? (
                <div className="text-sm p-2 bg-muted rounded">
                  {metric.metric || 'Untitled metric'}
                </div>
              ) : (
                <Input
                  value={metric.metric}
                  onChange={(e) => updateSuccessMetric(index, 'metric', e.target.value)}
                  placeholder="Metric name"
                  onFocus={() => setEditingIndex(index)}
                  onBlur={() => setEditingIndex(null)}
                />
              )}
            </div>
            
            {/* Target */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Target</label>
              {readOnly ? (
                <div className="text-sm p-2 bg-muted rounded">
                  {metric.target || 'No target set'}
                </div>
              ) : (
                <Input
                  value={metric.target}
                  onChange={(e) => updateSuccessMetric(index, 'target', e.target.value)}
                  placeholder="Target value"
                  onFocus={() => setEditingIndex(index)}
                  onBlur={() => setEditingIndex(null)}
                />
              )}
            </div>
            
            {/* Timeline */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Timeline</label>
              {readOnly ? (
                <div className="text-sm p-2 bg-muted rounded">
                  {metric.timeline || 'No timeline set'}
                </div>
              ) : (
                <Input
                  value={metric.timeline}
                  onChange={(e) => updateSuccessMetric(index, 'timeline', e.target.value)}
                  placeholder="Timeline"
                  onFocus={() => setEditingIndex(index)}
                  onBlur={() => setEditingIndex(null)}
                />
              )}
            </div>
          </div>
        </div>
      ))}
      
      {!readOnly && (
        <Button
          variant="outline"
          size="sm"
          onClick={addSuccessMetric}
          className="w-full mt-3"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Success Metric
        </Button>
      )}
      
      {successMetrics.length === 0 && !readOnly && (
        <div className="text-sm text-muted-foreground italic p-4 text-center border-2 border-dashed border-muted rounded-lg">
          No success metrics defined. Click &quot;Add Success Metric&quot; to specify measurable goals.
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
      {renderSuccessMetrics()}
      
      {/* Help text */}
      {!readOnly && (
        <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
          <p className="text-xs text-orange-800">
            <strong>Tip:</strong> Focus on outcome metrics with specific, measurable targets. 
            Example: Metric: &quot;User retention rate&quot;, Target: &quot;80% monthly retention&quot;, Timeline: &quot;6 months post-launch&quot;
          </p>
        </div>
      )}
    </Card>
  );
}