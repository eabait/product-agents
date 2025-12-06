import { z } from 'zod';
import { BaseAnalyzer } from './base-analyzer.ts';
import { createSectionDetectionPrompt } from '../prompts/section-detection.ts';
import { assessConfidence, assessInputCompleteness, assessContextRichness } from '@product-agents/prd-shared';
const normalizeReasoning = (value) => {
    if (typeof value === 'string') {
        return { summary: value };
    }
    if (value && typeof value === 'object') {
        const record = {};
        for (const [key, entry] of Object.entries(value)) {
            if (typeof entry === 'string') {
                record[key] = entry;
                continue;
            }
            if (entry && typeof entry === 'object') {
                // Flatten nested objects such as excluded_sections
                for (const [nestedKey, nestedValue] of Object.entries(entry)) {
                    if (typeof nestedValue === 'string') {
                        record[`${key}_${nestedKey}`] = nestedValue;
                    }
                }
            }
        }
        return record;
    }
    return {};
};
// Schema for section detection response
const SectionDetectionResultSchema = z.object({
    affectedSections: z.array(z.enum(['targetUsers', 'solution', 'keyFeatures', 'successMetrics', 'constraints'])),
    reasoning: z.any().transform(normalizeReasoning),
    confidence: z.enum(['high', 'medium', 'low'])
});
export class SectionDetectionAnalyzer extends BaseAnalyzer {
    async analyze(input) {
        const result = await this.generateStructured({
            schema: SectionDetectionResultSchema,
            prompt: createSectionDetectionPrompt(input.message, input.existingPRD || input.context?.existingPRD),
            temperature: 0.1 // Low temperature for consistent section detection
        });
        // Build confidence assessment
        const confidenceAssessment = assessConfidence({
            inputCompleteness: assessInputCompleteness(input.message, input.context?.contextPayload),
            contextRichness: assessContextRichness(input.context?.contextPayload),
            validationSuccess: result.affectedSections.length > 0,
            hasErrors: result.affectedSections.length === 0,
            contentSpecificity: result.confidence === 'high' ? 'high' : result.confidence === 'medium' ? 'medium' : 'low'
        });
        // If no sections detected, this might be an error - provide fallback logic
        if (result.affectedSections.length === 0) {
            console.warn('SectionDetectionAnalyzer: No sections detected, using fallback logic');
            // Conservative fallback - only update keyFeatures if it mentions features/functionality
            const message = input.message.toLowerCase();
            const fallbackSections = [];
            if (message.includes('feature') ||
                message.includes('function') ||
                message.includes('capability')) {
                fallbackSections.push('keyFeatures');
            }
            return {
                name: 'sectionDetection',
                data: {
                    affectedSections: fallbackSections,
                    reasoning: {
                        fallback: 'Used fallback logic due to unclear section detection'
                    },
                    confidence: 'low'
                },
                confidence: {
                    level: 'low',
                    reasons: ['Fallback logic used due to unclear input'],
                    factors: {
                        inputCompleteness: 'low',
                        contextRichness: 'low',
                        validationSuccess: false,
                        contentSpecificity: 'low'
                    }
                },
                metadata: this.composeMetadata({
                    sections_count: fallbackSections.length,
                    used_fallback: true
                })
            };
        }
        return {
            name: 'sectionDetection',
            data: {
                ...result,
                reasoning: normalizeReasoning(result.reasoning)
            },
            confidence: confidenceAssessment,
            metadata: this.composeMetadata({
                sections_count: result.affectedSections.length,
                ai_confidence: result.confidence,
                used_fallback: false
            })
        };
    }
}
