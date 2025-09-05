import { PRD, PRDSchema } from './schemas'

// Re-export post-processing utilities
export * from './utils/post-process-structured-response'

// Helper function to apply section updates to a PRD
export function applyPatch(basePRD: PRD, sectionUpdates: any): PRD {
  const result: PRD = {
    ...basePRD,
    sections: {
      ...basePRD.sections,
      ...sectionUpdates
    },
    metadata: {
      ...basePRD.metadata,
      lastUpdated: new Date().toISOString(),
      sections_generated: Object.keys(sectionUpdates)
    }
  }
  
  // Auto-generate flattened fields from sections for frontend compatibility
  if (result.sections) {
    if (result.sections.problemStatement) {
      result.problemStatement = result.sections.problemStatement.problemStatement
      result.targetUsers = result.sections.problemStatement.targetUsers?.map((u: any) => u.persona) || []
    }
    
    if (result.sections.context) {
      result.solutionOverview = result.sections.context.businessContext
      result.constraints = result.sections.context.constraints || []
    }
    
    if (result.sections.context?.requirements) {
      result.goals = result.sections.context.requirements.epics?.map((epic: any) => epic.title) || []
    }
    
    if (result.sections.metrics) {
      result.successMetrics = result.sections.metrics.successMetrics?.map((m: any) => ({
        metric: m.metric,
        target: m.target,
        timeline: m.timeline
      })) || []
    }
    
    if (result.sections.assumptions) {
      result.assumptions = result.sections.assumptions.assumptions?.map((a: any) => a.assumption) || []
    }
  }
  
  return result
}

// Helper function for backward compatibility - does nothing now but kept for API compatibility
export function cleanPatchResponse(data: any): any {
  return data
}