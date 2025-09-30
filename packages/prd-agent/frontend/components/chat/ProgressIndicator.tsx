import React, { memo, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader, CheckCircle, AlertCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react';

// Import from shared types (future improvement - not implementing now to avoid breaking changes)
export interface ProgressEvent {
  type: 'status' | 'worker_start' | 'worker_complete' | 'section_start' | 'section_complete' | 'final'
  timestamp: string
  message?: string
  worker?: string
  section?: string
  data?: any
  confidence?: number
  error?: string
}

interface ProgressIndicatorProps {
  events: ProgressEvent[]
  isActive: boolean
  defaultCollapsed?: boolean
  maxHeight?: string
}

interface ProgressStep {
  id: string
  type: 'status' | 'worker' | 'section'
  name: string
  message: string
  status: 'pending' | 'active' | 'complete' | 'error'
  timestamp: string
  confidence?: number
  error?: string
}

export const ProgressIndicator = memo(function ProgressIndicator({ 
  events, 
  isActive, 
  defaultCollapsed = true,
  maxHeight = "300px"
}: ProgressIndicatorProps) {
  // State for collapse/expand
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  
  // Memoize the conversion of events to steps for performance
  const steps = useMemo(() => convertEventsToSteps(events), [events]);
  
  // Get the latest/most relevant progress step for collapsed view
  const latestStep = useMemo(() => getLatestProgressStep(steps, isActive), [steps, isActive]);
  
  if (!isActive && steps.length === 0) {
    return null
  }

  const handleToggleCollapsed = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div className="bg-gray-50 border rounded-lg mb-4 overflow-hidden">
      {/* Clickable Header */}
      <button 
        onClick={handleToggleCollapsed}
        className="w-full p-4 flex items-center gap-2 hover:bg-gray-100 transition-colors"
      >
        <Loader className={`h-4 w-4 ${isActive ? 'animate-spin text-blue-600' : 'text-gray-400'}`} />
        <div className="flex-1 text-left">
          {isCollapsed ? (
            // Collapsed view - show latest step
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
              <span className="text-sm font-medium text-gray-700">
                {isActive ? 'Generating PRD...' : 'Generation Complete'}
              </span>
            )
          ) : (
            // Expanded view header
            <span className="text-sm font-medium text-gray-700">
              Progress Steps ({steps.length})
            </span>
          )}
        </div>
        {isCollapsed ? (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {/* Expandable Content */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="border-t border-gray-200">
              <div 
                className="overflow-y-auto px-4 py-2"
                style={{ maxHeight }}
              >
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
                        {step.status === 'pending' && (
                          <Clock className="h-4 w-4 text-gray-400" />
                        )}
                        {step.status === 'active' && (
                          <Loader className="h-4 w-4 text-blue-600 animate-spin" />
                        )}
                        {step.status === 'complete' && (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        )}
                        {step.status === 'error' && (
                          <AlertCircle className="h-4 w-4 text-red-600" />
                        )}
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
                        {step.error && (
                          <p className="text-xs text-red-600 mt-1">{step.error}</p>
                        )}
                      </div>

                      <div className="text-xs text-gray-400">
                        {formatTime(step.timestamp)}
                      </div>
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
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        className="w-1 h-1 bg-blue-600 rounded-full"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                        className="w-1 h-1 bg-blue-600 rounded-full"
                      />
                      <motion.div
                        animate={{ opacity: [0.3, 1, 0.3] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
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
  )
});

function getLatestProgressStep(steps: ProgressStep[], isActive: boolean): ProgressStep | null {
  if (steps.length === 0) return null;
  
  // If we're still active, prioritize the currently active step
  if (isActive) {
    const activeStep = steps.find(step => step.status === 'active');
    if (activeStep) return activeStep;
  }
  
  // Otherwise, find the most recent completed step or the last step in the list
  for (let i = steps.length - 1; i >= 0; i--) {
    const step = steps[i];
    if (step.status === 'complete' || step.status === 'error') {
      return step;
    }
  }
  
  // If no completed steps, return the last step
  return steps[steps.length - 1];
}

function convertEventsToSteps(events: ProgressEvent[]): ProgressStep[] {
  const steps: ProgressStep[] = []
  const workerSteps = new Map<string, ProgressStep>()
  const sectionSteps = new Map<string, ProgressStep>()
  
  for (const event of events) {
    switch (event.type) {
      case 'status':
        steps.push({
          id: `status-${event.timestamp}`,
          type: 'status',
          name: 'Status Update',
          message: event.message || 'Processing...',
          status: 'complete',
          timestamp: event.timestamp
        })
        break
        
      case 'worker_start':
        if (event.worker) {
          const step: ProgressStep = {
            id: `worker-${event.worker}`,
            type: 'worker',
            name: getWorkerDisplayName(event.worker),
            message: event.message || `Starting ${event.worker}...`,
            status: 'active',
            timestamp: event.timestamp
          }
          workerSteps.set(event.worker, step)
          steps.push(step)
        }
        break
        
      case 'worker_complete':
        if (event.worker) {
          const existingStep = workerSteps.get(event.worker)
          if (existingStep) {
            existingStep.status = event.error ? 'error' : 'complete'
            existingStep.message = event.message || `${event.worker} completed`
            existingStep.confidence = event.confidence
            existingStep.error = event.error
          }
        }
        break
        
      case 'section_start':
        if (event.section) {
          const step: ProgressStep = {
            id: `section-${event.section}`,
            type: 'section',
            name: getSectionDisplayName(event.section),
            message: event.message || `Generating ${event.section}...`,
            status: 'active',
            timestamp: event.timestamp
          }
          sectionSteps.set(event.section, step)
          steps.push(step)
        }
        break
        
      case 'section_complete':
        if (event.section) {
          const existingStep = sectionSteps.get(event.section)
          if (existingStep) {
            existingStep.status = event.error ? 'error' : 'complete'
            existingStep.message = event.message || `${event.section} completed`
            existingStep.confidence = event.confidence
            existingStep.error = event.error
          }
        }
        break
        
      case 'final':
        steps.push({
          id: `final-${event.timestamp}`,
          type: 'status',
          name: 'Complete',
          message: event.message || 'PRD generation complete',
          status: 'complete',
          timestamp: event.timestamp
        })
        break
    }
  }
  
  return steps
}

function getWorkerDisplayName(worker: string): string {
  const displayNames: Record<string, string> = {
    'ClarificationAnalyzer': 'Requirements Analysis',
    'ContextAnalyzer': 'Context Analysis',
    'SectionDetectionAnalyzer': 'Section Detection'
  }
  return displayNames[worker] || worker
}

function getSectionDisplayName(section: string): string {
  const displayNames: Record<string, string> = {
    'targetUsers': 'Target Users',
    'solution': 'Solution Overview',
    'keyFeatures': 'Key Features',
    'successMetrics': 'Success Metrics',
    'constraints': 'Constraints & Assumptions'
  }
  return displayNames[section] || section
}

function formatTime(timestamp: string): string {
  try {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
  }
}