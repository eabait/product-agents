/**
 * Unit tests for observability package
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock environment before importing modules
const mockEnv = {
  OBSERVABILITY_ENABLED: "true",
  LANGFUSE_SECRET_KEY: "test-secret",
  LANGFUSE_PUBLIC_KEY: "test-public",
  LANGFUSE_BASE_URL: "http://localhost:3100",
  OBSERVABILITY_TRANSPORT: "ingestion",
};

describe("observability config", () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset environment for each test
    Object.assign(process.env, mockEnv);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should load config from environment variables", async () => {
    const { getObservabilityConfig } = await import("../config.js");
    const config = getObservabilityConfig();

    expect(config.enabled).toBe(true);
    expect(config.secretKey).toBe("test-secret");
    expect(config.publicKey).toBe("test-public");
    expect(config.baseUrl).toBe("http://localhost:3100");
    expect(config.transport).toBe("ingestion");
  });

  it("should detect when observability is configured", async () => {
    const { isObservabilityConfigured } = await import("../config.js");
    expect(isObservabilityConfigured()).toBe(true);
  });

  it("should detect when observability is not configured (missing keys)", async () => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;

    const { isObservabilityConfigured } = await import("../config.js");
    expect(isObservabilityConfigured()).toBe(false);
  });

  it("should detect when observability is disabled via env", async () => {
    process.env.OBSERVABILITY_ENABLED = "false";

    const { getObservabilityConfig, isObservabilityConfigured } = await import(
      "../config.js"
    );
    expect(getObservabilityConfig().enabled).toBe(false);
    expect(isObservabilityConfigured()).toBe(false);
  });

  it("should default to ingestion transport", async () => {
    delete process.env.OBSERVABILITY_TRANSPORT;

    const { getObservabilityConfig } = await import("../config.js");
    expect(getObservabilityConfig().transport).toBe("ingestion");
  });

  it("should use otel transport when configured", async () => {
    process.env.OBSERVABILITY_TRANSPORT = "otel";

    const { getObservabilityConfig } = await import("../config.js");
    expect(getObservabilityConfig().transport).toBe("otel");
  });
});

describe("span utilities", () => {
  it("should create step span context", async () => {
    const { createStepSpan } = await import("../span.js");

    const span = createStepSpan("step-1", "Problem Statement", { prompt: "test" });

    expect(span).toEqual({
      name: "Problem Statement",
      type: "step",
      stepId: "step-1",
      input: { prompt: "test" },
    });
  });

  it("should create subagent span context", async () => {
    const { createSubagentSpan } = await import("../span.js");

    const span = createSubagentSpan("research-subagent", "research", {
      topic: "test",
    });

    expect(span).toEqual({
      name: "research-subagent",
      type: "subagent",
      input: { topic: "test" },
      metadata: { artifactKind: "research" },
    });
  });

  it("should create skill span context", async () => {
    const { createSkillSpan } = await import("../span.js");

    const span = createSkillSpan("analyze-skill", { data: "test" });

    expect(span).toEqual({
      name: "analyze-skill",
      type: "skill",
      input: { data: "test" },
    });
  });

  it("should create verification span context", async () => {
    const { createVerificationSpan } = await import("../span.js");

    const span = createVerificationSpan({ artifact: "test" });

    expect(span).toEqual({
      name: "verify",
      type: "verification",
      input: { artifact: "test" },
    });
  });

  it("should create plan span context", async () => {
    const { createPlanSpan } = await import("../span.js");

    const span = createPlanSpan({ request: "test" });

    expect(span).toEqual({
      name: "generate",
      type: "plan",
      input: { request: "test" },
    });
  });
});

describe("withSpan (disabled mode)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OBSERVABILITY_ENABLED = "false";
  });

  it("should execute function directly when observability is disabled", async () => {
    const { withSpan } = await import("../span.js");

    const result = await withSpan(
      { name: "test", type: "step" },
      async () => {
        return "test-result";
      }
    );

    expect(result).toBe("test-result");
  });

  it("should propagate errors when observability is disabled", async () => {
    const { withSpan } = await import("../span.js");

    await expect(
      withSpan({ name: "test", type: "step" }, async () => {
        throw new Error("test-error");
      })
    ).rejects.toThrow("test-error");
  });
});

describe("withTrace (disabled mode)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OBSERVABILITY_ENABLED = "false";
  });

  it("should execute function directly when observability is disabled", async () => {
    const { withTrace } = await import("../trace.js");

    const result = await withTrace(
      { runId: "test-run", artifactType: "prd" },
      async () => {
        return { success: true };
      }
    );

    expect(result).toEqual({ success: true });
  });

  it("should propagate errors when observability is disabled", async () => {
    const { withTrace } = await import("../trace.js");

    await expect(
      withTrace({ runId: "test-run", artifactType: "prd" }, async () => {
        throw new Error("trace-error");
      })
    ).rejects.toThrow("trace-error");
  });
});

describe("exports", () => {
  it("should export all public APIs", async () => {
    const exports = await import("../index.js");

    // Initialization
    expect(exports.initObservability).toBeDefined();
    expect(exports.shutdownObservability).toBeDefined();
    expect(exports.isObservabilityEnabled).toBeDefined();

    // Configuration
    expect(exports.getObservabilityConfig).toBeDefined();
    expect(exports.isObservabilityConfigured).toBeDefined();

    // Tracing
    expect(exports.withTrace).toBeDefined();
    expect(exports.withSpan).toBeDefined();
    expect(exports.createStepSpan).toBeDefined();
    expect(exports.createSubagentSpan).toBeDefined();
    expect(exports.createSkillSpan).toBeDefined();
    expect(exports.createVerificationSpan).toBeDefined();
    expect(exports.createPlanSpan).toBeDefined();

    // LLM wrappers
    expect(exports.tracedGenerateText).toBeDefined();
    expect(exports.tracedStreamText).toBeDefined();

    // Ingestion
    expect(exports.recordGeneration).toBeDefined();
  });
});
