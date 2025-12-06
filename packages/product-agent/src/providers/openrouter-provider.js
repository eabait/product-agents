import { createOpenRouter } from '@openrouter/ai-sdk-provider';
export const DEFAULT_OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const buildHeaders = (headers) => {
    const defaults = {
        'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER ??
            process.env.OPENROUTER_REFERER ??
            process.env.HTTP_REFERER,
        'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'product-agents',
        'X-OpenRouter-Provider': process.env.OPENROUTER_PROVIDER
    };
    return Object.entries({ ...defaults, ...(headers ?? {}) }).reduce((acc, [key, value]) => {
        if (value) {
            acc[key] = value;
        }
        return acc;
    }, {});
};
/**
 * Factory for an OpenRouter provider using the AI SDK OpenRouter transport.
 * Uses runtime defaults (base URL, model) plus env overrides for keys/headers.
 */
export const createOpenRouterProvider = (config, options) => {
    const baseURL = options?.baseURL ?? process.env.OPENROUTER_BASE_URL ?? DEFAULT_OPENROUTER_BASE_URL;
    const apiKey = options?.apiKey ??
        process.env.OPENROUTER_API_KEY ??
        '';
    const provider = createOpenRouter({
        apiKey,
        baseURL,
        headers: buildHeaders(options?.headers),
        compatibility: options?.compatibility ?? 'strict',
        fetch: options?.fetch,
        extraBody: {
            usage: {
                include: true
            }
        }
    });
    return provider;
};
/**
 * Helper to resolve a language model handle from the provider with runtime defaults.
 */
export const resolveOpenRouterModel = (provider, config, modelId) => provider(modelId ?? config.runtime.defaultModel);
