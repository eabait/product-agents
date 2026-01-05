// Main exports
export {
  createResearchAgentSubagent,
  researchAgentManifest,
  type CreateResearchAgentOptions
} from './subagent'

// Contract types
export * from './contracts'

// Planner
export { ResearchPlanner, type ResearchPlannerOptions, type PlannerInput, type PlanResult } from './planner'

// Executor
export {
  ResearchExecutor,
  TavilySearchAdapter,
  createTavilySearchAdapter,
  type WebSearchAdapter,
  type WebSearchResult,
  type WebSearchOptions,
  type TavilySearchAdapterOptions,
  type StepExecutionResult,
  type ResearchExecutionResult,
  type ExecutionOptions
} from './executor'

// Synthesizer
export { ResearchSynthesizer, type SynthesizerInput, type SynthesizerOptions } from './synthesizer'

// Version
export { RESEARCH_AGENT_VERSION } from './version'
