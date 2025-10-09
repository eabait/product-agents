import { AgentRuntimeSettings } from '@product-agents/agent-core'
import { ModelCapability } from '@product-agents/model-compatibility'
import { DEFAULT_AGENT_SETTINGS, CURRENT_PRD_VERSION } from './constants'

export type SubAgentKind = 'orchestrator' | 'analyzer' | 'section-writer'

export interface SubAgentParameterDefinition {
  key: 'model' | 'temperature' | 'maxTokens'
  label: string
  description?: string
  type: 'model' | 'number'
  min?: number
  max?: number
  step?: number
}

export interface SubAgentMetadata {
  id: string
  name: string
  description: string
  kind: SubAgentKind
  requiredCapabilities: ModelCapability[]
  defaultSettings: AgentRuntimeSettings
  configurableParameters: SubAgentParameterDefinition[]
}

export interface AgentMetadata {
  id: string
  name: string
  description: string
  version: string
  requiredCapabilities: ModelCapability[]
  defaultSettings: AgentRuntimeSettings
  subAgents: SubAgentMetadata[]
}

const COMMON_PARAMETERS: SubAgentParameterDefinition[] = [
  {
    key: 'model',
    label: 'Model',
    description: 'LLM used to power this worker',
    type: 'model'
  },
  {
    key: 'temperature',
    label: 'Temperature',
    description: 'Controls creativity versus determinism',
    type: 'number',
    min: 0,
    max: 2,
    step: 0.1
  },
  {
    key: 'maxTokens',
    label: 'Max Tokens',
    description: 'Maximum tokens for a single response',
    type: 'number',
    min: 256,
    max: 16000,
    step: 256
  }
]

export const PRD_AGENT_METADATA: AgentMetadata = {
  id: 'prd-orchestrator',
  name: 'PRD Orchestrator Agent',
  description: 'Modular PRD generation agent with analyzers and section writers',
  version: CURRENT_PRD_VERSION,
  requiredCapabilities: ['structured_output'],
  defaultSettings: { ...DEFAULT_AGENT_SETTINGS },
  subAgents: [
    {
      id: 'orchestrator-core',
      name: 'Orchestrator Core',
      description: 'Coordinates analyzers and section writers, merges final PRD',
      kind: 'orchestrator',
      requiredCapabilities: ['structured_output'],
      defaultSettings: { ...DEFAULT_AGENT_SETTINGS },
      configurableParameters: COMMON_PARAMETERS
    },
    {
      id: 'context-analyzer',
      name: 'Context Analyzer',
      description: 'Extracts themes, requirements, and constraints from inputs',
      kind: 'analyzer',
      requiredCapabilities: ['structured_output'],
      defaultSettings: { ...DEFAULT_AGENT_SETTINGS },
      configurableParameters: COMMON_PARAMETERS
    },
    {
      id: 'clarification-analyzer',
      name: 'Clarification Analyzer',
      description: 'Determines if additional user input is required',
      kind: 'analyzer',
      requiredCapabilities: ['structured_output'],
      defaultSettings: { ...DEFAULT_AGENT_SETTINGS },
      configurableParameters: COMMON_PARAMETERS
    },
    {
      id: 'section-detection-analyzer',
      name: 'Section Detection Analyzer',
      description: 'Routes edits to appropriate sections based on user intent',
      kind: 'analyzer',
      requiredCapabilities: ['structured_output'],
      defaultSettings: { ...DEFAULT_AGENT_SETTINGS },
      configurableParameters: COMMON_PARAMETERS
    },
    {
      id: 'target-users-writer',
      name: 'Target Users Writer',
      description: 'Produces target user descriptions for the PRD',
      kind: 'section-writer',
      requiredCapabilities: ['structured_output'],
      defaultSettings: { ...DEFAULT_AGENT_SETTINGS },
      configurableParameters: COMMON_PARAMETERS
    },
    {
      id: 'solution-writer',
      name: 'Solution Writer',
      description: 'Generates the solution overview section',
      kind: 'section-writer',
      requiredCapabilities: ['structured_output'],
      defaultSettings: { ...DEFAULT_AGENT_SETTINGS },
      configurableParameters: COMMON_PARAMETERS
    },
    {
      id: 'key-features-writer',
      name: 'Key Features Writer',
      description: 'Synthesizes prioritized feature list',
      kind: 'section-writer',
      requiredCapabilities: ['structured_output'],
      defaultSettings: { ...DEFAULT_AGENT_SETTINGS },
      configurableParameters: COMMON_PARAMETERS
    },
    {
      id: 'success-metrics-writer',
      name: 'Success Metrics Writer',
      description: 'Creates measurable success metrics',
      kind: 'section-writer',
      requiredCapabilities: ['structured_output'],
      defaultSettings: { ...DEFAULT_AGENT_SETTINGS },
      configurableParameters: COMMON_PARAMETERS
    },
    {
      id: 'constraints-writer',
      name: 'Constraints & Assumptions Writer',
      description: 'Captures constraints, assumptions, and risks',
      kind: 'section-writer',
      requiredCapabilities: ['structured_output'],
      defaultSettings: { ...DEFAULT_AGENT_SETTINGS },
      configurableParameters: COMMON_PARAMETERS
    }
  ]
}

export function getDefaultSubAgentSettings(): Record<string, AgentRuntimeSettings> {
  return PRD_AGENT_METADATA.subAgents.reduce<Record<string, AgentRuntimeSettings>>((acc, subAgent) => {
    acc[subAgent.id] = { ...subAgent.defaultSettings }
    return acc
  }, {})
}
