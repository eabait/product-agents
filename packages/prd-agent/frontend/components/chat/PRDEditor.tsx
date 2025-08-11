'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, X, Edit3 } from 'lucide-react';

export interface PRD {
  problemStatement: string;
  solutionOverview: string;
  targetUsers: string[];
  goals: string[];
  successMetrics: Array<{
    metric: string;
    target: string;
    timeline: string;
  }>;
  constraints: string[];
  assumptions: string[];
}

interface PRDEditorProps {
  prd: PRD;
  onChange: (updatedPRD: PRD) => void;
  readOnly?: boolean;
}

export function PRDEditor({ prd, onChange, readOnly = false }: PRDEditorProps) {
  const [editingField, setEditingField] = useState<string | null>(null);

  const updateField = useCallback((field: keyof PRD, value: any) => {
    const updatedPRD = { ...prd, [field]: value };
    onChange(updatedPRD);
  }, [prd, onChange]);

  const addStringArrayItem = useCallback((field: 'targetUsers' | 'goals' | 'constraints' | 'assumptions') => {
    const currentArray = prd[field] as string[];
    updateField(field, [...currentArray, '']);
    setEditingField(`${field}-${currentArray.length}`);
  }, [prd, updateField]);

  const updateStringArrayItem = useCallback((field: 'targetUsers' | 'goals' | 'constraints' | 'assumptions', index: number, value: string) => {
    const currentArray = prd[field] as string[];
    const updated = [...currentArray];
    updated[index] = value;
    updateField(field, updated);
  }, [prd, updateField]);

  const removeStringArrayItem = useCallback((field: 'targetUsers' | 'goals' | 'constraints' | 'assumptions', index: number) => {
    const currentArray = prd[field] as string[];
    const updated = currentArray.filter((_, i) => i !== index);
    updateField(field, updated);
  }, [prd, updateField]);

  const addSuccessMetric = useCallback(() => {
    const newMetric = { metric: '', target: '', timeline: '' };
    updateField('successMetrics', [...prd.successMetrics, newMetric]);
    setEditingField(`successMetrics-${prd.successMetrics.length}`);
  }, [prd.successMetrics, updateField]);

  const updateSuccessMetric = useCallback((index: number, field: 'metric' | 'target' | 'timeline', value: string) => {
    const updated = [...prd.successMetrics];
    updated[index] = { ...updated[index], [field]: value };
    updateField('successMetrics', updated);
  }, [prd.successMetrics, updateField]);

  const removeSuccessMetric = useCallback((index: number) => {
    const updated = prd.successMetrics.filter((_, i) => i !== index);
    updateField('successMetrics', updated);
  }, [prd.successMetrics, updateField]);

  const renderSection = (
    title: string,
    children: React.ReactNode,
    className?: string
  ) => (
    <Card className={`p-6 ${className || ''}`}>
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <Edit3 className="h-5 w-5" />
        {title}
      </h3>
      {children}
    </Card>
  );

  const renderTextArea = (
    field: 'problemStatement' | 'solutionOverview',
    label: string,
    placeholder: string
  ) => (
    <div className="space-y-2">
      <label className="text-sm font-medium text-muted-foreground">{label}</label>
      {readOnly ? (
        <div className="text-sm whitespace-pre-wrap p-3 bg-muted rounded-md">
          {prd[field] || placeholder}
        </div>
      ) : (
        <Textarea
          value={prd[field]}
          onChange={(e) => updateField(field, e.target.value)}
          placeholder={placeholder}
          className="min-h-[100px] resize-none"
        />
      )}
    </div>
  );

  const renderStringArraySection = (
    field: 'targetUsers' | 'goals' | 'constraints' | 'assumptions',
    title: string,
    placeholder: string,
    addButtonText: string
  ) => (
    <div className="space-y-3">
      {prd[field].map((item, index) => (
        <div key={index} className="flex gap-2">
          {readOnly ? (
            <div className="flex-1 p-2 bg-muted rounded-md text-sm">
              {item || `${title} ${index + 1}`}
            </div>
          ) : (
            <>
              <Input
                value={item}
                onChange={(e) => updateStringArrayItem(field, index, e.target.value)}
                placeholder={`${placeholder} ${index + 1}`}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeStringArrayItem(field, index)}
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
          onClick={() => addStringArrayItem(field)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          {addButtonText}
        </Button>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Problem Statement */}
      {renderSection(
        'Problem Statement',
        renderTextArea('problemStatement', 'What problem are we solving?', 'Describe the core problem this product addresses...')
      )}

      {/* Solution Overview */}
      {renderSection(
        'Solution Overview',
        renderTextArea('solutionOverview', 'How will we solve it?', 'Describe the high-level solution approach...')
      )}

      {/* Target Users */}
      {renderSection(
        'Target Users',
        renderStringArraySection('targetUsers', 'User', 'User persona', 'Add User')
      )}

      {/* Goals */}
      {renderSection(
        'Goals',
        renderStringArraySection('goals', 'Goal', 'Goal', 'Add Goal')
      )}

      {/* Success Metrics */}
      {renderSection(
        'Success Metrics',
        <div className="space-y-3">
          {prd.successMetrics.map((metric, index) => (
            <div key={index} className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 border rounded-lg">
              {readOnly ? (
                <>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Metric</div>
                    <div className="text-sm">{metric.metric || 'Untitled metric'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Target</div>
                    <div className="text-sm">{metric.target || 'No target set'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-medium text-muted-foreground">Timeline</div>
                    <div className="text-sm">{metric.timeline || 'No timeline set'}</div>
                  </div>
                </>
              ) : (
                <>
                  <Input
                    value={metric.metric}
                    onChange={(e) => updateSuccessMetric(index, 'metric', e.target.value)}
                    placeholder="Metric name"
                  />
                  <Input
                    value={metric.target}
                    onChange={(e) => updateSuccessMetric(index, 'target', e.target.value)}
                    placeholder="Target value"
                  />
                  <div className="flex gap-2">
                    <Input
                      value={metric.timeline}
                      onChange={(e) => updateSuccessMetric(index, 'timeline', e.target.value)}
                      placeholder="Timeline"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeSuccessMetric(index)}
                      className="px-2"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
          {!readOnly && (
            <Button
              variant="outline"
              size="sm"
              onClick={addSuccessMetric}
              className="w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Metric
            </Button>
          )}
        </div>
      )}

      {/* Constraints */}
      {renderSection(
        'Constraints',
        renderStringArraySection('constraints', 'Constraint', 'Constraint', 'Add Constraint')
      )}

      {/* Assumptions */}
      {renderSection(
        'Assumptions',
        renderStringArraySection('assumptions', 'Assumption', 'Assumption', 'Add Assumption')
      )}
    </div>
  );
}