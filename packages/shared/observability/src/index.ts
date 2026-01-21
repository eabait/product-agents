/**
 * Observability package - Langfuse integration for tracing
 *
 * @example
 * ```typescript
 * import {
 *   initObservability,
 *   shutdownObservability,
 *   withTrace,
 *   withSpan,
 *   tracedGenerateText,
 * } from "@product-agents/observability";
 *
 * // Initialize at app startup
 * initObservability();
 *
 * // Create a trace for a run
 * await withTrace({ runId: "abc", artifactType: "prd" }, async () => {
 *   // Create spans for steps
 *   await withSpan({ name: "step-1", type: "step" }, async () => {
 *     // Use traced LLM calls
 *     const result = await tracedGenerateText({
 *       model: myModel,
 *       prompt: "Hello",
 *     });
 *   });
 * });
 *
 * // Shutdown before exit
 * await shutdownObservability();
 * ```
 */

// Initialization
export {
  initObservability,
  shutdownObservability,
  isObservabilityEnabled,
  getObservabilityTransport,
} from "./init.js";

// Configuration
export {
  getObservabilityConfig,
  isObservabilityConfigured,
  type ObservabilityConfig,
} from "./config.js";

// Tracing
export { withTrace } from "./trace.js";
export {
  withSpan,
  createStepSpan,
  createSubagentSpan,
  createSkillSpan,
  createVerificationSpan,
  createPlanSpan,
} from "./span.js";

// LLM wrappers
export {
  tracedGenerateText,
  tracedStreamText,
  type TracedGenerateTextOptions,
  type TracedStreamTextOptions,
} from "./llm.js";

// Ingestion helpers
export {
  recordGeneration,
  runWithTraceContext,
  ingestSpanCreate,
  ingestSpanUpdate,
  getActiveTraceId,
  getActiveSpanId,
  runWithSpanContext,
  type SpanRecord,
} from "./ingestion.js";

// Types
export type {
  TraceContext,
  SpanContext,
  SpanType,
  ObservabilityState,
  ObservabilityTransport,
} from "./types.js";
