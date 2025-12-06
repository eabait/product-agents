import { z } from 'zod';
// Categorical confidence levels
export const ConfidenceLevelSchema = z.enum(['high', 'medium', 'low']);
// Confidence assessment with reasoning
export const ConfidenceAssessmentSchema = z.object({
    level: ConfidenceLevelSchema,
    reasons: z.array(z.string()),
    factors: z
        .object({
        inputCompleteness: ConfidenceLevelSchema.optional(),
        contextRichness: ConfidenceLevelSchema.optional(),
        validationSuccess: z.boolean().optional(),
        contentSpecificity: ConfidenceLevelSchema.optional()
    })
        .optional()
});
const UsageMetricsSchema = z.object({
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    totalTokens: z.number().optional(),
    promptCost: z.number().optional(),
    completionCost: z.number().optional(),
    totalCost: z.number().optional(),
    currency: z.string().optional(),
    model: z.string().optional(),
    provider: z.string().optional(),
    rawUsage: z.record(z.any()).optional()
});
const UsageEntrySchema = z.object({
    name: z.string(),
    category: z.enum(['analyzer', 'section', 'orchestrator', 'clarification', 'other']),
    usage: UsageMetricsSchema,
    metadata: z.record(z.any()).optional()
});
const UsageSummarySchema = z.object({
    promptTokens: z.number().optional(),
    completionTokens: z.number().optional(),
    totalTokens: z.number().optional(),
    promptCost: z.number().optional(),
    completionCost: z.number().optional(),
    totalCost: z.number().optional(),
    currency: z.string().optional(),
    entries: z.array(UsageEntrySchema)
});
// Modern PRD Schema focused on section-based structure
export const PRDSchema = z.object({
    // Core sections (simplified 5-section structure)
    sections: z.object({
        targetUsers: z.any().optional(), // TargetUsersSection
        solution: z.any().optional(), // SolutionSection
        keyFeatures: z.any().optional(), // KeyFeaturesSection
        successMetrics: z.any().optional(), // SuccessMetricsSection
        constraints: z.any().optional() // ConstraintsSection
    }),
    // Metadata
    metadata: z.object({
        version: z.string().default('2.0'),
        lastUpdated: z.string(),
        generatedBy: z.string().default('PRD Orchestrator Agent'),
        sections_generated: z.array(z.string()),
        confidence_assessments: z.record(ConfidenceAssessmentSchema).optional(),
        overall_confidence: ConfidenceAssessmentSchema.optional(),
        processing_time_ms: z.number().optional()
    }),
    // Validation
    validation: z
        .object({
        is_valid: z.boolean(),
        issues: z.array(z.string()),
        warnings: z.array(z.string())
    })
        .optional(),
    // Flattened fields for frontend compatibility (auto-generated from sections)
    problemStatement: z.string().optional(),
    solutionOverview: z.string().optional(),
    targetUsers: z.array(z.string()).optional(),
    goals: z.array(z.string()).optional(),
    successMetrics: z
        .array(z.object({
        metric: z.string(),
        target: z.string(),
        timeline: z.string()
    }))
        .optional(),
    constraints: z.array(z.string()).optional(),
    assumptions: z.array(z.string()).optional()
});
// Section-specific operation schemas
export const SectionOperationSchema = z.object({
    operation: z.enum(['generate', 'update', 'regenerate']),
    section: z.enum(['targetUsers', 'solution', 'keyFeatures', 'successMetrics', 'constraints']),
    input: z.object({
        message: z.string(),
        context: z
            .object({
            contextPayload: z.any().optional(),
            existingPRD: z.any().optional(),
            existingSection: z.any().optional(),
            targetSection: z.string().optional()
        })
            .optional()
    })
});
// Section routing request
const SubAgentSettingsSchema = z.object({
    model: z.string(),
    temperature: z.number().optional(),
    maxTokens: z.number().optional(),
    apiKey: z.string().optional(),
    advanced: z.record(z.any()).optional()
});
export const SectionRoutingRequestSchema = z.object({
    message: z.string(),
    context: z
        .object({
        contextPayload: z.any().optional(),
        existingPRD: z.any().optional(),
        conversationHistory: z.array(z.any()).optional()
    })
        .optional(),
    settings: z
        .object({
        model: z.string(),
        temperature: z.number(),
        maxTokens: z.number(),
        apiKey: z.string().optional(),
        subAgentSettings: z.record(z.string(), SubAgentSettingsSchema).optional()
    })
        .optional(),
    targetSections: z.array(z.string()).optional() // Specific sections to update
});
// Section routing response
export const SectionRoutingResponseSchema = z.object({
    sections: z.record(z.any()), // Map of section name to section content
    metadata: z.object({
        sections_updated: z.array(z.string()),
        confidence_assessments: z.record(ConfidenceAssessmentSchema),
        overall_confidence: ConfidenceAssessmentSchema,
        processing_time_ms: z.number(),
        should_regenerate_prd: z.boolean(),
        usage: UsageSummarySchema.optional()
    }),
    validation: z.object({
        is_valid: z.boolean(),
        issues: z.array(z.string()),
        warnings: z.array(z.string())
    })
});
// Clarification schemas - for internal analyzer use
export const ClarificationResultSchema = z.object({
    needsClarification: z.boolean(),
    confidence: ConfidenceAssessmentSchema,
    missingCritical: z.array(z.string()),
    questions: z.array(z.string()),
    usage: UsageSummarySchema.optional()
});
