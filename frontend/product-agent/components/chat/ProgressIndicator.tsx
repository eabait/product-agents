import React, { memo, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Loader,
  CheckCircle,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Map as MapIcon,
  GitBranch
} from 'lucide-react';
import type {
  AgentProgressEvent,
  PlanGraphSummary,
  PlanNodeSummary,
  PlanNodeState,
  RunProgressStatus
} from '../../types';

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
  maxHeight = '300px',
  startedAt,
  completedAt
}: ProgressIndicatorProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isPlanCollapsed, setIsPlanCollapsed] = useState(false);

  React.useEffect(() => {
    setIsCollapsed(defaultCollapsed);
  }, [defaultCollapsed]);

  const steps = useMemo(() => convertEventsToSteps(events, plan), [events, plan]);
  const latestStep = useMemo(() => getLatestProgressStep(steps, isActive), [steps, isActive]);
  const orderedPlanNodes = useMemo(() => orderPlanNodes(plan), [plan]);

  if (!isActive && steps.length === 0 && !plan) {
    return null;
  }

  const handleToggleCollapsed = () => setIsCollapsed(prev => !prev);
  const handleTogglePlanCollapsed = () => setIsPlanCollapsed(prev => !prev);

  const statusLabel = (() => {
    switch (status) {
      case 'failed':
        return 'Run failed';
      case 'awaiting-input':
        return 'Awaiting clarification';
      case 'completed':
        return 'Plan execution complete';
      default:
        return isActive ? 'Executing plan' : 'Run complete';
    }
  })();

  const headerIconClass = (() => {
    if (status === 'failed') return 'text-red-500';
    if (!isActive) return 'text-green-600';
    return 'animate-spin text-blue-600';
  })();

  const planStatusConfig: Record<PlanNodeState['status'], { label: string; badge: string }> = {
    pending: { label: 'Pending', badge: 'bg-gray-100 text-gray-600' },
    active: { label: 'Active', badge: 'bg-blue-100 text-blue-700' },
    complete: { label: 'Complete', badge: 'bg-green-100 text-green-700' },
    error: { label: 'Error', badge: 'bg-red-100 text-red-700' }
  };

  return (
    <div className="bg-gray-50 border rounded-lg mb-4 overflow-hidden">
      <button
        onClick={handleToggleCollapsed}
        className="w-full p-4 flex items-center gap-2 hover:bg-gray-100 transition-colors"
      >
        <Loader className={`h-4 w-4 ${headerIconClass}`} />
        <div className="flex-1 text-left">
          {isCollapsed ? (
            latestStep ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">{latestStep.name}</span>
                {latestStep.confidence !== undefined && (
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                    {Math.round(latestStep.confidence * 100)}% confidence
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm font-medium text-gray-700">{statusLabel}</span>
            )
          ) : (
            <span className="text-sm font-medium text-gray-700">{statusLabel}</span>
          )}
          <p className="text-xs text-gray-500 mt-0.5">{formatRunTimeline(startedAt, completedAt, status)}</p>
        </div>
        {isCollapsed ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        )}
      </button>

      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-t border-gray-200">
              {plan && (
                <div className="border-b border-gray-200">
                  <button
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                    onClick={handleTogglePlanCollapsed}
                  >
                    <div className="flex items-center gap-2">
                      <MapIcon className="h-4 w-4 text-blue-600" />
                      <div>
                        <p className="text-sm font-semibold text-gray-800">Plan Outline</p>
                        <p className="text-xs text-gray-500">
                          Artifact: {plan.artifactKind} • Nodes: {Object.keys(plan.nodes).length}
                        </p>
                      </div>
                    </div>
                    {isPlanCollapsed ? (
                      <ChevronDown className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                  {!isPlanCollapsed && (
                    <div className="px-4 pb-3 space-y-3 bg-white">
                      {orderedPlanNodes.map(node => {
                        const nodeState = nodeStates?.[node.id] ?? { status: 'pending' }
                        const statusChip = planStatusConfig[nodeState.status]
                        return (
                          <div key={node.id} className="border rounded-md p-3 bg-gray-50">
                            <div className="flex items-center justify-between gap-2">
                              <div>
                                <p className="text-sm font-semibold text-gray-800">
                                  {node.label || node.id}
                                </p>
                                <p className="text-xs text-gray-500">ID: {node.id}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`text-xs px-2 py-0.5 rounded-full ${statusChip.badge}`}>
                                  {statusChip.label}
                                </span>
                                {node.metadata?.kind && (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 capitalize">
                                    {String(node.metadata.kind)}
                                  </span>
                                )}
                              </div>
                            </div>
                          {node.metadata?.skillId && (
                            <p className="text-xs text-gray-500 mt-1">
                              Skill: {String(node.metadata.skillId)}
                            </p>
                          )}
                          {node.metadata?.subagentId && (
                            <p className="text-xs text-gray-500 mt-1">
                              Subagent: {String(node.metadata.subagentId)}
                            </p>
                          )}
                          {node.dependsOn.length > 0 && (
                            <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                              <GitBranch className="h-3 w-3" />
                              Depends on: {node.dependsOn.join(', ')}
                            </p>
                          )}
                            {nodeState.startedAt && (
                              <p className="text-[11px] text-gray-400 mt-1">
                                Started at {formatTime(nodeState.startedAt)}
                              </p>
                            )}
                            {nodeState.completedAt && (
                              <p className="text-[11px] text-gray-400">
                                Completed at {formatTime(nodeState.completedAt)}
                              </p>
                            )}
                            {nodeState.message && (
                              <p className="text-[11px] text-gray-500 mt-1">{nodeState.message}</p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-y-auto px-4 py-2" style={{ maxHeight }}>
                <AnimatePresence mode="popLayout">
                  {steps.map((step, index) => (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2, delay: index * 0.02 }}
                      className="flex items-center gap-3 py-2 border-l-2 border-gray-200 pl-4 ml-2"
                    >
                      <div className="flex-shrink-0">
                        {step.status === 'pending' && <Clock className="h-4 w-4 text-gray-400" />}
                        {step.status === 'active' && (
                          <Loader className="h-4 w-4 text-blue-600 animate-spin" />
                        )}
                        {step.status === 'complete' && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                        {step.status === 'error' && <AlertCircle className="h-4 w-4 text-red-600" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-700">{step.name}</span>
                          {step.confidence !== undefined && (
                            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                              {Math.round(step.confidence * 100)}% confidence
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate">{step.message}</p>
                        {step.error && <p className="text-xs text-red-600 mt-1">{step.error}</p>}
                      </div>

                      <div className="text-xs text-gray-400">{formatTime(step.timestamp)}</div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {isActive && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mt-3 flex items-center gap-2 text-xs text-gray-500 ml-6"
                  >
                    <div className="flex gap-1">
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        className="w-1 h-1 bg-blue-600 rounded-full"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: 0.2
                        }}
                        className="w-1 h-1 bg-blue-600 rounded-full"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{
                          duration: 1.5,
                          repeat: Infinity,
                          ease: 'easeInOut',
                          delay: 0.4
                        }}
                        className="w-1 h-1 bg-blue-600 rounded-full"
                      />
                    </div>
                    <span>Processing your request...</span>
                  </motion.div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

function getLatestProgressStep(steps: ProgressStep[], isActive: boolean): ProgressStep | null {
  if (steps.length === 0) return null;
  if (isActive) {
    const activeStep = steps.find(step => step.status === 'active');
    if (activeStep) return activeStep;
  }
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    if (step.status === 'complete' || step.status === 'error') {
      return step;
    }
  }
  return steps[steps.length - 1];
}

function convertEventsToSteps(events: AgentProgressEvent[], plan?: PlanGraphSummary): ProgressStep[] {
  const steps: ProgressStep[] = [];
  const workerSteps = new Map<string, ProgressStep>();
  const sectionSteps = new Map<string, ProgressStep>();
  const nodeSteps = new Map<string, ProgressStep>();

  const ensureNodeStep = (stepId: string, defaults: ProgressStep): ProgressStep => {
    const id = `node-${stepId}`;
    if (!nodeSteps.has(id)) {
      nodeSteps.set(id, defaults);
      steps.push(defaults);
      return defaults;
    }
    return nodeSteps.get(id)!;
  };

  for (const event of events) {
    switch (event.type) {
      case 'plan.created':
        steps.push({
          id: `plan-${event.timestamp}`,
          type: 'status',
          name: 'Plan Created',
          message: event.message || `Generated plan for ${plan?.artifactKind ?? 'artifact'}`,
          status: 'complete',
          timestamp: event.timestamp
        });
        break;

      case 'step.started':
        if (event.stepId) {
          const node = plan?.nodes?.[event.stepId];
          const step = ensureNodeStep(event.stepId, {
            id: `node-${event.stepId}`,
            type: node?.metadata?.kind === 'subagent' ? 'subagent' : 'node',
            name: node?.label ?? event.stepId,
            message: event.message || 'Running...',
            status: 'active',
            timestamp: event.timestamp
          });
          step.status = 'active';
          step.message = event.message || step.message;
          step.timestamp = event.timestamp;
        }
        break;

      case 'step.completed':
      case 'step.failed':
        if (event.stepId) {
          const node = plan?.nodes?.[event.stepId];
          const step = ensureNodeStep(event.stepId, {
            id: `node-${event.stepId}`,
            type: node?.metadata?.kind === 'subagent' ? 'subagent' : 'node',
            name: node?.label ?? event.stepId,
            message: '',
            status: 'pending',
            timestamp: event.timestamp
          });
          step.status = event.type === 'step.failed' ? 'error' : 'complete';
          step.message =
            event.message || (event.type === 'step.failed' ? 'Step failed' : 'Step completed');
        }
        break;

      case 'subagent.started':
      case 'subagent.completed':
      case 'subagent.failed': {
        const payload = (event.payload ?? {}) as Record<string, unknown>;
        const subagentId = (payload.subagentId as string) ?? (event.stepId ?? '');
        if (!subagentId) break;
        const id = `subagent-${subagentId}`;
        const step =
          nodeSteps.get(id) ||
          (() => {
            const newStep: ProgressStep = {
              id,
              type: 'subagent',
              name: String(payload.label ?? payload.subagentId ?? subagentId),
              message: event.message || 'Subagent update',
              status: 'pending',
              timestamp: event.timestamp
            };
            nodeSteps.set(id, newStep);
            steps.push(newStep);
            return newStep;
          })();
        if (event.type === 'subagent.started') {
          step.status = 'active';
          step.message = event.message || 'Subagent started';
        } else {
          step.status = event.type === 'subagent.failed' ? 'error' : 'complete';
          step.message =
            event.message ||
            (event.type === 'subagent.failed' ? 'Subagent failed' : 'Subagent completed');
        }
        break;
      }

      case 'run.status':
        steps.push({
          id: `status-${event.timestamp}`,
          type: 'status',
          name: 'Run Status',
          message: formatRunStatus(event.status),
          status: event.status === 'failed' ? 'error' : 'complete',
          timestamp: event.timestamp
        });
        break;

      case 'status':
        steps.push({
          id: `status-${event.timestamp}`,
          type: 'status',
          name: 'Status Update',
          message: event.message || 'Processing...',
          status: 'complete',
          timestamp: event.timestamp
        });
        break;

      case 'worker_start':
        if (event.payload?.worker || (event as any).worker) {
          const workerName = (event.payload?.worker as string) ?? ((event as any).worker as string);
          const step: ProgressStep = {
            id: `worker-${workerName}`,
            type: 'worker',
            name: getWorkerDisplayName(workerName),
            message: event.message || `Starting ${workerName}...`,
            status: 'active',
            timestamp: event.timestamp
          };
          workerSteps.set(workerName, step);
          steps.push(step);
        }
        break;

      case 'worker_complete':
        if (event.payload?.worker || (event as any).worker) {
          const workerName = (event.payload?.worker as string) ?? ((event as any).worker as string);
          const existingStep = workerSteps.get(workerName);
          if (existingStep) {
            existingStep.status = event.message?.includes('failed') ? 'error' : 'complete';
            existingStep.message = event.message || `${workerName} completed`;
            existingStep.confidence = event.payload?.confidence as number | undefined;
          }
        }
        break;

      case 'section_start':
        if ((event as any).section) {
          const sectionName = (event as any).section as string;
          const step: ProgressStep = {
            id: `section-${sectionName}`,
            type: 'section',
            name: getSectionDisplayName(sectionName),
            message: event.message || `Generating ${sectionName}...`,
            status: 'active',
            timestamp: event.timestamp
          };
          sectionSteps.set(sectionName, step);
          steps.push(step);
        }
        break;

      case 'section_complete':
        if ((event as any).section) {
          const sectionName = (event as any).section as string;
          const existingStep = sectionSteps.get(sectionName);
          if (existingStep) {
            existingStep.status = event.message?.includes('failed') ? 'error' : 'complete';
            existingStep.message = event.message || `${sectionName} completed`;
          }
        }
        break;

      default:
        // Preserve legacy "final" and custom events
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

function getWorkerDisplayName(worker: string): string {
  const displayNames: Record<string, string> = {
    ClarificationAnalyzer: 'Requirements Analysis',
    ContextAnalyzer: 'Context Analysis',
    SectionDetectionAnalyzer: 'Section Detection'
  };
  return displayNames[worker] || worker;
}

function getSectionDisplayName(section: string): string {
  const displayNames: Record<string, string> = {
    targetUsers: 'Target Users',
    solution: 'Solution Overview',
    keyFeatures: 'Key Features',
    successMetrics: 'Success Metrics',
    constraints: 'Constraints & Assumptions'
  };
  return displayNames[section] || section;
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

function orderPlanNodes(plan?: PlanGraphSummary): PlanNodeSummary[] {
  if (!plan) return [];
  const pending = new Set(Object.keys(plan.nodes));
  const ordered: PlanNodeSummary[] = [];
  const resolved = new Set<string>();

  while (pending.size > 0) {
    let progress = false;
    for (const nodeId of Array.from(pending)) {
      const node = plan.nodes[nodeId];
      const deps = node.dependsOn ?? [];
      const canInclude = deps.every(dep => resolved.has(dep) || !plan.nodes[dep]);
      if (canInclude) {
        ordered.push(node);
        pending.delete(nodeId);
        resolved.add(nodeId);
        progress = true;
      }
    }
    if (!progress) {
      // Circular dependency safeguard: append remaining nodes in insertion order
      for (const nodeId of pending) {
        ordered.push(plan.nodes[nodeId]);
      }
      break;
    }
  }

  return ordered;
}
