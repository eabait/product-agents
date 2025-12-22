'use client';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, Search, AlertCircle } from 'lucide-react';

interface ResearchStep {
  id: string;
  label: string;
  type: string;
  description?: string;
  queries: string[];
  estimatedSources?: number;
  dependsOn?: string[];
}

interface ResearchPlan {
  id: string;
  topic: string;
  scope: string;
  objectives: string[];
  steps: ResearchStep[];
  estimatedSources?: number;
  estimatedDuration?: string;
  depth?: 'quick' | 'standard' | 'comprehensive';
  status?: string;
  createdAt: string;
}

interface ResearchPlanCardProps {
  plan: ResearchPlan;
  status: 'awaiting-plan-confirmation' | 'awaiting-clarification';
  onApprove?: () => void;
  onReject?: () => void;
  isProcessing?: boolean;
}

export function ResearchPlanCard({
  plan,
  status,
  onApprove,
  onReject,
  isProcessing = false
}: ResearchPlanCardProps) {
  const getDepthBadgeColor = (depth?: string) => {
    switch (depth) {
      case 'quick':
        return 'bg-blue-100 text-blue-800';
      case 'standard':
        return 'bg-green-100 text-green-800';
      case 'comprehensive':
        return 'bg-purple-100 text-purple-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusBadge = () => {
    if (status === 'awaiting-plan-confirmation') {
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">
          <Clock className="w-3 h-3 mr-1" />
          Awaiting Approval
        </Badge>
      );
    }
    if (status === 'awaiting-clarification') {
      return (
        <Badge className="bg-orange-100 text-orange-800 border-orange-300">
          <AlertCircle className="w-3 h-3 mr-1" />
          Needs Clarification
        </Badge>
      );
    }
    return null;
  };

  return (
    <Card className="p-6 bg-gradient-to-br from-blue-50 to-purple-50 border-blue-200">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-blue-900">Research Plan</h3>
              {getStatusBadge()}
            </div>
            <h4 className="text-xl font-bold text-gray-900 mb-2">{plan.topic}</h4>
            <p className="text-sm text-gray-700">{plan.scope}</p>
          </div>
          {plan.depth && (
            <Badge className={getDepthBadgeColor(plan.depth)}>
              {plan.depth}
            </Badge>
          )}
        </div>

        {/* Objectives */}
        {plan.objectives && plan.objectives.length > 0 && (
          <div>
            <h5 className="text-sm font-semibold text-gray-900 mb-2">Objectives:</h5>
            <ul className="space-y-1">
              {plan.objectives.map((objective, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-gray-700">
                  <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>{objective}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Research Steps */}
        <div>
          <h5 className="text-sm font-semibold text-gray-900 mb-3">Research Steps ({plan.steps.length}):</h5>
          <div className="space-y-3">
            {plan.steps.map((step, index) => (
              <div
                key={step.id}
                className="bg-white/70 rounded-lg p-3 border border-blue-100"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h6 className="font-medium text-gray-900">{step.label}</h6>
                      <Badge variant="outline" className="text-xs">
                        {step.type}
                      </Badge>
                    </div>
                    {step.description && (
                      <p className="text-xs text-gray-600 mb-2">{step.description}</p>
                    )}
                    {step.queries && step.queries.length > 0 && (
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Search queries:</span>
                        <ul className="list-disc list-inside ml-2 mt-1">
                          {step.queries.map((query, i) => (
                            <li key={i}>{query}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Metadata */}
        {(plan.estimatedSources || plan.estimatedDuration) && (
          <div className="flex flex-wrap gap-4 text-xs text-gray-600 pt-3 border-t border-blue-200">
            {plan.estimatedSources && (
              <div className="flex items-center gap-1">
                <Search className="w-3 h-3" />
                <span>Est. sources: <strong>{plan.estimatedSources}</strong></span>
              </div>
            )}
            {plan.estimatedDuration && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>Est. duration: <strong>{plan.estimatedDuration}</strong></span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {status === 'awaiting-plan-confirmation' && (
          <div className="flex gap-3 pt-4 border-t border-blue-200">
            <Button
              onClick={onApprove}
              disabled={isProcessing}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {isProcessing ? 'Starting Research...' : 'Approve & Start Research'}
            </Button>
            <Button
              onClick={onReject}
              disabled={isProcessing}
              variant="outline"
            >
              Reject
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
