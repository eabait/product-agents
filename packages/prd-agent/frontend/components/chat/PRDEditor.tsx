'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Plus, X, Edit3, Copy, Download, Check } from 'lucide-react';
import { convertPRDToText, convertPRDToMarkdown, downloadMarkdown, copyToClipboard } from '@/lib/prd-export-utils';

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
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied'>('idle');
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'exported'>('idle');

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

  const handleCopyPRD = useCallback(async () => {
    if (copyStatus !== 'idle') return;
    
    setCopyStatus('copying');
    try {
      const textContent = convertPRDToText(prd);
      const success = await copyToClipboard(textContent);
      
      if (success) {
        setCopyStatus('copied');
        setTimeout(() => setCopyStatus('idle'), 2000);
      } else {
        setCopyStatus('idle');
      }
    } catch (error) {
      console.error('Failed to copy PRD:', error);
      setCopyStatus('idle');
    }
  }, [prd, copyStatus]);

  const handleExportMarkdown = useCallback(async () => {
    if (exportStatus !== 'idle') return;
    
    setExportStatus('exporting');
    try {
      const markdownContent = convertPRDToMarkdown(prd);
      downloadMarkdown(markdownContent);
      
      setExportStatus('exported');
      setTimeout(() => setExportStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to export PRD:', error);
      setExportStatus('idle');
    }
  }, [prd, exportStatus]);

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

  // Check if PRD has any meaningful content to show the footer
  const hasContent = prd.problemStatement || prd.solutionOverview || 
                    prd.targetUsers.length > 0 || prd.goals.length > 0 || 
                    prd.successMetrics.length > 0 || prd.constraints.length > 0 || 
                    prd.assumptions.length > 0;

  const renderFooter = () => {
    if (!hasContent) return null;

    return (
      <div className="mt-8 p-4 bg-background border-t border-border">
        <div className="flex items-center justify-end gap-3 max-w-4xl">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyPRD}
            disabled={copyStatus !== 'idle'}
            className="flex items-center gap-2"
          >
            {copyStatus === 'copied' ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copyStatus === 'copying' ? 'Copying...' : copyStatus === 'copied' ? 'Copied!' : 'Copy PRD'}
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportMarkdown}
            disabled={exportStatus !== 'idle'}
            className="flex items-center gap-2"
          >
            {exportStatus === 'exported' ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {exportStatus === 'exporting' ? 'Exporting...' : exportStatus === 'exported' ? 'Exported!' : 'Export as Markdown'}
          </Button>
        </div>
      </div>
    );
  };

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

      {/* Footer with copy and export actions */}
      {renderFooter()}
    </div>
  );
}