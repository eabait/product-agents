/**
 * Configuration loading for observability
 */

export interface ObservabilityConfig {
  enabled: boolean;
  secretKey: string;
  publicKey: string;
  baseUrl: string;
  transport: "otel" | "ingestion";
}

export function getObservabilityConfig(): ObservabilityConfig {
  return {
    enabled: process.env.OBSERVABILITY_ENABLED !== "false",
    secretKey: process.env.LANGFUSE_SECRET_KEY ?? "",
    publicKey: process.env.LANGFUSE_PUBLIC_KEY ?? "",
    baseUrl: process.env.LANGFUSE_BASE_URL ?? "http://localhost:3100",
    transport:
      process.env.OBSERVABILITY_TRANSPORT === "otel" ? "otel" : "ingestion",
  };
}

export function isObservabilityConfigured(): boolean {
  const config = getObservabilityConfig();
  return config.enabled && !!config.secretKey && !!config.publicKey;
}
