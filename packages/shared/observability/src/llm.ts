/**
 * LLM call wrappers with telemetry enabled
 */

import { generateText, streamText } from "ai";
import { getObservabilityTransport, isObservabilityEnabled } from "./init.js";

// Re-export types for convenience
export type { GenerateTextResult, StreamTextResult } from "ai";

export type TracedGenerateTextOptions = Parameters<typeof generateText>[0];
export type TracedStreamTextOptions = Parameters<typeof streamText>[0];

/**
 * Wrapper around Vercel AI SDK's generateText with telemetry enabled.
 * Automatically captures the LLM call as a generation in Langfuse.
 *
 * @example
 * ```typescript
 * const result = await tracedGenerateText({
 *   model: openrouter("openai/gpt-4o"),
 *   system: "You are a helpful assistant.",
 *   prompt: "Hello!",
 * });
 * ```
 */
export function tracedGenerateText(
  options: TracedGenerateTextOptions
): ReturnType<typeof generateText> {
  const telemetryEnabled =
    isObservabilityEnabled() && getObservabilityTransport() === "otel";
  const modelId =
    typeof (options.model as { modelId?: string })?.modelId === "string"
      ? (options.model as { modelId?: string }).modelId
      : undefined;

  return generateText({
    ...options,
    experimental_telemetry: {
      isEnabled: telemetryEnabled,
      ...(modelId ? { metadata: { modelId } } : {}),
    },
  });
}

/**
 * Wrapper around Vercel AI SDK's streamText with telemetry enabled.
 * Automatically captures the streaming LLM call as a generation in Langfuse.
 *
 * @example
 * ```typescript
 * const stream = tracedStreamText({
 *   model: openrouter("openai/gpt-4o"),
 *   system: "You are a helpful assistant.",
 *   prompt: "Tell me a story.",
 * });
 *
 * for await (const chunk of stream.textStream) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */
export function tracedStreamText(
  options: TracedStreamTextOptions
): ReturnType<typeof streamText> {
  const telemetryEnabled =
    isObservabilityEnabled() && getObservabilityTransport() === "otel";
  const modelId =
    typeof (options.model as { modelId?: string })?.modelId === "string"
      ? (options.model as { modelId?: string }).modelId
      : undefined;

  return streamText({
    ...options,
    experimental_telemetry: {
      isEnabled: telemetryEnabled,
      ...(modelId ? { metadata: { modelId } } : {}),
    },
  });
}
