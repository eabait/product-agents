/**
 * Barrel exports for all PRD Agent prompts
 * 
 * Centralizes access to all prompt functions used by analyzers and section writers.
 */

// Analyzer prompts
export { createClarificationPrompt } from '@product-agents/skills-clarifications'
export { createContextAnalysisPrompt } from './context-analysis'
export { createSectionDetectionPrompt } from './section-detection'

// Section writer prompts
export { createTargetUsersSectionPrompt } from './target-users-section'
export { createSolutionSectionPrompt } from './solution-section'
export { createKeyFeaturesSectionPrompt } from './key-features-section'
export { createSuccessMetricsSectionPrompt } from './success-metrics-section'
export { createConstraintsSectionPrompt } from './constraints-section'
