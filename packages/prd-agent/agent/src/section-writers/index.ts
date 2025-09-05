export { BaseSectionWriter, type SectionWriterResult, type SectionWriterInput } from './base-section-writer'

// Legacy section writers (complex structure)
export { ContextSectionWriter, type ContextSection } from './context-section-writer'
export { ProblemStatementSectionWriter, type ProblemStatementSection } from './problem-statement-section-writer'
export { AssumptionsSectionWriter, type AssumptionsSection } from './assumptions-section-writer'
export { MetricsSectionWriter, type MetricsSection } from './metrics-section-writer'

// New simplified section writers (flat structure)
export { TargetUsersSectionWriter, type TargetUsersSection } from './target-users-section-writer'
export { SolutionSectionWriter, type SolutionSection } from './solution-section-writer'
export { KeyFeaturesSectionWriter, type KeyFeaturesSection } from './key-features-section-writer'
export { SuccessMetricsSectionWriter, type SuccessMetricsSection } from './success-metrics-section-writer'
export { ConstraintsSectionWriter, type ConstraintsSection } from './constraints-section-writer'

// Note: RequirementsSectionWriter removed - requirements extracted directly from ContextAnalyzer
// Note: ScopeSectionWriter removed - scope functionality merged into ContextSection