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

  const now = new Date().toISOString();
  const event = {
    type: "generation-create",
    id: randomUUID(),
    timestamp: now,
    body: {
      id: randomUUID(),
      traceId,
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
