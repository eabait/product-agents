# Technical Design: Langfuse Observability Integration

**Status**: Draft
**Author**: Claude
**Date**: 2025-01-09

---

## 1. Overview

### Goals

- **Full hierarchical tracing**: Run → Plan Steps → Subagent Execution → LLM Calls
- **Backend-focused**: API and Orchestrator observability
- **Cloud-ready**: Start with Docker Compose locally, migrate to Langfuse Cloud later
- **Abstracted integration**: New `packages/shared/observability` package
- **Unified cost tracking**: Langfuse becomes the source of truth for token usage and costs

### Out of Scope (for now)

- Session tracking (no sessions implemented yet)
- User tracking (no users implemented yet)
- Frontend feedback/scoring integration

---

## 2. Langfuse Concepts Mapping

| Product Agents Concept | Langfuse Concept | Description |
|------------------------|------------------|-------------|
| Run (`runId`) | **Trace** | Top-level execution with metadata |
| Plan step | **Span** | Individual step in the plan graph |
| Subagent execution | **Span** (nested) | Subagent work within a step |
| Skill execution | **Span** (nested) | Skill invocation within a step |
| LLM call (`generateText`) | **Generation** | Auto-captured via OpenTelemetry |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Frontend (Next.js)                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  No changes - existing SSE streaming, run-store, progress cards     │   │
│   │  Future: Can query Langfuse API for usage/cost display              │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              apps/api (HTTP/SSE)                            │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  NEW: Initialize OpenTelemetry + LangfuseSpanProcessor on startup   │   │
│   │  NEW: Create trace per run with runId and artifactType              │   │
│   │  NEW: Graceful shutdown flushes pending traces                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        packages/product-agent                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  LLMOrchestrator: Use tracedGenerateText for plan generation        │   │
│   │  GraphController: Create spans per step execution                   │   │
│   │  Subagents: Nested spans for subagent work                          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     packages/shared/observability (NEW)                     │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  - initObservability(): Initialize OpenTelemetry + Langfuse         │   │
│   │  - withTrace(): Start a new trace for a run                         │   │
│   │  - withSpan(): Execute work within a span context                   │   │
│   │  - tracedGenerateText(): Wrap generateText with telemetry           │   │
│   │  - tracedStreamText(): Wrap streamText with telemetry               │   │
│   │  - shutdownObservability(): Flush and close connections             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Langfuse (Self-Hosted)                             │
│   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│   │ PostgreSQL │  │ ClickHouse │  │   Redis    │  │   MinIO    │           │
│   │  (config)  │  │  (traces)  │  │  (cache)   │  │  (blobs)   │           │
│   └────────────┘  └────────────┘  └────────────┘  └────────────┘           │
│                            ┌────────────┐                                   │
│                            │ Langfuse   │                                   │
│                            │   Web UI   │ ← http://localhost:3100           │
│                            └────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Self-Hosting Setup

### 4.1 Docker Compose Configuration

**File**: `infra/langfuse/docker-compose.yml`

```yaml
version: "3.8"

services:
  langfuse:
    image: langfuse/langfuse:latest
    ports:
      - "3100:3000"  # Use 3100 to avoid conflict with Next.js (3000) and API (3001)
    environment:
      - DATABASE_URL=postgresql://langfuse:langfuse@postgres:5432/langfuse
      - NEXTAUTH_SECRET=${LANGFUSE_AUTH_SECRET}
      - NEXTAUTH_URL=http://localhost:3100
      - SALT=${LANGFUSE_SALT}
      - CLICKHOUSE_URL=http://clickhouse:8123
      - CLICKHOUSE_USER=default
      - CLICKHOUSE_PASSWORD=clickhouse
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - S3_ENDPOINT=http://minio:9000
      - S3_ACCESS_KEY_ID=minioadmin
      - S3_SECRET_ACCESS_KEY=minioadmin
      - S3_BUCKET_NAME=langfuse
      - S3_FORCE_PATH_STYLE=true
    depends_on:
      postgres:
        condition: service_healthy
      clickhouse:
        condition: service_started
      redis:
        condition: service_started
      minio:
        condition: service_started
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/api/public/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=langfuse
      - POSTGRES_PASSWORD=langfuse
      - POSTGRES_DB=langfuse
    volumes:
      - langfuse_postgres:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U langfuse"]
      interval: 5s
      timeout: 5s
      retries: 5

  clickhouse:
    image: clickhouse/clickhouse-server:24.3
    environment:
      - CLICKHOUSE_USER=default
      - CLICKHOUSE_PASSWORD=clickhouse
    volumes:
      - langfuse_clickhouse:/var/lib/clickhouse
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  redis:
    image: redis:7-alpine
    volumes:
      - langfuse_redis:/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      - MINIO_ROOT_USER=minioadmin
      - MINIO_ROOT_PASSWORD=minioadmin
    volumes:
      - langfuse_minio:/data
    ports:
      - "9001:9001"  # MinIO console (optional, for debugging)

  # Initialize MinIO bucket
  minio-init:
    image: minio/mc:latest
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      sleep 5;
      mc alias set myminio http://minio:9000 minioadmin minioadmin;
      mc mb myminio/langfuse --ignore-existing;
      exit 0;
      "

volumes:
  langfuse_postgres:
  langfuse_clickhouse:
  langfuse_redis:
  langfuse_minio:
```

### 4.2 Environment Variables

**Add to `.env.example`**:

```bash
# =============================================================================
# Langfuse Observability
# =============================================================================

# Feature flag - set to false to disable observability
OBSERVABILITY_ENABLED=true

# Langfuse API keys (get from Langfuse UI after first login)
# 1. Start Langfuse: npm run langfuse:up
# 2. Go to http://localhost:3100, create account
# 3. Create a project, copy API keys
LANGFUSE_SECRET_KEY=sk-lf-...
LANGFUSE_PUBLIC_KEY=pk-lf-...

# Langfuse server URL
# - Local: http://localhost:3100
# - Cloud EU: https://cloud.langfuse.com
# - Cloud US: https://us.cloud.langfuse.com
LANGFUSE_BASE_URL=http://localhost:3100

# Docker Compose secrets (generate with: openssl rand -hex 32)
LANGFUSE_AUTH_SECRET=your-random-auth-secret-here
LANGFUSE_SALT=your-random-salt-here
```

### 4.3 NPM Scripts

**Add to root `package.json`**:

```json
{
  "scripts": {
    "langfuse:up": "docker compose -f infra/langfuse/docker-compose.yml up -d",
    "langfuse:down": "docker compose -f infra/langfuse/docker-compose.yml down",
    "langfuse:logs": "docker compose -f infra/langfuse/docker-compose.yml logs -f langfuse",
    "langfuse:reset": "docker compose -f infra/langfuse/docker-compose.yml down -v && docker compose -f infra/langfuse/docker-compose.yml up -d"
  }
}
```

---

## 5. New Package: `packages/shared/observability`

### 5.1 Package Structure

```
packages/shared/observability/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── src/
    ├── index.ts              # Public exports
    ├── init.ts               # OpenTelemetry + Langfuse initialization
    ├── trace.ts              # Trace creation and management
    ├── span.ts               # Span utilities
    ├── llm.ts                # Wrapped Vercel AI SDK functions
    ├── types.ts              # TypeScript types
    └── config.ts             # Configuration loading
```

### 5.2 Package Configuration

**`package.json`**:

```json
{
  "name": "@product-agents/observability",
  "version": "0.1.0",
  "description": "Observability utilities with Langfuse integration",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@langfuse/otel": "^1.0.0",
    "@langfuse/tracing": "^1.0.0",
    "@opentelemetry/sdk-node": "^0.57.0",
    "ai": "^5.0.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5.0.0"
  },
  "peerDependencies": {
    "ai": "^5.0.0"
  }
}
```

### 5.3 Implementation Files

**`src/config.ts`**:

```typescript
export interface ObservabilityConfig {
  enabled: boolean;
  secretKey: string;
  publicKey: string;
  baseUrl: string;
}

export function getObservabilityConfig(): ObservabilityConfig {
  return {
    enabled: process.env.OBSERVABILITY_ENABLED !== "false",
    secretKey: process.env.LANGFUSE_SECRET_KEY ?? "",
    publicKey: process.env.LANGFUSE_PUBLIC_KEY ?? "",
    baseUrl: process.env.LANGFUSE_BASE_URL ?? "http://localhost:3100",
  };
}

export function isObservabilityConfigured(): boolean {
  const config = getObservabilityConfig();
  return config.enabled && !!config.secretKey && !!config.publicKey;
}
```

**`src/types.ts`**:

```typescript
export type SpanType = "step" | "subagent" | "skill" | "verification" | "plan";

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
}
```

**`src/init.ts`**:

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { getObservabilityConfig, isObservabilityConfigured } from "./config.js";
import type { ObservabilityState } from "./types.js";

let sdk: NodeSDK | null = null;
const state: ObservabilityState = {
  initialized: false,
  enabled: false,
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
    console.log(`[observability] Initialized with Langfuse at ${config.baseUrl}`);
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
}

/**
 * Check if observability is currently enabled and initialized.
 */
export function isObservabilityEnabled(): boolean {
  return state.enabled;
}
```

**`src/trace.ts`**:

```typescript
import { startActiveObservation } from "@langfuse/tracing";
import { isObservabilityEnabled } from "./init.js";
import type { TraceContext } from "./types.js";

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
    });

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
```

**`src/span.ts`**:

```typescript
import { startActiveObservation } from "@langfuse/tracing";
import { isObservabilityEnabled } from "./init.js";
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
    });

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
 * Create a span for a specific step type with appropriate defaults.
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
 * Create a span for subagent execution.
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
 * Create a span for skill execution.
 */
export function createSkillSpan(
  skillId: string,
  input?: unknown
): SpanContext {
  return {
    name: skillId,
    type: "skill",
    input,
  };
}

/**
 * Create a span for verification.
 */
export function createVerificationSpan(input?: unknown): SpanContext {
  return {
    name: "verify",
    type: "verification",
    input,
  };
}
```

**`src/llm.ts`**:

```typescript
import { generateText, streamText } from "ai";
import type {
  GenerateTextResult,
  StreamTextResult,
  CoreMessage,
  LanguageModel,
} from "ai";

// Re-export types for convenience
export type { GenerateTextResult, StreamTextResult };

export interface TracedLLMOptions {
  model: LanguageModel;
  messages?: CoreMessage[];
  prompt?: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  // Add other options as needed
}

/**
 * Wrapper around Vercel AI SDK's generateText with telemetry enabled.
 * Automatically captures the LLM call as a generation in Langfuse.
 *
 * @example
 * ```typescript
 * const result = await tracedGenerateText({
 *   model: openrouter("openai/gpt-4o"),
 *   system: "You are a helpful assistant.",
 *   prompt: "Hello!",
 * });
 * ```
 */
export async function tracedGenerateText(
  options: TracedLLMOptions
): Promise<GenerateTextResult<never, never>> {
  return generateText({
    ...options,
    experimental_telemetry: {
      isEnabled: true,
      metadata: {
        modelId: options.model.modelId,
      },
    },
  });
}

/**
 * Wrapper around Vercel AI SDK's streamText with telemetry enabled.
 * Automatically captures the streaming LLM call as a generation in Langfuse.
 *
 * @example
 * ```typescript
 * const stream = tracedStreamText({
 *   model: openrouter("openai/gpt-4o"),
 *   system: "You are a helpful assistant.",
 *   prompt: "Tell me a story.",
 * });
 *
 * for await (const chunk of stream.textStream) {
 *   process.stdout.write(chunk);
 * }
 * ```
 */
export function tracedStreamText(
  options: TracedLLMOptions
): StreamTextResult<never, never> {
  return streamText({
    ...options,
    experimental_telemetry: {
      isEnabled: true,
      metadata: {
        modelId: options.model.modelId,
      },
    },
  });
}
```

**`src/index.ts`**:

```typescript
// Initialization
export {
  initObservability,
  shutdownObservability,
  isObservabilityEnabled,
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
} from "./span.js";

// LLM wrappers
export {
  tracedGenerateText,
  tracedStreamText,
  type TracedLLMOptions,
} from "./llm.js";

// Types
export type {
  TraceContext,
  SpanContext,
  SpanType,
  ObservabilityState,
} from "./types.js";
```

---

## 6. Integration Points

### 6.1 apps/api - Initialization

**File**: `apps/api/src/index.ts`

Add at the very top of the file (before other imports that might trigger LLM calls):

```typescript
// Initialize observability FIRST, before any other imports
import {
  initObservability,
  shutdownObservability,
} from "@product-agents/observability";

const observabilityState = initObservability();

// ... rest of imports ...
```

Add graceful shutdown:

```typescript
// Graceful shutdown handlers
async function gracefulShutdown(signal: string) {
  console.log(`[api] Received ${signal}, shutting down gracefully...`);
  await shutdownObservability();
  process.exit(0);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
```

### 6.2 apps/api - Wrap Run Execution

**File**: `apps/api/src/index.ts` (in the run handler)

```typescript
import { withTrace } from "@product-agents/observability";

// In the run execution logic:
async function executeRun(record: RunRecord, controller: GraphController) {
  return withTrace(
    {
      runId: record.id,
      artifactType: record.artifactType,
      model: record.request.settings?.model,
      metadata: {
        approvalMode: record.approvalMode,
      },
    },
    async () => {
      const result = await controller.start(controllerRequest, controllerOptions);
      return result;
    }
  );
}
```

### 6.3 GraphController - Step Spans

**File**: `packages/product-agent/src/controller/graph-controller.ts`

```typescript
import {
  withSpan,
  createStepSpan,
  createSubagentSpan,
  createVerificationSpan,
} from "@product-agents/observability";

// In step execution:
private async executeStep(
  step: PlanNode,
  context: RunContext
): Promise<StepResult> {
  const spanContext = step.task.type === "subagent"
    ? createSubagentSpan(step.task.subagentId, step.task.artifactKind, step.task)
    : createStepSpan(step.id, step.label, step.task);

  return withSpan(spanContext, async () => {
    // ... existing step execution logic ...
  });
}

// In verification:
private async runVerification(
  artifacts: Artifact[],
  context: RunContext
): Promise<VerificationResult> {
  return withSpan(createVerificationSpan({ artifactCount: artifacts.length }), async () => {
    // ... existing verification logic ...
  });
}
```

### 6.4 LLMOrchestrator - Traced LLM Calls

**File**: `packages/product-agent/src/orchestrator/llm-orchestrator.ts`

```typescript
import { tracedGenerateText } from "@product-agents/observability";

// Replace generateText calls:
async propose(input: OrchestratorInput): Promise<OrchestratorPlanProposal> {
  // ... build prompt ...

  const response = await tracedGenerateText({
    model: this.model,
    system: systemPrompt,
    messages: formattedMessages,
    temperature: this.config.temperature,
    maxTokens: this.config.maxTokens,
  });

  // ... process response ...
}
```

### 6.5 Subagents - Traced Execution

Each subagent should wrap its LLM calls with `tracedGenerateText`:

**Example for persona-agent**:

```typescript
import { tracedGenerateText, withSpan } from "@product-agents/observability";

async execute(request: SubagentRequest): Promise<SubagentResult> {
  return withSpan(
    { name: "persona-generation", type: "subagent", input: request },
    async () => {
      const response = await tracedGenerateText({
        model: this.model,
        system: this.systemPrompt,
        messages: this.buildMessages(request),
      });

      return this.parseResponse(response);
    }
  );
}
```

---

## 7. Trace Hierarchy Example

When a user starts a run, the trace structure in Langfuse will look like:

```
📊 Trace: run:abc123
├── 🏷️ Tags: [run, prd]
├── 📝 Metadata: { artifactType: "prd", model: "openai/gpt-4o" }
│
├── 📦 Span: plan:generate
│   ├── 🤖 Generation: openai/gpt-4o
│   │   ├── Input tokens: 1,234
│   │   ├── Output tokens: 567
│   │   └── Cost: $0.023
│   └── ⏱️ Duration: 2.3s
│
├── 📦 Span: step:problem-statement
│   ├── 📦 Span: skill:prd-section-writer
│   │   └── 🤖 Generation: openai/gpt-4o
│   └── ⏱️ Duration: 1.8s
│
├── 📦 Span: step:target-users
│   ├── 📦 Span: skill:prd-section-writer
│   │   └── 🤖 Generation: openai/gpt-4o
│   └── ⏱️ Duration: 1.5s
│
├── 📦 Span: subagent:persona
│   ├── 🤖 Generation: openai/gpt-4o
│   │   ├── Input tokens: 2,456
│   │   ├── Output tokens: 1,234
│   │   └── Cost: $0.052
│   └── ⏱️ Duration: 3.2s
│
└── 📦 Span: verification:verify
    ├── 🤖 Generation: openai/gpt-4o
    └── ⏱️ Duration: 1.1s

📈 Total: $0.098 | 12,345 tokens | 9.9s
```

---

## 8. Cost Tracking Migration

### Current State

- `UsageSummary` tracked in `ControllerRunSummary.metadata.usage`
- Calculated manually from OpenRouter response headers
- Stored per-run in memory

### New State with Langfuse

- **Langfuse is the source of truth** for usage and costs
- Token counts captured automatically via OpenTelemetry
- Cost calculated using Langfuse's model pricing database
- Can query via Langfuse API or view in UI

### Migration Steps

1. Keep existing `usage` tracking during transition (Phase 3-4)
2. Verify Langfuse costs match existing calculations
3. Remove manual usage tracking once verified (Phase 7)
4. Frontend can query Langfuse API for cost display if needed

---

## 9. Migration to Langfuse Cloud

When ready to migrate from self-hosted to cloud:

### Steps

1. **Sign up** at [cloud.langfuse.com](https://cloud.langfuse.com)
2. **Create a project** and copy API keys
3. **Update environment variables**:
   ```bash
   LANGFUSE_SECRET_KEY=sk-lf-prod-...
   LANGFUSE_PUBLIC_KEY=pk-lf-prod-...
   LANGFUSE_BASE_URL=https://cloud.langfuse.com  # or us.cloud.langfuse.com
   ```
4. **Restart the API** - no code changes needed
5. **Verify traces** appear in cloud dashboard
6. **Remove Docker Compose** infrastructure: `npm run langfuse:down`

### Data Migration

- Self-hosted traces are NOT automatically migrated to cloud
- Consider exporting important traces before switching
- Or run both in parallel during transition

---

## 10. Testing Strategy

### Unit Tests

```typescript
// packages/shared/observability/src/__tests__/init.test.ts
describe("initObservability", () => {
  it("should initialize when configured", () => {
    process.env.LANGFUSE_SECRET_KEY = "sk-test";
    process.env.LANGFUSE_PUBLIC_KEY = "pk-test";

    const state = initObservability();

    expect(state.enabled).toBe(true);
  });

  it("should skip when disabled", () => {
    process.env.OBSERVABILITY_ENABLED = "false";

    const state = initObservability();

    expect(state.enabled).toBe(false);
  });
});
```

### Integration Tests

```typescript
// Test traces appear in Langfuse
describe("Langfuse integration", () => {
  it("should create trace for run", async () => {
    const result = await withTrace(
      { runId: "test-123", artifactType: "prd" },
      async () => "completed"
    );

    expect(result).toBe("completed");
    // Verify trace in Langfuse via API
  });
});
```

### Manual Testing Checklist

- [ ] Start Langfuse: `npm run langfuse:up`
- [ ] Verify UI accessible at http://localhost:3100
- [ ] Create account, project, get API keys
- [ ] Start API with observability enabled
- [ ] Trigger a run via frontend
- [ ] Verify trace appears in Langfuse
- [ ] Check spans are properly nested
- [ ] Verify LLM generations show token counts
- [ ] Check costs are calculated

---

## 11. Implementation Plan

### Phase 1: Infrastructure Setup
- [ ] Create `infra/langfuse/` directory
- [ ] Add `docker-compose.yml` with all required services
- [ ] Add environment variables to `.env.example`
- [ ] Add npm scripts to root `package.json`
- [ ] Test Docker Compose locally
- [ ] Document first-time setup in README

### Phase 2: Observability Package
- [ ] Create `packages/shared/observability/` package
- [ ] Implement `config.ts` and `types.ts`
- [ ] Implement `init.ts` with safe initialization
- [ ] Implement `trace.ts` for run-level tracing
- [ ] Implement `span.ts` for step-level spans
- [ ] Implement `llm.ts` for Vercel AI SDK wrappers
- [ ] Create `index.ts` with public exports
- [ ] Add to workspace, build and verify

### Phase 3: API Integration
- [ ] Add observability initialization to `apps/api`
- [ ] Add graceful shutdown handler
- [ ] Wrap run execution with `withTrace()`
- [ ] Test traces appear in Langfuse UI

### Phase 4: LLMOrchestrator Integration
- [ ] Replace `generateText` with `tracedGenerateText`
- [ ] Add plan generation span
- [ ] Verify LLM calls appear as generations

### Phase 5: GraphController Integration
- [ ] Wrap step execution with `withSpan()`
- [ ] Add subagent execution spans
- [ ] Add verification spans
- [ ] Test full hierarchical trace structure

### Phase 6: Subagent Integration
- [ ] Update persona-agent with tracing
- [ ] Update research-agent with tracing
- [ ] Update prd-agent with tracing
- [ ] Verify nested spans work correctly

### Phase 7: Cleanup and Documentation
- [ ] Remove manual usage tracking (after verification)
- [ ] Update AGENTS.md with observability section
- [ ] Add troubleshooting guide
- [ ] Document cloud migration steps
- [ ] Create runbook for common operations

---

## 12. Future Enhancements

Once the base implementation is complete, consider:

1. **Session tracking** - When user sessions are implemented
2. **User tracking** - When authentication is added
3. **Frontend feedback** - Allow users to rate outputs
4. **Prompt management** - Use Langfuse prompt versioning
5. **Evaluations** - Automated quality scoring
6. **Dashboards** - Custom metrics and alerts
7. **A/B testing** - Compare model performance
