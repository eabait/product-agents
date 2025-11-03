import { AgentRuntimeSettings } from '@product-agents/agent-core';
import { ModelCapability } from '@product-agents/model-compatibility';
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
    requiredCapabilities: ModelCapability[];
    defaultSettings: AgentRuntimeSettings;
    configurableParameters: SubAgentParameterDefinition[];
}
export interface AgentMetadata {
    id: string;
    name: string;
    description: string;
    version: string;
    requiredCapabilities: ModelCapability[];
    defaultSettings: AgentRuntimeSettings;
    subAgents: SubAgentMetadata[];
}
export declare const PRD_AGENT_METADATA: AgentMetadata;
export declare function getDefaultSubAgentSettings(): Record<string, AgentRuntimeSettings>;
//# sourceMappingURL=agent-metadata.d.ts.map