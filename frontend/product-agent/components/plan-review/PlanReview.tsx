'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle, XCircle, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { PlanProposal, PlanStepProposal } from '@/types';

export interface PlanReviewProps {
  plan: PlanProposal;
  onApprove: () => void;
  onReject: (feedback?: string) => void;
  isLoading?: boolean;
  error?: string;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const percentage = Math.round(confidence * 100);
  let variant: 'default' | 'secondary' | 'destructive' = 'default';

  if (confidence < 0.5) {
    variant = 'destructive';
  } else if (confidence < 0.75) {
    variant = 'secondary';
  }

  return (
    <Badge variant={variant}>
      {percentage}% confidence
    </Badge>
  );
}

function StepCard({ step, index }: { step: PlanStepProposal; index: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-md p-3 bg-muted/30">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-medium">
            {index + 1}
          </div>
          <div>
            <div className="font-medium text-sm">{step.label}</div>
            <div className="text-xs text-muted-foreground">
              {step.toolType === 'subagent' ? '🤖' : '⚡'} {step.toolId}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {step.toolType}
          </Badge>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Why this step?</div>
            <p className="text-sm">{step.rationale}</p>
          </div>
          {step.dependsOn.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Depends on</div>
              <div className="flex gap-1 flex-wrap">
                {step.dependsOn.map(dep => (
                  <Badge key={dep} variant="secondary" className="text-xs">
                    {dep}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {step.outputArtifact && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">Produces</div>
              <Badge variant="outline" className="text-xs">{step.outputArtifact}</Badge>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function PlanReview({ plan, onApprove, onReject, isLoading, error }: PlanReviewProps) {
  const [feedback, setFeedback] = useState('');

  const handleReject = () => {
    onReject();
  };

  const handleRequestChanges = () => {
    onReject(feedback.trim() || undefined);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      {error && (
        <div className="mx-6 mt-6 p-3 bg-red-500/10 border border-red-500/30 rounded-md">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <span className="text-sm font-medium text-red-600">Error</span>
          </div>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
      )}
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Review Execution Plan</CardTitle>
          <ConfidenceBadge confidence={plan.confidence} />
        </div>
        <CardDescription>
          The orchestrator has generated a plan to fulfill your request.
          Review the steps below and approve to begin execution.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Target Artifact */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Target:</span>
          <Badge>{plan.targetArtifact}</Badge>
        </div>

        {/* Overall Rationale */}
        <div className="p-3 bg-muted/50 rounded-md">
          <div className="text-xs font-medium text-muted-foreground mb-1">Plan Rationale</div>
          <p className="text-sm">{plan.overallRationale}</p>
        </div>

        {/* Warnings */}
        {plan.warnings && plan.warnings.length > 0 && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium text-yellow-600">Warnings</span>
            </div>
            <ul className="text-sm space-y-1">
              {plan.warnings.map((warning, i) => (
                <li key={i} className="text-yellow-700">{warning}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Suggested Clarifications */}
        {plan.suggestedClarifications && plan.suggestedClarifications.length > 0 && (
          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-md">
            <div className="text-sm font-medium text-blue-600 mb-2">Questions for you</div>
            <ul className="text-sm space-y-1">
              {plan.suggestedClarifications.map((q, i) => (
                <li key={i} className="text-blue-700">• {q}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Steps */}
        <div>
          <div className="text-sm font-medium mb-2">
            Execution Steps ({plan.steps.length})
          </div>
          <div className="space-y-2">
            {plan.steps.map((step, index) => (
              <StepCard key={step.id} step={step} index={index} />
            ))}
          </div>
        </div>

        {/* Feedback Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium">
            Refinement feedback (optional)
          </label>
          <Textarea
            placeholder="Describe any changes you'd like to the plan..."
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            rows={3}
            disabled={isLoading}
          />
        </div>
      </CardContent>

      <CardFooter className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={handleReject}
          disabled={isLoading}
        >
          <XCircle className="h-4 w-4 mr-2" />
          Cancel
        </Button>
        {feedback.trim() && (
          <Button
            variant="outline"
            onClick={handleRequestChanges}
            disabled={isLoading}
          >
            Request Changes
          </Button>
        )}
        <Button
          onClick={onApprove}
          disabled={isLoading}
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          Approve & Execute
        </Button>
      </CardFooter>
    </Card>
  );
}
