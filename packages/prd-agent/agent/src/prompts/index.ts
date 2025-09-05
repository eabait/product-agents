/**
 * Barrel exports for all PRD Agent prompts
 * 
 * Centralizes access to all prompt functions used by analyzers and section writers.
 */

// Analyzer prompts
export { createClarificationPrompt } from './clarification'
export { createContextAnalysisPrompt } from './context-analysis'
export { createRequirementsExtractionPrompt } from './requirements-extraction'
export { createRiskAnalysisPrompt } from './risk-identifier'
export { createContentSummarizerPrompt, type SummaryOptions } from './content-summarizer'

// Section writer prompts (legacy)
export { createContextSectionPrompt } from './context-section'
export { createProblemStatementSectionPrompt } from './problem-statement-section'
export { createAssumptionsSectionPrompt } from './assumptions-section'
export { createMetricsSectionPrompt } from './metrics-section'

// New simplified section writer prompts
export { createTargetUsersSectionPrompt } from './target-users-section'
export { createSolutionSectionPrompt } from './solution-section'
export { createKeyFeaturesSectionPrompt } from './key-features-section'
export { createSuccessMetricsSectionPrompt } from './success-metrics-section'
export { createConstraintsSectionPrompt } from './constraints-section'