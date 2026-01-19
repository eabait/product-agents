/**
 * Trace management for run-level observability
 */

import { startActiveObservation } from "@langfuse/tracing";
import { getObservabilityTransport, isObservabilityEnabled } from "./init.js";
import type { TraceContext } from "./types.js";
import { ingestTraceCreate, runWithTraceContext } from "./ingestion.js";

/**
 * Execute a function within a Langfuse trace context.
 * Creates a top-level trace for a run.
 *
 * @example
 * ```typescript
 * const result = await withTrace(
 *   { runId: "abc123", artifactType: "prd", model: "gpt-4o" },
 *   async () => {
 *     return await controller.start(request);
 *   }
 * );
 * ```
 */
export async function withTrace<T>(
  context: TraceContext,
  fn: () => Promise<T>
): Promise<T> {
  // If observability is not enabled, just run the function
  if (!isObservabilityEnabled()) {
    return fn();
  }

  if (getObservabilityTransport() === "ingestion") {
    await ingestTraceCreate(context);
    return runWithTraceContext(context.runId, fn);
  }

  return startActiveObservation(`run:${context.runId}`, async (observation) => {
    observation.update({
      input: {
        artifactType: context.artifactType,
        model: context.model,
      },
      metadata: {
        runId: context.runId,
        artifactType: context.artifactType,
        ...context.metadata,
      },
      tags: ["run", context.artifactType],
    } as any);

    try {
      const result = await fn();

      observation.update({
        output: { status: "completed" },
      });

      return result;
    } catch (error) {
      observation.update({
        output: { status: "failed", error: String(error) },
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
