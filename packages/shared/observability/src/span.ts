/**
 * Span utilities for step-level observability
 */

import { startActiveObservation } from "@langfuse/tracing";
import { getObservabilityTransport, isObservabilityEnabled } from "./init.js";
import type { SpanContext, SpanType } from "./types.js";

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

  if (getObservabilityTransport() === "ingestion") {
    return fn();
  }

  const spanName = `${context.type}:${context.name}`;

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
        output: result,
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
