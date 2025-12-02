'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Copy, Download, Check, Clock, Zap, AlertCircle } from 'lucide-react';
import { convertPRDToText, convertPRDToMarkdown, downloadMarkdown, copyToClipboard } from '@/lib/prd-export-utils';
import { NewPRD, FlattenedPRD, isNewPRD, isFlattenedPRD, convertToNewPRD } from '@/lib/prd-schema';
import { formatOverallConfidence, type ConfidenceValue } from '@/lib/confidence-display';

// Import new section components
import { 
  TargetUsersSection,
  SolutionSection,
  KeyFeaturesSection,
  SuccessMetricsSection,
  ConstraintsSection
} from '../prd-sections';

interface PRDEditorProps {
  prd: NewPRD | FlattenedPRD | any; // Accept any for backward compatibility during transition
  onChange: (_updatedPRD: NewPRD) => void;
  onRegenerateSection?: (_sectionName: string) => void;
  readOnly?: boolean;
  isRegenerating?: { [sectionName: string]: boolean };
}

export function PRDEditor({ 
  prd, 
  onChange, 
  onRegenerateSection, 
  readOnly = false,
  isRegenerating = {}
}: PRDEditorProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copying' | 'copied'>('idle');
  const [exportStatus, setExportStatus] = useState<'idle' | 'exporting' | 'exported'>('idle');

  // Convert input to NewPRD format
  const normalizedPRD: NewPRD = isNewPRD(prd) ? prd : 
    isFlattenedPRD(prd) ? convertToNewPRD(prd) : 
    convertToNewPRD({
      solutionOverview: prd?.solutionOverview || '',
      targetUsers: prd?.targetUsers || [],
      successMetrics: prd?.successMetrics || [],
      constraints: prd?.constraints || [],
      assumptions: prd?.assumptions || []
    } as FlattenedPRD);

  // Section update handlers
  const updateTargetUsers = useCallback((updatedSection) => {
    onChange({
      ...normalizedPRD,
      sections: {
        ...normalizedPRD.sections,
        targetUsers: updatedSection
      }
    });
  }, [normalizedPRD, onChange]);

  const updateSolution = useCallback((updatedSection) => {
    onChange({
      ...normalizedPRD,
      sections: {
        ...normalizedPRD.sections,
        solution: updatedSection
      }
    });
  }, [normalizedPRD, onChange]);

  const updateKeyFeatures = useCallback((updatedSection) => {
    onChange({
      ...normalizedPRD,
      sections: {
        ...normalizedPRD.sections,
        keyFeatures: updatedSection
      }
    });
  }, [normalizedPRD, onChange]);

  const updateSuccessMetrics = useCallback((updatedSection) => {
    onChange({
      ...normalizedPRD,
      sections: {
        ...normalizedPRD.sections,
        successMetrics: updatedSection
      }
    });
  }, [normalizedPRD, onChange]);

  const updateConstraints = useCallback((updatedSection) => {
    onChange({
      ...normalizedPRD,
      sections: {
        ...normalizedPRD.sections,
        constraints: updatedSection
      }
    });
  }, [normalizedPRD, onChange]);

  // Export handlers (using flattened format for compatibility)
  const handleCopyPRD = useCallback(async () => {
    if (copyStatus !== 'idle') return;
    
    setCopyStatus('copying');
    try {
      // Convert to flattened format for export
      const flatPRD: FlattenedPRD = {
        solutionOverview: normalizedPRD.sections.solution?.solutionOverview || '',
        targetUsers: normalizedPRD.sections.targetUsers?.targetUsers || [],
        goals: normalizedPRD.sections.keyFeatures?.keyFeatures || [],
        successMetrics: normalizedPRD.sections.successMetrics?.successMetrics || [],
        constraints: normalizedPRD.sections.constraints?.constraints || [],
        assumptions: normalizedPRD.sections.constraints?.assumptions || [],
        sections: normalizedPRD.sections,
        metadata: normalizedPRD.metadata
      };

      const textContent = convertPRDToText(flatPRD);
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
  }, [normalizedPRD, copyStatus]);

  const handleExportMarkdown = useCallback(async () => {
    if (exportStatus !== 'idle') return;
    
    setExportStatus('exporting');
    try {
      // Convert to flattened format for export
      const flatPRD: FlattenedPRD = {
        solutionOverview: normalizedPRD.sections.solution?.solutionOverview || '',
        targetUsers: normalizedPRD.sections.targetUsers?.targetUsers || [],
        goals: normalizedPRD.sections.keyFeatures?.keyFeatures || [],
        successMetrics: normalizedPRD.sections.successMetrics?.successMetrics || [],
        constraints: normalizedPRD.sections.constraints?.constraints || [],
        assumptions: normalizedPRD.sections.constraints?.assumptions || [],
        sections: normalizedPRD.sections,
        metadata: normalizedPRD.metadata
      };

      const markdownContent = convertPRDToMarkdown(flatPRD);
      downloadMarkdown(markdownContent);
      
      setExportStatus('exported');
      setTimeout(() => setExportStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to export PRD:', error);
      setExportStatus('idle');
    }
  }, [normalizedPRD, exportStatus]);

  // Check if PRD has any meaningful content
  const hasContent = normalizedPRD.sections.solution?.solutionOverview ||
                    normalizedPRD.sections.targetUsers?.targetUsers.length ||
                    normalizedPRD.sections.keyFeatures?.keyFeatures.length ||
                    normalizedPRD.sections.successMetrics?.successMetrics.length ||
                    normalizedPRD.sections.constraints?.constraints.length ||
                    normalizedPRD.sections.constraints?.assumptions.length;

  const renderMetadata = () => {
    if (!normalizedPRD.metadata || readOnly) return null;

    const { 
      confidence_scores, 
      confidence_assessments,
      overall_confidence,
      processing_time_ms, 
      total_confidence, // Keep for backwards compatibility
      sections_generated 
    } = normalizedPRD.metadata;
    
    if (!confidence_scores && !confidence_assessments && !processing_time_ms && !total_confidence && !overall_confidence) return null;

    return (
      <Card className="p-4 mb-6 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-blue-600" />
          <h4 className="text-sm font-semibold text-blue-900">Generation Analytics</h4>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          {(total_confidence || overall_confidence || confidence_assessments) && (
            <div className="flex items-center gap-2">
              {(() => {
                const overallConfidence = formatOverallConfidence(
                  confidence_assessments as Record<string, ConfidenceValue> | undefined,
                  (overall_confidence || total_confidence) as ConfidenceValue | undefined
                );
                return (
                  <>
                    <div className={`w-2 h-2 rounded-full ${
                      overallConfidence.level === 'high' ? 'bg-green-500' :
                      overallConfidence.level === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
                    }`}></div>
                    <span className="text-gray-700">
                      <strong>{overallConfidence.displayText}</strong>
                      <div className="text-xs text-gray-500 mt-1">{overallConfidence.summary}</div>
                    </span>
                  </>
                );
              })()}
            </div>
          )}
          
          {processing_time_ms && (
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 text-blue-600" />
              <span className="text-gray-700">
                Generated in: <strong>{processing_time_ms}ms</strong>
              </span>
            </div>
          )}
          
          {sections_generated && sections_generated.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
              <span className="text-gray-700">
                Sections: <strong>{sections_generated.length}</strong>
              </span>
            </div>
          )}
        </div>

        {confidence_scores && Object.keys(confidence_scores).length > 0 && (
          <div className="mt-3 pt-3 border-t border-blue-200">
            <div className="text-xs text-gray-600 mb-2">Section Confidence Scores:</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(confidence_scores).map(([section, confidence]) => (
                <span key={section} className="px-2 py-1 bg-white/50 rounded text-xs">
                  {section}: {Math.round(confidence * 100)}%
                </span>
              ))}
            </div>
          </div>
        )}
      </Card>
    );
  };

  const renderValidationStatus = () => {
    if (!normalizedPRD.validation || readOnly) return null;

    const { is_valid, issues, warnings } = normalizedPRD.validation;
    
    if (is_valid && (!issues?.length) && (!warnings?.length)) return null;

    return (
      <Card className="p-4 mb-6 bg-yellow-50 border-yellow-200">
        <div className="flex items-center gap-2 mb-2">
          <AlertCircle className="h-4 w-4 text-yellow-600" />
          <h4 className="text-sm font-semibold text-yellow-900">Validation Status</h4>
        </div>
        
        {issues && issues.length > 0 && (
          <div className="mb-2">
            <div className="text-xs font-medium text-red-700 mb-1">Issues:</div>
            <ul className="text-xs text-red-600 space-y-1">
              {issues.map((issue, index) => (
                <li key={index}>• {issue}</li>
              ))}
            </ul>
          </div>
        )}
        
        {warnings && warnings.length > 0 && (
          <div>
            <div className="text-xs font-medium text-yellow-700 mb-1">Warnings:</div>
            <ul className="text-xs text-yellow-600 space-y-1">
              {warnings.map((warning, index) => (
                <li key={index}>• {warning}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    );
  };

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
      {/* Analytics & Validation */}
      {renderMetadata()}
      {renderValidationStatus()}

      {/* Target Users Section */}
      <TargetUsersSection
        section={normalizedPRD.sections.targetUsers}
        onChange={updateTargetUsers}
        onRegenerate={onRegenerateSection ? () => onRegenerateSection('targetUsers') : undefined}
        readOnly={readOnly}
        confidence={normalizedPRD.metadata?.confidence_scores?.targetUsers}
        isRegenerating={isRegenerating.targetUsers}
      />

      {/* Solution Section */}
      <SolutionSection
        section={normalizedPRD.sections.solution}
        onChange={updateSolution}
        onRegenerate={onRegenerateSection ? () => onRegenerateSection('solution') : undefined}
        readOnly={readOnly}
        confidence={normalizedPRD.metadata?.confidence_scores?.solution}
        isRegenerating={isRegenerating.solution}
      />

      {/* Key Features Section */}
      <KeyFeaturesSection
        section={normalizedPRD.sections.keyFeatures}
        onChange={updateKeyFeatures}
        onRegenerate={onRegenerateSection ? () => onRegenerateSection('keyFeatures') : undefined}
        readOnly={readOnly}
        confidence={normalizedPRD.metadata?.confidence_scores?.keyFeatures}
        isRegenerating={isRegenerating.keyFeatures}
      />

      {/* Success Metrics Section */}
      <SuccessMetricsSection
        section={normalizedPRD.sections.successMetrics}
        onChange={updateSuccessMetrics}
        onRegenerate={onRegenerateSection ? () => onRegenerateSection('successMetrics') : undefined}
        readOnly={readOnly}
        confidence={normalizedPRD.metadata?.confidence_scores?.successMetrics}
        isRegenerating={isRegenerating.successMetrics}
      />

      {/* Constraints Section */}
      <ConstraintsSection
        section={normalizedPRD.sections.constraints}
        onChange={updateConstraints}
        onRegenerate={onRegenerateSection ? () => onRegenerateSection('constraints') : undefined}
        readOnly={readOnly}
        confidence={normalizedPRD.metadata?.confidence_scores?.constraints}
        isRegenerating={isRegenerating.constraints}
      />

      {/* Footer with copy and export actions */}
      {renderFooter()}
    </div>
  );
}