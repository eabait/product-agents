import { z } from 'zod';
import { GenerationUsage } from '@product-agents/agent-core';
/**
 * OpenRouter client for AI model interactions with streaming support
 * Provides structured generation, text generation, and streaming capabilities
 */
export declare class OpenRouterClient {
    private provider;
    private lastUsage?;
    /**
     * Initialize OpenRouter client
     * @param apiKey - Optional API key, defaults to environment variable
     */
    constructor(apiKey?: string);
    getModel(modelName?: string): any;
    getLastUsage(): GenerationUsage | undefined;
    private resetUsage;
    private captureUsage;
    private coerceNumber;
    private normalizeCurrency;
    private extractProvider;
    private logUsage;
    generateStructured<T>(params: {
        model: string;
        schema: z.ZodSchema<T>;
        prompt: string;
        temperature?: number;
        maxTokens?: number;
        arrayFields?: string[];
    }): Promise<T>;
    /**
     * Sanitizes malformed AI responses that contain XML-like parameter tags mixed with JSON
     * Handles patterns like: {"field": "value", <parameter name="field2">value2</parameter>}
     */
    private sanitizeResponse;
    private ensureArrayFields;
    generateText(params: {
        model: string;
        prompt: string;
        temperature?: number;
        maxTokens?: number;
    }): Promise<string>;
    streamText(params: {
        model: string;
        prompt: string;
        temperature?: number;
    }): AsyncGenerator<string, void, unknown>;
    /**
     * Stream structured data generation with progress callbacks
     * Emits partial objects as they're being constructed by the AI
     * @param params - Configuration for streaming structured generation
     * @param params.model - Model identifier to use
     * @param params.schema - Zod schema for output validation
     * @param params.prompt - Input prompt for generation
     * @param params.temperature - Optional temperature setting (0-2)
     * @param params.maxTokens - Optional maximum tokens to generate
     * @param params.onProgress - Optional callback for progress updates
     * @returns AsyncIterableIterator yielding partial and complete objects
     */
    streamStructured<T>(params: {
        model: string;
        schema: z.ZodSchema<T>;
        prompt: string;
        temperature?: number;
        maxTokens?: number;
        onProgress?: (partialObject: Partial<T> | T, type: 'partial' | 'complete') => void;
    }): AsyncIterableIterator<{
        type: 'partial' | 'complete';
        object: Partial<T> | T;
    }>;
    /**
     * Utility method to consume the entire stream and return the final object
     * Useful when you want streaming progress but need the final result
     */
    generateStructuredWithProgress<T>(params: {
        model: string;
        schema: z.ZodSchema<T>;
        prompt: string;
        temperature?: number;
        maxTokens?: number;
        onProgress?: (partialObject: Partial<T>, type: 'partial' | 'complete') => void;
    }): Promise<T>;
}
export * from 'zod';
//# sourceMappingURL=index.d.ts.map