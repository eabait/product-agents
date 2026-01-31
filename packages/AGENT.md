# Packages Agent Guidelines

This document guides coding agents contributing to the `packages/` directory - the core modules containing agents, skills, and shared libraries.

## Package Overview

```
packages/
├── product-agent/        # Core orchestrator (planner, graph controller, registry)
├── prd-agent/           # PRD generation subagent
├── persona-agent/       # Persona synthesis subagent
├── research-agent/      # Web research subagent (uses Tavily)
├── storymap-agent/      # User story map builder subagent
├── skills/
│   ├── prd/             # PRD skill pack (section writers)
│   └── clarifications/  # Clarification skills
└── shared/
    ├── agent-core/      # Base agent types and utilities
    ├── config-schemas/  # Zod validation schemas
    ├── model-compatibility/ # LLM model capability detection
    ├── observability/   # Langfuse tracing integration
    ├── openrouter-client/ # OpenRouter API client
    ├── prd-shared/      # PRD types and schemas
    ├── skill-analyzer-core/ # Skill analysis utilities
    └── ui-components/   # Shared React components
```

## Creating a New Subagent

Subagents are autonomous modules that produce specific artifact types. Follow this structure:

### 1. Package Setup

Create directory and `package.json`:
```json
{
  "name": "@product-agents/your-agent",
  "version": "0.1.0",
  "description": "Description of what this agent produces",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup",
    "lint": "eslint 'src/**/*.{ts,tsx}'",
    "clean": "rm -rf dist",
    "test": "node --test --loader ../../product-agent/tests/ts-loader.mjs tests/**/*.test.ts"
  },
  "dependencies": {
    "@product-agents/openrouter-client": "*",
    "@product-agents/product-agent": "*",
    "zod": "^3.25.76"
  },
  "peerDependencies": {
    "@product-agents/product-agent": "*"
  },
  "devDependencies": {
    "tsup": "^7.2.0",
    "typescript": "^5.0.0"
  }
}
```

### 2. Define the Manifest

The manifest declares your agent's identity and capabilities:

```typescript
// src/manifest.ts
import type { SubagentManifest } from '@product-agents/product-agent'

export const yourAgentManifest: SubagentManifest = {
  id: 'your.agent.id',           // Unique identifier
  package: '@product-agents/your-agent',
  version: '0.1.0',
  label: 'Your Agent Name',       // Display name
  description: 'What this agent does',
  creates: 'your-artifact-kind',  // ArtifactKind this agent produces
  consumes: ['prd', 'persona'],   // ArtifactKinds this agent can use as input
  capabilities: ['generate'],     // Agent capabilities
  entry: '@product-agents/your-agent',
  exportName: 'createYourAgentSubagent',
  tags: ['your-tags']
}
```

### 3. Implement the Subagent Lifecycle

```typescript
// src/subagent.ts
import type {
  SubagentLifecycle,
  SubagentRequest,
  SubagentResult,
  Artifact,
  ProgressEvent
} from '@product-agents/product-agent'

export interface YourAgentParams {
  input: YourInputType
  // Additional parameters
}

export interface YourOutputType {
  // Define your artifact data structure
}

export const createYourAgentSubagent = (
  options?: YourAgentOptions
): SubagentLifecycle<YourAgentParams, unknown, YourOutputType> => {
  return {
    metadata: {
      id: yourAgentManifest.id,
      label: yourAgentManifest.label,
      version: yourAgentManifest.version,
      artifactKind: yourAgentManifest.creates,
      sourceKinds: yourAgentManifest.consumes,
      description: yourAgentManifest.description,
      tags: yourAgentManifest.capabilities
    },

    async execute(request: SubagentRequest<YourAgentParams>): Promise<SubagentResult<YourOutputType>> {
      // 1. Validate input
      if (!request.params?.input) {
        throw new Error('Your agent requires input payload')
      }

      // 2. Extract context from source artifacts
      const sourceArtifact = request.sourceArtifact

      // 3. Build prompt and call LLM
      const result = await generateYourArtifact(request.params.input, sourceArtifact)

      // 4. Emit progress events
      request.emit?.({
        type: 'step.completed',
        timestamp: new Date().toISOString(),
        payload: { step: 'generation', status: 'completed' }
      })

      // 5. Return result with artifact
      return {
        artifact: {
          id: `your-artifact-${Date.now()}`,
          kind: 'your-artifact-kind',
          version: '1.0.0',
          label: 'Your Artifact',
          data: result,
          metadata: {
            createdAt: new Date().toISOString(),
            extras: {
              source: {
                parentRunId: request.run.runId,
                subagentId: yourAgentManifest.id
              }
            }
          }
        },
        progress: [],
        metadata: {
          originatingSubagent: yourAgentManifest.id
        }
      }
    }
  }
}
```

### 4. Export from Index

```typescript
// src/index.ts
export { yourAgentManifest } from './manifest'
export { createYourAgentSubagent } from './subagent'
export type { YourAgentParams, YourOutputType } from './subagent'
```

### 5. Register in API

Add registration in `apps/api/src/index.ts`:
```typescript
import { yourAgentManifest, createYourAgentSubagent } from '@product-agents/your-agent'

// In the registration section:
if (!registeredSubagents.has(yourAgentManifest.id)) {
  subagentRegistry.register(yourAgentManifest)
}
```

## Creating a New Skill Pack

Skills are focused capabilities that can be composed by the planner.

### 1. Package Structure

```
packages/skills/your-skill/
├── package.json
├── tsconfig.json
├── tsup.config.ts
└── src/
    ├── index.ts
    ├── yourSkillPack.ts
    └── skills/
        ├── skill-one.ts
        └── skill-two.ts
```

### 2. Define Skills

```typescript
// src/skills/skill-one.ts
import type { SkillDefinition, SkillContext, SkillResult } from '@product-agents/product-agent'

export const skillOne: SkillDefinition = {
  id: 'your-pack.skill-one',
  name: 'Skill One',
  description: 'What this skill does',
  inputSchema: z.object({
    // Define input with Zod
  }),
  outputSchema: z.object({
    // Define output with Zod
  }),

  async execute(input: SkillInput, context: SkillContext): Promise<SkillResult> {
    // Implement skill logic
    // Can call LLM, process data, etc.

    return {
      success: true,
      output: { /* skill output */ },
      metadata: { /* optional metadata */ }
    }
  }
}
```

### 3. Create Skill Pack

```typescript
// src/yourSkillPack.ts
import type { SkillPack } from '@product-agents/product-agent'
import { skillOne } from './skills/skill-one'
import { skillTwo } from './skills/skill-two'

export const yourSkillPack: SkillPack = {
  id: 'your-skill-pack',
  name: 'Your Skill Pack',
  version: '1.0.0',
  description: 'Collection of skills for X purpose',
  skills: [skillOne, skillTwo]
}
```

## Shared Library Guidelines

### Adding to Existing Shared Packages

1. **agent-core**: Base types, interfaces, and utilities for all agents
2. **config-schemas**: Zod schemas for validation (API payloads, env config)
3. **model-compatibility**: Model capability detection and fallback logic
4. **observability**: Langfuse integration (traces, spans, events)
5. **openrouter-client**: HTTP client for OpenRouter API
6. **prd-shared**: PRD-specific types and request/response schemas

### Creating a New Shared Package

```bash
mkdir packages/shared/your-package
cd packages/shared/your-package
```

Minimal `package.json`:
```json
{
  "name": "@product-agents/your-package",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

## Build Configuration

### tsup.config.ts (for packages with build step)
```typescript
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true
})
```

### tsconfig.json
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

## Testing

### Unit Tests with Node Test Runner

```typescript
// tests/your-agent.test.ts
import { describe, it, mock } from 'node:test'
import assert from 'node:assert'

import { createYourAgentSubagent } from '../src/subagent'

describe('YourAgent', () => {
  it('should produce artifact from valid input', async () => {
    const subagent = createYourAgentSubagent()

    const result = await subagent.execute({
      params: { input: mockInput },
      run: mockRun,
      sourceArtifact: mockSourceArtifact
    })

    assert.ok(result.artifact)
    assert.equal(result.artifact.kind, 'your-artifact-kind')
  })
})
```

Run tests:
```bash
npm run test -w packages/your-agent
```

## Best Practices

### Subagent Development
1. **Single responsibility**: One agent = one artifact type
2. **Declare dependencies**: List all consumed artifact kinds in manifest
3. **Emit progress**: Keep the orchestrator informed of execution status
4. **Handle failures gracefully**: Return meaningful errors, support fallback paths
5. **Add telemetry**: Track latency, usage, and strategy in artifact metadata extras

### Skill Development
1. **Keep skills focused**: One skill = one well-defined operation
2. **Strong typing**: Use Zod for input/output validation
3. **Composability**: Design skills to work together in plans
4. **Idempotent when possible**: Same input should produce same output

### General
1. **Type safety**: Use TypeScript strictly, avoid `any`
2. **Consistent naming**: Follow existing package naming conventions
3. **Document exports**: Add JSDoc comments to public APIs
4. **Version carefully**: Update version in package.json and manifest together
5. **Test coverage**: Unit tests for core logic, integration tests for flows

## Common Patterns

### LLM Call with Retry
```typescript
import { callOpenRouter } from '@product-agents/openrouter-client'

const result = await callOpenRouter({
  model: config.model,
  messages: [{ role: 'user', content: prompt }],
  temperature: config.temperature,
  maxTokens: config.maxTokens,
  retryAttempts: 3,
  retryBackoffMs: 1000
})
```

### Progress Event Emission
```typescript
request.emit?.({
  type: 'step.started',
  timestamp: new Date().toISOString(),
  stepId: 'your-step-id',
  payload: { step: 'processing', label: 'Processing input' }
})
```

### Artifact Metadata with Source Tracking
```typescript
const artifact: Artifact<YourType> = {
  id: `artifact-${randomUUID()}`,
  kind: 'your-kind',
  version: '1.0.0',
  label: 'Your Artifact',
  data: result,
  metadata: {
    createdAt: new Date().toISOString(),
    extras: {
      source: {
        parentRunId: request.run.runId,
        parentArtifactKind: request.run.request.artifactKind,
        sourceArtifactId: request.sourceArtifact?.id,
        subagentId: yourManifest.id
      },
      telemetry: {
        latencyMs: endTime - startTime,
        model: config.model,
        tokensUsed: usage.totalTokens
      }
    }
  }
}
```
