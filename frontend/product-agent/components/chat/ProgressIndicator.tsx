import React, { memo, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader, CheckCircle, AlertCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import type { AgentProgressEvent, PlanGraphSummary, PlanNodeState, RunProgressStatus } from '../../types';

interface ProgressIndicatorProps {
  events: AgentProgressEvent[]
  plan?: PlanGraphSummary
  nodeStates?: Record<string, PlanNodeState>
  isActive: boolean
  status?: RunProgressStatus
  defaultCollapsed?: boolean
  maxHeight?: string
  startedAt?: string
  completedAt?: string
}

interface ProgressStep {
  id: string
  type: 'status' | 'worker' | 'section' | 'node' | 'subagent'
  name: string
  message: string
  status: 'pending' | 'active' | 'complete' | 'error'
  timestamp: string
  confidence?: number
  error?: string
}

export const ProgressIndicator = memo(function ProgressIndicator({
  events,
  plan,
  nodeStates,
  isActive,
  status,
  defaultCollapsed = true,
  maxHeight = '260px',
  startedAt,
  completedAt
}: ProgressIndicatorProps) {
  const [showHistory, setShowHistory] = useState(!defaultCollapsed);

  useEffect(() => {
    setShowHistory(!defaultCollapsed);
  }, [defaultCollapsed]);

  const steps = useMemo(() => normalizeEvents(events, plan), [events, plan]);
  const latestStep = useMemo(() => getLatestStep(steps, isActive, status), [steps, isActive, status]);
  const planSummary = useMemo(() => summarizePlan(plan, nodeStates), [plan, nodeStates]);

  if (!isActive && steps.length === 0 && !planSummary) {
    return null;
  }

  const statusLabel = getStatusLabel(status, isActive);
  const icon = getStatusIcon(status, isActive);

  return (
    <div className="border rounded-lg bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setShowHistory(prev => !prev)}
        className="w-full p-4 flex items-center gap-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex-shrink-0">{icon}</div>
        <div className="flex-1 text-left">
          <div className="text-sm font-medium text-gray-800">
            {latestStep?.name ?? statusLabel}
            {latestStep?.message ? ` — ${latestStep.message}` : ''}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{formatRunTimeline(startedAt, completedAt, status)}</p>
          {planSummary && (
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 w-28 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-1.5 bg-blue-500 rounded-full transition-all"
                  style={{ width: `${planSummary.percent}%` }}
                />
              </div>
              <span className="text-[11px] text-gray-600">
                {planSummary.done}/{planSummary.total} complete
              </span>
            </div>
          )}
        </div>
        {showHistory ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
      </button>

      <AnimatePresence>
        {showHistory && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-gray-200 bg-gray-50"
          >
            <div className="px-4 py-3 space-y-3 overflow-y-auto" style={{ maxHeight }}>
              {planSummary && (
                <p className="text-xs text-gray-600">
                  Plan: {plan?.artifactKind ?? 'artifact'} • {planSummary.done}/{planSummary.total} complete • {planSummary.active} active • {planSummary.error} issues
                </p>
              )}
              {steps.map(step => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-start gap-3"
                >
                  <StatusDot status={step.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{step.name}</p>
                    <p className="text-xs text-gray-600 truncate">{step.message}</p>
                  </div>
                  <span className="text-[11px] text-gray-500">{formatTime(step.timestamp)}</span>
                </motion.div>
              ))}
              {steps.length === 0 && (
                <p className="text-xs text-gray-500">No updates yet.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

function getLatestStep(
  steps: ProgressStep[],
  isActive: boolean,
  status?: RunProgressStatus
): ProgressStep | null {
  if (steps.length === 0) return null;
  const findByStatus = (targets: ProgressStep['status'][]): ProgressStep | null => {
    for (let i = steps.length - 1; i >= 0; i -= 1) {
      if (targets.includes(steps[i].status)) return steps[i];
    }
    return null;
  };

  if (status === 'failed') return findByStatus(['error']) ?? steps[steps.length - 1];
  if (isActive) return findByStatus(['active']) ?? findByStatus(['error', 'complete', 'pending']) ?? steps[steps.length - 1];
  return findByStatus(['complete', 'error', 'active', 'pending']) ?? steps[steps.length - 1];
}

function normalizeEvents(events: AgentProgressEvent[], plan?: PlanGraphSummary): ProgressStep[] {
  const steps: ProgressStep[] = [];

  for (const event of events) {
    switch (event.type) {
      case 'plan.created':
        steps.push({
          id: `plan-${event.timestamp}`,
          type: 'status',
          name: 'Plan created',
          message: event.message || (plan?.artifactKind ? `Generated ${plan.artifactKind} plan` : 'Generated plan'),
          status: 'complete',
          timestamp: event.timestamp
        });
        break;

      case 'step.started':
        if (event.stepId) {
          const label = plan?.nodes?.[event.stepId]?.label ?? event.stepId;
          steps.push({
            id: `step-${event.stepId}-${event.timestamp}`,
            type: 'node',
            name: label,
            message: event.message || 'Step started',
            status: 'active',
            timestamp: event.timestamp
          });
        }
        break;

      case 'step.completed':
      case 'step.failed':
        if (event.stepId) {
          const label = plan?.nodes?.[event.stepId]?.label ?? event.stepId;
          steps.push({
            id: `step-${event.stepId}-${event.timestamp}`,
            type: 'node',
            name: label,
            message: event.message || (event.type === 'step.failed' ? 'Step failed' : 'Step completed'),
            status: event.type === 'step.failed' ? 'error' : 'complete',
            timestamp: event.timestamp
          });
        }
        break;

      case 'subagent.started':
      case 'subagent.progress':
      case 'subagent.completed':
      case 'subagent.failed': {
        const payload = event.payload ?? {};
        const subagentId = (payload.subagentId as string) ?? event.stepId ?? 'subagent';
        const label = (payload.label as string) ?? subagentId;
        const status: ProgressStep['status'] =
          event.type === 'subagent.failed'
            ? 'error'
            : event.type === 'subagent.completed'
              ? 'complete'
              : 'active';
        steps.push({
          id: `${event.type}-${subagentId}-${event.timestamp}`,
          type: 'subagent',
          name: label,
          message:
            event.message ||
            (event.type === 'subagent.failed'
              ? 'Subagent failed'
              : event.type === 'subagent.completed'
                ? 'Subagent completed'
                : 'Subagent update'),
          status,
          timestamp: event.timestamp
        });
        break;
      }

      case 'run.status':
        steps.push({
          id: `run-${event.timestamp}`,
          type: 'status',
          name: 'Run status',
          message: formatRunStatus(event.status),
          status: event.status === 'failed' ? 'error' : event.status === 'completed' ? 'complete' : 'active',
          timestamp: event.timestamp
        });
        break;

      case 'status':
        steps.push({
          id: `status-${event.timestamp}`,
          type: 'status',
          name: 'Update',
          message: event.message || 'Processing...',
          status: 'complete',
          timestamp: event.timestamp
        });
        break;

      default:
        steps.push({
          id: `${event.type ?? 'event'}-${event.timestamp}`,
          type: 'status',
          name: event.type ? event.type.replace('.', ' ') : 'Update',
          message: event.message || 'Update received',
          status: 'complete',
          timestamp: event.timestamp
        });
        break;
    }
  }

  return steps;
}

function summarizePlan(plan?: PlanGraphSummary, nodeStates?: Record<string, PlanNodeState>) {
  const ids = plan ? Object.keys(plan.nodes) : nodeStates ? Object.keys(nodeStates) : [];
  if (ids.length === 0) return null;

  let done = 0;
  let active = 0;
  let error = 0;

  for (const id of ids) {
    const state = nodeStates?.[id];
    if (!state) continue;
    if (state.status === 'complete') done += 1;
    if (state.status === 'active') active += 1;
    if (state.status === 'error') error += 1;
  }

  const total = ids.length;
  const percent = total > 0 ? Math.max(0, Math.min(100, Math.round((done / total) * 100))) : 0;

  return { total, done, active, error, percent };
}

function StatusDot({ status }: { status: ProgressStep['status'] }) {
  const color = (() => {
    switch (status) {
      case 'active':
        return 'bg-blue-500';
      case 'complete':
        return 'bg-green-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  })();

  return <span className={`h-2.5 w-2.5 rounded-full ${color} mt-1`} />;
}

function getStatusIcon(status: RunProgressStatus | undefined, isActive: boolean) {
  if (status === 'failed') return <AlertCircle className="h-4 w-4 text-red-500" />;
  if (status === 'completed') return <CheckCircle className="h-4 w-4 text-green-600" />;
  if (isActive) return <Loader className="h-4 w-4 text-blue-600 animate-spin" />;
  return <Clock className="h-4 w-4 text-gray-500" />;
}

function getStatusLabel(status: RunProgressStatus | undefined, isActive: boolean) {
  switch (status) {
    case 'failed':
      return 'Run failed';
    case 'awaiting-input':
      return 'Awaiting input';
    case 'completed':
      return 'Plan execution complete';
    default:
      return isActive ? 'Executing plan' : 'Run status';
  }
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function formatRunStatus(status?: string): string {
  if (!status) return 'Status update';
  switch (status) {
    case 'running':
      return 'Run in progress';
    case 'awaiting-input':
      return 'Awaiting input';
    case 'failed':
      return 'Run failed';
    case 'completed':
      return 'Run completed';
    default:
      return status;
  }
}

function formatRunTimeline(startedAt?: string, completedAt?: string, status?: RunProgressStatus): string {
  if (!startedAt) return '';
  const started = new Date(startedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  if (status === 'active' || !completedAt) {
    return `Started ${started}`;
  }
  const completed = new Date(completedAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  return `Started ${started} • Finished ${completed}`;
}
