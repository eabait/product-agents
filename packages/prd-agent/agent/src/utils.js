// Re-export post-processing utilities
export { postProcessStructuredResponse, ensureArrayFields } from '@product-agents/skills-prd/utils';
// Helper function to apply section updates to a PRD
export function applyPatch(basePRD, sectionUpdates) {
    const result = {
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
    };
    // Auto-generate flattened fields from simplified sections for frontend compatibility
    if (result.sections) {
        if (result.sections.targetUsers) {
            result.targetUsers = result.sections.targetUsers.targetUsers || [];
        }
        if (result.sections.solution) {
            result.solutionOverview = result.sections.solution.solutionOverview || '';
        }
        if (result.sections.keyFeatures) {
            result.goals = result.sections.keyFeatures.keyFeatures || [];
        }
        if (result.sections.successMetrics) {
            result.successMetrics = result.sections.successMetrics.successMetrics || [];
        }
        if (result.sections.constraints) {
            result.constraints = result.sections.constraints.constraints || [];
            result.assumptions = result.sections.constraints.assumptions || [];
        }
    }
    return result;
}
