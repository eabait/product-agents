import { z } from 'zod';
import { BaseSectionWriter } from './base-section-writer.ts';
import { createSolutionSectionPrompt } from '../prompts/index.ts';
import { assessConfidence, assessInputCompleteness, assessContextRichness, assessContentSpecificity, MIN_SOLUTION_OVERVIEW_LENGTH, MIN_SOLUTION_APPROACH_LENGTH } from '@product-agents/prd-shared';
const SolutionSectionSchema = z.object({
    solutionOverview: z.string(),
    approach: z.string()
});
export class SolutionSectionWriter extends BaseSectionWriter {
    constructor(settings) {
        super(settings);
    }
    getSectionName() {
        return 'solution';
    }
    async writeSection(input) {
        if (!this.shouldRegenerateSection(input)) {
            return {
                name: this.getSectionName(),
                content: input.context?.existingSection,
                shouldRegenerate: false
            };
        }
        // Use shared context analysis results with fallback
        const contextAnalysis = input.context?.sharedAnalysisResults?.get('contextAnalysis');
        // If context analysis failed, create a minimal fallback
        const contextData = contextAnalysis?.data || {
            themes: [],
            requirements: {
                functional: [],
                technical: [],
                user_experience: [],
                epics: [],
                mvpFeatures: []
            },
            constraints: []
        };
        const prompt = this.createSolutionPrompt(input, contextData);
        const rawSection = await this.generateStructuredWithFallback({
            schema: SolutionSectionSchema,
            prompt,
            temperature: 0.25 // Lower temperature for consistent solution approach
        });
        const validation = this.validateSolutionSection(rawSection);
        // Assess confidence based on actual factors
        const confidenceAssessment = assessConfidence({
            inputCompleteness: assessInputCompleteness(input.message, input.context?.contextPayload),
            contextRichness: assessContextRichness(input.context?.contextPayload),
            contentSpecificity: assessContentSpecificity(rawSection),
            validationSuccess: validation.isValid,
            hasErrors: false,
            contentLength: JSON.stringify(rawSection).length
        });
        return {
            name: this.getSectionName(),
            content: rawSection,
            confidence: confidenceAssessment,
            metadata: this.composeMetadata({
                solution_overview_length: rawSection.solutionOverview.length,
                approach_length: rawSection.approach.length,
                validation_issues: validation.issues,
                source_analyzers: ['contextAnalysis']
            }),
            shouldRegenerate: true
        };
    }
    createSolutionPrompt(input, contextAnalysis) {
        return createSolutionSectionPrompt(input, contextAnalysis);
    }
    validateSolutionSection(section) {
        const issues = [];
        if (!section.solutionOverview || section.solutionOverview.length < MIN_SOLUTION_OVERVIEW_LENGTH) {
            issues.push(`Solution overview is too short (should be at least ${MIN_SOLUTION_OVERVIEW_LENGTH} characters)`);
        }
        if (!section.approach || section.approach.length < MIN_SOLUTION_APPROACH_LENGTH) {
            issues.push(`Solution approach is too brief (should be at least ${MIN_SOLUTION_APPROACH_LENGTH} characters)`);
        }
        if (section.solutionOverview.toLowerCase().includes('tbd') ||
            section.solutionOverview.toLowerCase().includes('to be determined')) {
            issues.push('Solution overview contains placeholder text');
        }
        return {
            isValid: issues.length === 0,
            issues
        };
    }
}
