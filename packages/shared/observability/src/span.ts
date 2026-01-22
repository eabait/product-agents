/**
 * Span utilities for step-level observability
 */

import { startActiveObservation } from "@langfuse/tracing";
import { getObservabilityTransport, isObservabilityEnabled } from "./init.js";
import {
  getActiveTraceId,
  ingestSpanCreate,
  ingestSpanUpdate,
  runWithTraceContext,
  runWithSpanContext,
} from "./ingestion.js";
import type { SpanContext, SpanType } from "./types.js";

const MAX_SPAN_OUTPUT_CHARS = 4096;

const formatSpanOutput = (output: unknown): unknown => {
  if (output === null || output === undefined) {
    return output;
  }
  if (typeof output === "string") {
    if (output.length <= MAX_SPAN_OUTPUT_CHARS) {
      return output;
    }
    return {
      truncated: true,
      preview: `${output.slice(0, MAX_SPAN_OUTPUT_CHARS - 3)}...`,
    };
  }
  if (typeof output !== "object") {
    return output;
  }
  try {
    const serialized = JSON.stringify(output);
    if (serialized.length <= MAX_SPAN_OUTPUT_CHARS) {
      return output;
    }
    return {
      truncated: true,
      preview: `${serialized.slice(0, MAX_SPAN_OUTPUT_CHARS - 3)}...`,
    };
  } catch {
    return { truncated: true, preview: "[unserializable output]" };
  }
};

const resolveSpanTraceId = (context: SpanContext): string | undefined => {
  const fromMetadata = context.metadata as Record<string, unknown> | undefined;
  const fromInput = context.input as Record<string, unknown> | undefined;
  const candidate =
    (fromMetadata?.runId as string | undefined) ??
    (fromMetadata?.traceId as string | undefined) ??
    (fromInput?.runId as string | undefined) ??
    (fromInput?.traceId as string | undefined);
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return undefined;
};

/**
 * Execute a function within a Langfuse span context.
 * Automatically nests within any active parent trace/span.
 *
 * @example
 * ```typescript
 * const result = await withSpan(
 *   { name: "problem-statement", type: "step", stepId: "step-1" },
 *   async () => {
 *     return await executeSkill(skill, context);
 *   }
 * );
 * ```
 */
export async function withSpan<T>(
  context: SpanContext,
  fn: () => Promise<T>
): Promise<T> {
  // If observability is not enabled, just run the function
  if (!isObservabilityEnabled()) {
    return fn();
  }

  const spanName = `${context.type}:${context.name}`;

  // Use ingestion API for ingestion transport
  if (getObservabilityTransport() === "ingestion") {
    const activeTraceId = getActiveTraceId();
    const resolvedTraceId = activeTraceId ?? resolveSpanTraceId(context);
    if (!resolvedTraceId) {
      console.warn("[observability] Cannot create span without active trace");
      return fn();
    }

    const runWithinTrace = <TResult>(fnWithTrace: () => Promise<TResult>) => {
      if (activeTraceId) {
        return fnWithTrace();
      }
      return runWithTraceContext(resolvedTraceId, fnWithTrace);
    };

    return runWithinTrace(async () => {
      const startTime = new Date().toISOString();
      const spanId = await ingestSpanCreate({
        traceId: resolvedTraceId,
        name: spanName,
        startTime,
        input: context.input,
        metadata: {
          type: context.type,
          stepId: context.stepId,
          ...context.metadata,
        },
        tags: [context.type],
      });

      // Run the function within span context so nested spans/generations are parented correctly
      const executeWithContext = async () => {
        try {
          const result = await fn();
          const output = formatSpanOutput(result);

          if (spanId) {
            await ingestSpanUpdate(spanId, {
              output,
              endTime: new Date().toISOString(),
            });
          }

          return result;
        } catch (error) {
          if (spanId) {
            await ingestSpanUpdate(spanId, {
              output: { error: String(error) },
              metadata: {
                ...context.metadata,
                error: true,
                errorMessage: error instanceof Error ? error.message : String(error),
              },
              endTime: new Date().toISOString(),
            });
          }
          throw error;
        }
      };

      // If we have a span ID, run within that context; otherwise just execute
      if (spanId) {
        return runWithSpanContext(spanId, executeWithContext);
      }
      return executeWithContext();
    });
  }

  // Use OTEL for otel transport
  return startActiveObservation(spanName, async (observation) => {
    observation.update({
      input: context.input,
      metadata: {
        type: context.type,
        stepId: context.stepId,
        ...context.metadata,
      },
      tags: [context.type],
    } as any);

    try {
      const result = await fn();

      observation.update({
        output: formatSpanOutput(result),
      });

      return result;
    } catch (error) {
      observation.update({
        output: { error: String(error) },
        metadata: {
          ...context.metadata,
          error: true,
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  });
}

/**
 * Create a span context for a specific step.
 */
export function createStepSpan(
  stepId: string,
  label: string,
  input?: unknown
): SpanContext {
  return {
    name: label,
    type: "step",
    stepId,
    input,
  };
}

/**
 * Create a span context for subagent execution.
 */
export function createSubagentSpan(
  subagentId: string,
  artifactKind: string,
  input?: unknown
): SpanContext {
  return {
    name: subagentId,
    type: "subagent",
    input,
    metadata: { artifactKind },
  };
}

/**
 * Create a span context for skill execution.
 */
export function createSkillSpan(skillId: string, input?: unknown): SpanContext {
  return {
    name: skillId,
    type: "skill",
    input,
  };
}

/**
 * Create a span context for verification.
 */
export function createVerificationSpan(input?: unknown): SpanContext {
  return {
    name: "verify",
    type: "verification",
    input,
  };
}

/**
 * Create a span context for plan generation.
 */
export function createPlanSpan(input?: unknown): SpanContext {
  return {
    name: "generate",
    type: "plan",
    input,
  };
}

/**
 * Create a span context for approval wait tracking.
 */
export function createApprovalSpan(
  action: "requested" | "received",
  input?: unknown
): SpanContext {
  return {
    name: action,
    type: "approval",
    input,
  };
}
