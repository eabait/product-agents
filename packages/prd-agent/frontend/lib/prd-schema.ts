import { z } from 'zod';

// Individual Section Schemas
export const TargetUsersSectionSchema = z.object({
  targetUsers: z.array(z.string()).describe('List of specific target user personas')
});

export const SolutionSectionSchema = z.object({
  solutionOverview: z.string().describe('High-level description of the solution approach'),
  approach: z.string().describe('Strategy or methodology for implementing the solution')
});

export const KeyFeaturesSectionSchema = z.object({
  keyFeatures: z.array(z.string()).describe('List of core product features and capabilities')
});

export const SuccessMetricSchema = z.object({
  metric: z.string().describe('The name or description of the metric'),
  target: z.string().describe('The target value or goal for this metric'),
  timeline: z.string().describe('When this target should be achieved'),
});

export const SuccessMetricsSectionSchema = z.object({
  successMetrics: z.array(SuccessMetricSchema).describe('Measurable success criteria with targets and timelines')
});

export const ConstraintsSectionSchema = z.object({
  constraints: z.array(z.string()).describe('Technical, business, or other limitations'),
  assumptions: z.array(z.string()).describe('Key assumptions made during planning')
});

// Complete PRD Sections Schema
export const PRDSectionsSchema = z.object({
  targetUsers: TargetUsersSectionSchema.optional(),
  solution: SolutionSectionSchema.optional(),
  keyFeatures: KeyFeaturesSectionSchema.optional(),
  successMetrics: SuccessMetricsSectionSchema.optional(),
  constraints: ConstraintsSectionSchema.optional()
});

// PRD Metadata Schema
export const PRDMetadataSchema = z.object({
  version: z.string().default('2.0'),
  lastUpdated: z.string(),
  generatedBy: z.string().default('PRD Orchestrator Agent'),
  sections_generated: z.array(z.string()),
  confidence_scores: z.record(z.number()).optional(),
  processing_time_ms: z.number().optional(),
  total_confidence: z.number().optional()
});

// Complete New PRD Schema
export const NewPRDSchema = z.object({
  sections: PRDSectionsSchema,
  metadata: PRDMetadataSchema,
  // Validation information
  validation: z.object({
    is_valid: z.boolean(),
    issues: z.array(z.string()),
    warnings: z.array(z.string())
  }).optional()
});

// Flattened compatibility interface (used by backend for HTTP responses)
export const FlattenedPRDSchema = z.object({
  problemStatement: z.string().optional().describe('Derived from solution section if needed'),
  solutionOverview: z.string().describe('From solution.solutionOverview'),
  targetUsers: z.array(z.string()).describe('From targetUsers.targetUsers'),
  goals: z.array(z.string()).describe('From keyFeatures.keyFeatures (mapped to goals for compatibility)'),
  successMetrics: z.array(SuccessMetricSchema).describe('From successMetrics.successMetrics'),
  constraints: z.array(z.string()).describe('From constraints.constraints'),
  assumptions: z.array(z.string()).describe('From constraints.assumptions'),
  // Include sections and metadata for full access
  sections: PRDSectionsSchema.optional(),
  metadata: PRDMetadataSchema.optional()
});

// Type exports
export type TargetUsersSection = z.infer<typeof TargetUsersSectionSchema>;
export type SolutionSection = z.infer<typeof SolutionSectionSchema>;
export type KeyFeaturesSection = z.infer<typeof KeyFeaturesSectionSchema>;
export type SuccessMetricsSection = z.infer<typeof SuccessMetricsSectionSchema>;
export type ConstraintsSection = z.infer<typeof ConstraintsSectionSchema>;

export type PRDSections = z.infer<typeof PRDSectionsSchema>;
export type PRDMetadata = z.infer<typeof PRDMetadataSchema>;
export type NewPRD = z.infer<typeof NewPRDSchema>;
export type FlattenedPRD = z.infer<typeof FlattenedPRDSchema>;

export type SuccessMetric = z.infer<typeof SuccessMetricSchema>;

// Helper function to convert flattened PRD to new structure
export function convertToNewPRD(flatPRD: FlattenedPRD): NewPRD {
  return {
    sections: {
      targetUsers: flatPRD.targetUsers ? { targetUsers: flatPRD.targetUsers } : undefined,
      solution: flatPRD.solutionOverview ? { 
        solutionOverview: flatPRD.solutionOverview,
        approach: '' // Will be empty for converted PRDs
      } : undefined,
      keyFeatures: flatPRD.goals ? { keyFeatures: flatPRD.goals } : undefined,
      successMetrics: flatPRD.successMetrics ? { successMetrics: flatPRD.successMetrics } : undefined,
      constraints: (flatPRD.constraints || flatPRD.assumptions) ? {
        constraints: flatPRD.constraints || [],
        assumptions: flatPRD.assumptions || []
      } : undefined
    },
    metadata: flatPRD.metadata || {
      version: '2.0',
      lastUpdated: new Date().toISOString(),
      generatedBy: 'PRD Orchestrator Agent',
      sections_generated: []
    }
  };
}

// Helper function to check if object is a new PRD structure
export function isNewPRD(obj: any): obj is NewPRD {
  return obj && typeof obj === 'object' && obj.sections && typeof obj.sections === 'object';
}

// Helper function to check if object is a flattened PRD structure
export function isFlattenedPRD(obj: any): obj is FlattenedPRD {
  return obj && 
         typeof obj === 'object' && 
         typeof obj.solutionOverview === 'string' && 
         Array.isArray(obj.targetUsers) &&
         Array.isArray(obj.successMetrics);
}