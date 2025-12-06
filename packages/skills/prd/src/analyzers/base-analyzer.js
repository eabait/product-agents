import { OpenRouterClient } from '@product-agents/openrouter-client';
export class BaseAnalyzer {
    client;
    settings;
    constructor(settings) {
        this.settings = settings;
        this.client = new OpenRouterClient(settings?.apiKey);
    }
    async generateStructured(params) {
        try {
            return await this.client.generateStructured({
                model: this.settings.model,
                schema: params.schema,
                prompt: params.prompt,
                temperature: params.temperature || this.settings.temperature,
                arrayFields: params.arrayFields
            });
        }
        catch (error) {
            const fallbackModel = this.settings.advanced?.fallbackModel;
            if (fallbackModel &&
                fallbackModel !== this.settings.model &&
                this.isModelNotFoundError(error)) {
                console.warn(`Model ${this.settings.model} unavailable for analyzer, falling back to ${fallbackModel}`);
                return this.client.generateStructured({
                    model: fallbackModel,
                    schema: params.schema,
                    prompt: params.prompt,
                    temperature: params.temperature || this.settings.temperature,
                    arrayFields: params.arrayFields
                });
            }
            throw error;
        }
    }
    async generateText(params) {
        return this.client.generateText({
            model: this.settings.model,
            prompt: params.prompt,
            temperature: params.temperature || this.settings.temperature,
            maxTokens: params.maxTokens
        });
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
