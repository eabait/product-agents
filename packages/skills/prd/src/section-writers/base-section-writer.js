import { OpenRouterClient } from '@product-agents/openrouter-client';
import { ContextAnalyzer, ClarificationAnalyzer } from '../analyzers/index.ts';
import { CONTENT_VALIDATION } from '@product-agents/prd-shared';
export class BaseSectionWriter {
    settings;
    client;
    // Fallback analyzers (only used when shared analysis results are not available)
    contextAnalyzer;
    clarificationAnalyzer;
    constructor(settings) {
        this.settings = settings;
        this.client = new OpenRouterClient(settings?.apiKey);
        // Lazy initialization of analyzers - only created when needed for fallbacks
        // With centralized analysis, these are rarely used
    }
    async generateStructuredWithFallback(params) {
        try {
            return await this.client.generateStructured({
                model: this.settings.model,
                schema: params.schema,
                prompt: params.prompt,
                temperature: params.temperature ?? this.settings.temperature,
                maxTokens: params.maxTokens ?? this.settings.maxTokens,
                arrayFields: params.arrayFields
            });
        }
        catch (error) {
            const fallbackModel = this.settings.advanced?.fallbackModel;
            if (fallbackModel &&
                fallbackModel !== this.settings.model &&
                this.isModelNotFoundError(error)) {
                console.warn(`Model ${this.settings.model} unavailable for section writer ${this.getSectionName()}, falling back to ${fallbackModel}`);
                return this.client.generateStructured({
                    model: fallbackModel,
                    schema: params.schema,
                    prompt: params.prompt,
                    temperature: params.temperature ?? this.settings.temperature,
                    maxTokens: params.maxTokens ?? this.settings.maxTokens,
                    arrayFields: params.arrayFields
                });
            }
            throw error;
        }
    }
    /**
     * Determines if this writer should regenerate its section based on the input
     */
    shouldRegenerateSection(input) {
        // Default implementation - regenerate if section doesn't exist or is being directly targeted
        return (!input.context?.existingSection ||
            input.context?.targetSection === this.getSectionName());
    }
    /**
     * Prepares analyzer input from section writer input
     */
    prepareAnalyzerInput(input) {
        return {
            message: input.message,
            context: {
                contextPayload: input.context?.contextPayload,
                existingPRD: input.context?.existingPRD,
                previousResults: input.context?.previousResults
            }
        };
    }
    /**
     * Common logic for running multiple analyzers and collecting their results
     */
    async runAnalyzers(input, analyzers) {
        console.warn('⚠ Running individual analyzers - shared analysis results not available');
        this.initializeFallbackAnalyzers();
        const results = new Map();
        for (const analyzer of analyzers) {
            try {
                const result = await analyzer.analyze(input);
                results.set(result.name, result);
                // Update input context with new results for subsequent analyzers
                if (!input.context?.previousResults) {
                    if (!input.context)
                        input.context = {};
                    input.context.previousResults = new Map();
                }
                input.context.previousResults.set(result.name, result);
            }
            catch (error) {
                console.warn(`Analyzer ${analyzer.constructor.name} failed:`, error);
                // Continue with other analyzers even if one fails
            }
        }
        return results;
    }
    /**
     * Lazy initialization of fallback analyzers when shared analysis is not available
     */
    initializeFallbackAnalyzers() {
        if (!this.contextAnalyzer) {
            this.contextAnalyzer = new ContextAnalyzer(this.settings);
        }
        if (!this.clarificationAnalyzer) {
            this.clarificationAnalyzer = new ClarificationAnalyzer(this.settings);
        }
    }
    composeMetadata(baseMetadata) {
        const usage = this.client.getLastUsage();
        if (!usage) {
            return baseMetadata;
        }
        const existingUsage = baseMetadata && typeof baseMetadata.usage === 'object'
            ? baseMetadata.usage
            : undefined;
        return {
            ...(baseMetadata || {}),
            usage: {
                ...(existingUsage || {}),
                ...usage
            }
        };
    }
    /**
     * Validates that the generated section content meets quality standards
     */
    validateSectionContent(content) {
        const issues = [];
        if (!content) {
            issues.push('Section content is empty or undefined');
            return { isValid: false, issues };
        }
        if (typeof content === 'string') {
            if (content.trim().length < CONTENT_VALIDATION.MIN_CONTENT_LENGTH) {
                issues.push('Section content is too short');
            }
            if (content.includes('TODO') || content.includes('[TBD]')) {
                issues.push('Section contains placeholder text');
            }
        }
        return {
            isValid: issues.length === 0,
            issues
        };
    }
    isModelNotFoundError(error) {
        if (!error)
            return false;
        const statusCode = error.statusCode || error.response?.status;
        if (statusCode !== 404) {
            return false;
        }
        const message = typeof error.message === 'string' ? error.message : '';
        const body = typeof error.responseBody === 'string' ? error.responseBody : '';
        return message.includes('No endpoints found') || body.includes('No endpoints found');
    }
}
