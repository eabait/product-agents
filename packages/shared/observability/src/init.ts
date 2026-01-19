/**
 * Initialize observability with Langfuse via OpenTelemetry
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { getObservabilityConfig, isObservabilityConfigured } from "./config.js";
import type { ObservabilityState, ObservabilityTransport } from "./types.js";

let sdk: NodeSDK | null = null;
const state: ObservabilityState = {
  initialized: false,
  enabled: false,
  transport: undefined,
};

/**
 * Initialize observability with Langfuse.
 * Safe to call multiple times - only initializes once.
 */
export function initObservability(): ObservabilityState {
  if (state.initialized) {
    return state;
  }

  const config = getObservabilityConfig();
  state.transport = config.transport;

  if (!config.enabled) {
    console.log("[observability] Disabled via OBSERVABILITY_ENABLED=false");
    state.initialized = true;
    state.enabled = false;
    return state;
  }

  if (!isObservabilityConfigured()) {
    console.warn(
      "[observability] Missing LANGFUSE_SECRET_KEY or LANGFUSE_PUBLIC_KEY - tracing disabled"
    );
    state.initialized = true;
    state.enabled = false;
    return state;
  }

  if (config.transport === "ingestion") {
    state.initialized = true;
    state.enabled = true;
    console.log(
      `[observability] Initialized (ingestion) with Langfuse at ${config.baseUrl}`
    );
    return state;
  }

  try {
    sdk = new NodeSDK({
      spanProcessors: [
        new LangfuseSpanProcessor({
          secretKey: config.secretKey,
          publicKey: config.publicKey,
          baseUrl: config.baseUrl,
        }),
      ],
    });

    sdk.start();
    state.initialized = true;
    state.enabled = true;
    console.log(
      `[observability] Initialized (otel) with Langfuse at ${config.baseUrl}`
    );
  } catch (error) {
    console.error("[observability] Failed to initialize:", error);
    state.initialized = true;
    state.enabled = false;
  }

  return state;
}

/**
 * Shutdown observability, flushing any pending traces.
 * Call this before process exit.
 */
export async function shutdownObservability(): Promise<void> {
  if (sdk) {
    try {
      await sdk.shutdown();
      console.log("[observability] Shutdown complete, traces flushed");
    } catch (error) {
      console.error("[observability] Shutdown error:", error);
    }
    sdk = null;
  }
  state.initialized = false;
  state.enabled = false;
  state.transport = undefined;
}

/**
 * Check if observability is currently enabled and initialized.
 */
export function isObservabilityEnabled(): boolean {
  return state.enabled;
}

export function getObservabilityTransport():
  | ObservabilityTransport
  | undefined {
  return state.transport;
}
