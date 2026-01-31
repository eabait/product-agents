# API Agent Guidelines

This document guides coding agents contributing to the `apps/api` package - the thin HTTP/SSE API that wraps the product-agent orchestrator.

## Package Purpose

The API serves as a lightweight HTTP layer that:
- Exposes REST endpoints for starting runs, retrieving status, and streaming progress
- Manages SSE (Server-Sent Events) connections for real-time progress updates
- Handles plan approval workflows (manual and auto modes)
- Registers and coordinates subagents from the registry
- Wraps Langfuse observability traces around run executions

## Architecture

### Core Components
- **Single entry file**: `src/index.ts` contains all API logic (no router abstraction)
- **Raw Node HTTP**: Uses `node:http` directly, not Express or Fastify
- **In-memory storage**: Run records stored in a `Map<string, RunRecord>`
- **SSE broadcasting**: Subscribers tracked per-run in `Map<string, Set<ServerResponse>>`

### Key Dependencies
- `@product-agents/product-agent`: Core orchestrator, GraphController, SubagentRegistry
- `@product-agents/prd-agent`: PRD controller and manifest
- `@product-agents/persona-agent`, `@product-agents/research-agent`, `@product-agents/storymap-agent`: Subagent manifests
- `@product-agents/observability`: Langfuse tracing
- `zod`: Request payload validation

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Returns server status, planner info, skill packs, and registered subagents |
| `/runs` | POST | Starts a new run (accepts `StartRunPayload`) |
| `/runs/:runId` | GET | Retrieves run record with events and summary |
| `/runs/:runId/stream` | GET | SSE stream for real-time progress events |
| `/runs/:runId/approve` | POST | Approves or rejects a pending plan |
| `/runs/:runId/subagent/:stepId/approve` | POST | Approves or rejects a blocked subagent plan |

## Coding Guidelines

### Adding New Endpoints

1. Add route handling in the main `http.createServer` callback using URL pattern matching
2. Handle CORS preflight via `handleCorsPreflight()` helper
3. Use `writeJson()` for JSON responses, `setSseHeaders()` + `sendSse()` for SSE
4. Validate payloads with Zod schemas (define near top of file)
5. Log with consistent prefix: `[product-agent/api]`

Example pattern:
```typescript
if (req.method === 'POST' && /^\/your-endpoint$/.test(url.pathname)) {
  try {
    const payload = YourSchema.parse(await parseJson<unknown>(req))
    // ... handle request
    writeJson(res, 200, { result: 'success' })
  } catch (error) {
    const message = error instanceof z.ZodError
      ? 'Invalid request payload'
      : error instanceof Error ? error.message : 'Unknown error'
    writeJson(res, 400, { error: message })
  }
  return
}
```

### Working with Runs

- Use `registerRun()` to create new run records
- Use `updateRunRecord()` to modify run state
- Use `appendProgressEvent()` to add events and update status
- Use `broadcastEvent()` to notify SSE subscribers
- Use `closeSubscribers()` when a run completes or fails

### SSE Event Types

- `progress`: Forwarded from controller (plan.created, step.started, etc.)
- `complete`: Run finished successfully with artifact
- `clarification`: Run awaiting user input
- `error`: Run failed with error message
- `pending-approval`: Plan ready for manual approval
- `close`: Stream termination signal

### Subagent Registration

Register new subagents by:
1. Import the manifest from the subagent package
2. Add registration logic after config load:
```typescript
if (!registeredSubagents.has(yourAgentManifest.id)) {
  subagentRegistry.register(yourAgentManifest, customLoaderIfNeeded)
}
```

Custom loaders are needed when runtime config injection is required (see `researchAgentLoader` example for TAVILY_API_KEY injection).

### Observability

- Wrap run execution with `withTrace()` for Langfuse tracing
- Use `runWithTraceContext()` to propagate trace context to resumed executions
- Check `isObservabilityEnabled()` before trace-specific logic

## Testing

Run the API manually:
```bash
npm run dev -w apps/api
```

E2E tests via script:
```bash
./run_e2e.sh
```

Requires `.env` with `OPENROUTER_API_KEY` set.

## Environment Variables

Key variables (see `.env.example` in project root):
- `PRODUCT_AGENT_API_PORT`: Server port (default: 3001)
- `PRODUCT_AGENT_API_HOST`: Server host (default: 0.0.0.0)
- `OPENROUTER_API_KEY`: LLM API key
- `TAVILY_API_KEY`: Research agent web search key
- Orchestrator settings: `ORCHESTRATOR_MODEL`, `ORCHESTRATOR_TEMPERATURE`, `ORCHESTRATOR_MAX_TOKENS`

## Best Practices

1. **Keep it thin**: Business logic belongs in `packages/product-agent`, not here
2. **Consistent error handling**: Always return JSON with `error` field on failures
3. **Log everything**: Use `console.log/warn/error` with `[product-agent/api]` prefix
4. **CORS support**: Ensure new endpoints include CORS headers
5. **Graceful shutdown**: New resources should be cleaned up in `gracefulShutdown()`
6. **Type safety**: Define TypeScript interfaces for all payloads and records
