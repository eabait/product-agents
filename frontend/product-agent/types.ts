import { UsageSummary } from '@product-agents/agent-core'

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  metadata?: {
    model?: string;
    tokens?: number;
    duration?: number;
    confidence?: number;
    usage?: UsageSummary;
    cost?: number;
    currency?: string;
    costSource?: 'provider' | 'estimated';
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export type Conversation = { 
  id: string; 
  title: string; 
  messages: Message[]; 
  createdAt: string;
}

export type ProgressEventType =
  | 'plan.created'
  | 'plan.updated'
  | 'step.started'
  | 'step.completed'
  | 'step.failed'
  | 'verification.started'
  | 'verification.completed'
  | 'verification.issue'
  | 'artifact.delivered'
  | 'run.status'
  | 'subagent.started'
  | 'subagent.progress'
  | 'subagent.completed'
  | 'subagent.failed'

export interface AgentProgressEvent {
  type: ProgressEventType | string
  timestamp: string
  runId?: string
  stepId?: string
  payload?: Record<string, unknown>
  message?: string
  status?: 'pending' | 'running' | 'awaiting-input' | 'blocked' | 'failed' | 'completed' | 'pending-approval'
}

export interface PlanNodeSummary {
  id: string
  label: string
  description?: string
  dependsOn: string[]
  metadata?: Record<string, unknown>
  task?: Record<string, unknown>
}

export interface PlanGraphSummary {
  id: string
  artifactKind: string
  entryId: string
  version: string
  createdAt?: string
  nodes: Record<string, PlanNodeSummary>
  metadata?: Record<string, unknown>
}

export interface PlanStepProposal {
  id: string
  toolId: string
  toolType: 'skill' | 'subagent'
  label: string
  rationale: string
  dependsOn: string[]
  outputArtifact?: string
}

export interface PlanProposal {
  targetArtifact: string
  overallRationale: string
  confidence: number
  warnings?: string[]
  suggestedClarifications?: string[]
  steps: PlanStepProposal[]
}

export type RunProgressStatus = 'active' | 'completed' | 'failed' | 'awaiting-input' | 'pending-approval' | 'blocked-subagent'

export interface PlanNodeState {
  status: 'pending' | 'active' | 'complete' | 'error'
  startedAt?: string
  completedAt?: string
  message?: string
}

export interface BlockedSubagentInfo {
  stepId: string
  subagentId: string
  artifactKind: string
  plan: unknown
  approvalUrl: string
}

export interface RunProgressCard {
  id: string
  runId: string | null
  conversationId: string
  messageId: string | null
  status: RunProgressStatus
  startedAt: string
  completedAt?: string
  events: AgentProgressEvent[]
  plan?: PlanGraphSummary
  approvalPlan?: PlanProposal
  approvalUrl?: string
  nodeStates: Record<string, PlanNodeState>
  blockedSubagent?: BlockedSubagentInfo
}

// PRD-specific types
export type { FlattenedPRD, SuccessMetric } from '@/lib/prd-schema';

export type SubAgentKind = 'orchestrator' | 'analyzer' | 'section-writer';

export interface SubAgentParameterDefinition {
  key: 'model' | 'temperature' | 'maxTokens';
  label: string;
  description?: string;
  type: 'model' | 'number';
  min?: number;
  max?: number;
  step?: number;
}

export interface SubAgentMetadata {
  id: string;
  name: string;
  description: string;
  kind: SubAgentKind;
  requiredCapabilities: string[];
  defaultSettings: {
    model: string;
    temperature: number;
    maxTokens: number;
  };
  configurableParameters: SubAgentParameterDefinition[];
}

export interface AgentMetadata {
  id: string;
  name: string;
  description: string;
  version: string;
  requiredCapabilities: string[];
  defaultSettings: {
    model: string;
    temperature: number;
    maxTokens: number;
  };
  subAgents: SubAgentMetadata[];
}

export interface AgentSettingsState {
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
  streaming?: boolean;
}
