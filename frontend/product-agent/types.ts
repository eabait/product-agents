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

export type SubAgentSettingsMap = Record<
  string,
  {
    model: string;
    temperature: number;
    maxTokens: number;
    apiKey?: string;
    advanced?: Record<string, unknown>;
  }
>;

export interface AgentSettingsState {
  model: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
  streaming?: boolean;
  subAgentSettings: SubAgentSettingsMap;
  artifactTypes: string[];
}
