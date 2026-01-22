/**
 * Types for the observability package
 */

export type SpanType = "step" | "subagent" | "skill" | "verification" | "plan" | "approval";
export type ObservabilityTransport = "otel" | "ingestion";

export interface TraceContext {
  runId: string;
  artifactType: string;
  model?: string;
  metadata?: Record<string, unknown>;
}

export interface SpanContext {
  name: string;
  type: SpanType;
  stepId?: string;
  input?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ObservabilityState {
  initialized: boolean;
  enabled: boolean;
  transport?: ObservabilityTransport;
}
