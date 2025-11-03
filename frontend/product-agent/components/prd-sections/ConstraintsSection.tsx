'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Plus, X, ShieldAlert, RefreshCw } from 'lucide-react';
import { ConstraintsSection as ConstraintsSectionType } from '@/lib/prd-schema';
import { getConfidenceBadgeText, getConfidenceBadgeClasses, type ConfidenceValue } from '@/lib/confidence-display';

interface ConstraintsSectionProps {
  section?: ConstraintsSectionType;
  // eslint-disable-next-line no-unused-vars
  onChange: (updatedSection: ConstraintsSectionType) => void;
  onRegenerate?: () => void;
  readOnly?: boolean;
  confidence?: number;
  isRegenerating?: boolean;
}

export function ConstraintsSection({ 
  section, 
  onChange, 
  onRegenerate, 
  readOnly = false, 
  confidence,
  isRegenerating = false 
}: ConstraintsSectionProps) {
  // eslint-disable-next-line no-unused-vars
  const [editingConstraint, setEditingConstraint] = useState<number | null>(null);
  // eslint-disable-next-line no-unused-vars
  const [editingAssumption, setEditingAssumption] = useState<number | null>(null);
  
  const constraints = section?.constraints || [];
  const assumptions = section?.assumptions || [];

  const updateConstraint = useCallback((index: number, value: string) => {
    const updated = [...constraints];
    updated[index] = value;
    onChange({ constraints: updated, assumptions });
  }, [constraints, assumptions, onChange]);

  const addConstraint = useCallback(() => {
    const updated = [...constraints, ''];
    onChange({ constraints: updated, assumptions });
    setEditingConstraint(updated.length - 1);
  }, [constraints, assumptions, onChange]);

  const removeConstraint = useCallback((index: number) => {
    const updated = constraints.filter((_, i) => i !== index);
    onChange({ constraints: updated, assumptions });
  }, [constraints, assumptions, onChange]);

  const updateAssumption = useCallback((index: number, value: string) => {
    const updated = [...assumptions];
    updated[index] = value;
    onChange({ constraints, assumptions: updated });
  }, [constraints, assumptions, onChange]);

  const addAssumption = useCallback(() => {
    const updated = [...assumptions, ''];
    onChange({ constraints, assumptions: updated });
    setEditingAssumption(updated.length - 1);
  }, [constraints, assumptions, onChange]);

  const removeAssumption = useCallback((index: number) => {
    const updated = assumptions.filter((_, i) => i !== index);
    onChange({ constraints, assumptions: updated });
  }, [constraints, assumptions, onChange]);

  const renderHeader = () => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-5 w-5" />
        <h3 className="text-lg font-semibold">Constraints & Assumptions</h3>
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

  const renderConstraints = () => (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-red-700">Constraints</h4>
      <p className="text-xs text-muted-foreground mb-3">
        Hard limitations that cannot be changed (budget, timeline, technical, legal)
      </p>
      
      {constraints.map((constraint, index) => (
        <div key={index} className="flex gap-2">
          {readOnly ? (
            <div className="flex-1 p-3 bg-red-50 border border-red-200 rounded-md text-sm">
              <div className="flex items-start gap-2">
                <span className="text-xs font-mono text-red-600 mt-0.5 min-w-[20px]">
                  {index + 1}.
                </span>
                <div>{constraint || `Constraint ${index + 1}`}</div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center">
                <span className="text-xs font-mono text-red-600 min-w-[20px] text-center">
                  {index + 1}.
                </span>
              </div>
              <Input
                value={constraint}
                onChange={(e) => updateConstraint(index, e.target.value)}
                placeholder={`Constraint ${index + 1} - describe limitations or restrictions`}
                className="flex-1 border-red-200 focus:border-red-400"
                onFocus={() => setEditingConstraint(index)}
                onBlur={() => setEditingConstraint(null)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeConstraint(index)}
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
          onClick={addConstraint}
          className="w-full border-red-200 text-red-700 hover:bg-red-50"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Constraint
        </Button>
      )}
      
      {constraints.length === 0 && (
        <div className="text-sm text-muted-foreground italic p-3 text-center border border-red-200 bg-red-50 rounded-lg">
          No constraints defined. {!readOnly && 'Click "Add Constraint" to specify limitations.'}
        </div>
      )}
    </div>
  );

  const renderAssumptions = () => (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-blue-700">Assumptions</h4>
      <p className="text-xs text-muted-foreground mb-3">
        Things we believe to be true but haven&apos;t verified (user behavior, market conditions, technical capabilities)
      </p>
      
      {assumptions.map((assumption, index) => (
        <div key={index} className="flex gap-2">
          {readOnly ? (
            <div className="flex-1 p-3 bg-blue-50 border border-blue-200 rounded-md text-sm">
              <div className="flex items-start gap-2">
                <span className="text-xs font-mono text-blue-600 mt-0.5 min-w-[20px]">
                  {index + 1}.
                </span>
                <div>{assumption || `Assumption ${index + 1}`}</div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center">
                <span className="text-xs font-mono text-blue-600 min-w-[20px] text-center">
                  {index + 1}.
                </span>
              </div>
              <Input
                value={assumption}
                onChange={(e) => updateAssumption(index, e.target.value)}
                placeholder={`Assumption ${index + 1} - describe what you believe to be true`}
                className="flex-1 border-blue-200 focus:border-blue-400"
                onFocus={() => setEditingAssumption(index)}
                onBlur={() => setEditingAssumption(null)}
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeAssumption(index)}
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
          onClick={addAssumption}
          className="w-full border-blue-200 text-blue-700 hover:bg-blue-50"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Assumption
        </Button>
      )}
      
      {assumptions.length === 0 && (
        <div className="text-sm text-muted-foreground italic p-3 text-center border border-blue-200 bg-blue-50 rounded-lg">
          No assumptions defined. {!readOnly && 'Click "Add Assumption" to specify beliefs that need validation.'}
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
      
      <div className="space-y-6">
        {renderConstraints()}
        {renderAssumptions()}
      </div>
      
      {/* Help text */}
      {!readOnly && (
        <div className="mt-4 p-3 bg-gray-50 border border-gray-200 rounded-lg">
          <p className="text-xs text-gray-800">
            <strong>Constraints:</strong> &quot;Budget cannot exceed $200K&quot;, &quot;Must integrate with existing Salesforce CRM&quot;<br/>
            <strong>Assumptions:</strong> &quot;Users are familiar with standard project management workflows&quot;, &quot;Teams will adopt new tools if they save time&quot;
          </p>
        </div>
      )}
    </Card>
  );
}