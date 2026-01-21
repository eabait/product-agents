/**
 * Langfuse ingestion client (legacy HTTP endpoint) for self-hosted v2.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

import { LangfuseAPIClient } from "@langfuse/core";

import { getObservabilityConfig } from "./config.js";
import { getObservabilityTransport, isObservabilityEnabled } from "./init.js";
import type { TraceContext } from "./types.js";

type TraceStore = {
  traceId: string;
};

type SpanStore = {
  spanId: string;
};

export type GenerationRecord = {
  traceId?: string;
  name?: string;
  model: string;
  input?: unknown;
  output?: unknown;
  startTime?: string;
  endTime?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  modelParameters?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  costDetails?: Record<string, number>;
};

const traceStorage = new AsyncLocalStorage<TraceStore>();
const spanStorage = new AsyncLocalStorage<SpanStore>();
let ingestionClient: LangfuseAPIClient | null = null;

const isIngestionEnabled = () => {
  if (!isObservabilityEnabled()) return false;
  if (getObservabilityTransport() !== "ingestion") return false;
  const config = getObservabilityConfig();
  return !!config.secretKey && !!config.publicKey;
};

const getIngestionClient = () => {
  if (!isIngestionEnabled()) return null;
  if (ingestionClient) return ingestionClient;

  const config = getObservabilityConfig();
  ingestionClient = new LangfuseAPIClient({
    environment: "self-hosted",
    baseUrl: config.baseUrl,
    username: config.publicKey,
    password: config.secretKey,
  });
  return ingestionClient;
};

const ingestBatch = async (events: any[]) => {
  const client = getIngestionClient();
  if (!client) return;

  try {
    await client.ingestion.batch({ batch: events });
  } catch (error) {
    console.warn("[observability] ingestion failed:", error);
  }
};

export const runWithTraceContext = async <T>(
  traceId: string,
  fn: () => Promise<T>
): Promise<T> => {
  return traceStorage.run({ traceId }, fn);
};

export const getActiveTraceId = (): string | undefined => {
  return traceStorage.getStore()?.traceId;
};

export const getActiveSpanId = (): string | undefined => {
  return spanStorage.getStore()?.spanId;
};

export const runWithSpanContext = async <T>(
  spanId: string,
  fn: () => Promise<T>
): Promise<T> => {
  return spanStorage.run({ spanId }, fn);
};

export const ingestTraceCreate = async (
  context: TraceContext
): Promise<void> => {
  if (!isIngestionEnabled()) return;

  const now = new Date().toISOString();
  const event = {
    type: "trace-create",
    id: randomUUID(),
    timestamp: now,
    body: {
      id: context.runId,
      name: `run:${context.runId}`,
      input: {
        artifactType: context.artifactType,
        model: context.model,
      },
      metadata: context.metadata,
      tags: ["run", context.artifactType],
    },
  };

  await ingestBatch([event]);
};

export type SpanRecord = {
  traceId?: string;
  parentObservationId?: string;
  name: string;
  startTime?: string;
  endTime?: string;
  input?: unknown;
  output?: unknown;
  metadata?: Record<string, unknown>;
  tags?: string[];
};

/**
 * Create a span in Langfuse via ingestion API.
 * Returns the span ID for use as parentObservationId in nested spans.
 * Automatically nests under the current active span if no parent is specified.
 */
export const ingestSpanCreate = async (
  record: SpanRecord
): Promise<string | undefined> => {
  if (!isIngestionEnabled()) return undefined;

  const traceId = record.traceId ?? getActiveTraceId();

  if (!traceId) {
    // Cannot create a span without a trace
    console.warn("[observability] Cannot create span without active trace");
    return undefined;
  }

  // Auto-nest under current span if no parent specified
  const parentSpanId = record.parentObservationId ?? getActiveSpanId();

  const spanId = randomUUID();
  const now = new Date().toISOString();
  const event = {
    type: "span-create",
    id: randomUUID(),
    timestamp: now,
    body: {
      id: spanId,
      traceId,
      parentObservationId: parentSpanId,
      name: record.name,
      startTime: record.startTime ?? now,
      endTime: record.endTime,
      input: record.input,
      output: record.output,
      metadata: record.metadata,
      tags: record.tags,
    },
  };

  try {
    await ingestBatch([event]);
  } catch (err) {
    console.error("[observability] Failed to create span:", err);
    return undefined;
  }
  return spanId;
};

/**
 * Update a span in Langfuse via ingestion API.
 */
export const ingestSpanUpdate = async (
  spanId: string,
  update: Partial<Omit<SpanRecord, "traceId" | "parentObservationId">>
): Promise<void> => {
  if (!isIngestionEnabled()) return;

  const traceId = getActiveTraceId();
  if (!traceId) return;

  const now = new Date().toISOString();
  const event = {
    type: "span-update",
    id: randomUUID(),
    timestamp: now,
    body: {
      id: spanId,
      traceId,
      ...update,
      endTime: update.endTime ?? now,
    },
  };

  await ingestBatch([event]);
};

export const recordGeneration = async (
  record: GenerationRecord
): Promise<void> => {
  if (!isIngestionEnabled()) return;

  let traceId = record.traceId ?? getActiveTraceId();

  if (!traceId) {
    traceId = randomUUID();
    await ingestTraceCreate({
      runId: traceId,
      artifactType: "generation",
      model: record.model,
      metadata: {
        orphanedGeneration: true,
      },
    });
  }

  // Link generation to current span if available
  const parentSpanId = getActiveSpanId();

  const now = new Date().toISOString();
  const event = {
    type: "generation-create",
    id: randomUUID(),
    timestamp: now,
    body: {
      id: randomUUID(),
      traceId,
      parentObservationId: parentSpanId,
      name: record.name ?? record.model,
      startTime: record.startTime ?? now,
      endTime: record.endTime ?? now,
      model: record.model,
      modelParameters: record.modelParameters,
      usage: record.usage,
      input: record.input,
      output: record.output,
      metadata: record.metadata,
      costDetails: record.costDetails,
    },
  };

  await ingestBatch([event]);
};
