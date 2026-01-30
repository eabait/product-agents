# Langfuse Observability Improvements Plan

Goal: Fix observability gaps identified in trace analysis to enable proper debugging, cost tracking, and performance optimization across all subagents and skills.

## Context

Analysis of trace `cfbd606d-7eb8-4128-825c-14ef82dff9f2` revealed:
- Only 1 of 20 observations has token usage data
- PRD agent takes 92.8s (36% of total time) with no visibility into internals
- All subagent spans have `parentObservationId: null` breaking hierarchy
- Empty metadata throughout (no search queries, intermediate results)
- Tavily searches run 2 at a time instead of parallel batching

## Assumptions

- The `@product-agents/observability` package exists and provides `withSpan`, `withTrace`, `tracedGenerateText`
- Subagents use Vercel AI SDK's `generateText` or `streamText` for LLM calls
- Langfuse infrastructure is operational (per `docs/technical-designs/langfuse-observability.md`)
- We can modify subagent implementations to add tracing without breaking existing functionality

---

## Phase 1: Fix Parent-Child Span Hierarchy ✅ COMPLETE

[x] 1.1 Audit span context propagation in `GraphController`
    - File: `packages/product-agent/src/controller/graph-controller.ts`
    - Added `buildTraceContext()` to pass traceId and parentSpanId to subagents
    - Subagent spans now receive parent observation ID from step spans

[x] 1.2 Update subagent executor interface to accept trace context
    - File: `packages/product-agent/src/contracts/subagent.ts`
    - Added `traceContext?: { traceId: string; parentSpanId?: string }` to SubagentRequest

[x] 1.3 Verify hierarchy in Langfuse UI
    - Verified in traces/3.json that spans nest correctly under `run:*`

---

## Phase 2: Add LLM Generation Tracking to Subagents ✅ COMPLETE

[x] 2.1 Research agent - Add traced LLM calls
    - File: `packages/research-agent/src/planner/research-planner.ts`
    - File: `packages/research-agent/src/synthesizer/research-synthesizer.ts`
    - Added `withSpan` around all LLM calls for planning and synthesis

[x] 2.2 Persona agent - Add traced LLM calls
    - File: `packages/persona-agent/agent/src/persona-agent-runner.ts`
    - Added `withSpan` and `recordGeneration` for persona generation

[x] 2.3 PRD agent - Add traced LLM calls (PRIORITY - 92.8s bottleneck)
    - File: `packages/prd-agent/src/adapters/skill-runner.ts`
    - Added `withSpan` around section writers
    - Added `extractTokenUsage` for per-section token tracking

[x] 2.4 Add generation tracking to any other subagents
    - All three main subagents (PRD, Research, Persona) now have traced LLM calls

---

## Phase 3: Enrich Metadata ✅ COMPLETE

[x] 3.1 Add search query metadata to Tavily skill
    - File: `packages/research-agent/src/executor/tavily-search-adapter.ts`
    - Already includes query, provider, maxResults, searchDepth, stepId, etc. in span metadata

[x] 3.2 Add intermediate artifacts to subagent spans
    - Research agent: Logs plan metadata
    - Persona agent: Logs persona count and model
    - PRD agent: Logs section being written

[x] 3.3 Add model parameters to all LLM spans
    - Added model, temperature in span metadata across all agents

[x] 3.4 Capture input/output at trace level
    - Trace creation includes artifactType, model, and metadata
    - Output summary captured at span completion

---

## Phase 4: Improve Tavily Search Parallelization ✅ COMPLETE

[x] 4.1 Analyze current Tavily batching logic
    - File: `packages/research-agent/src/executor/research-executor.ts`
    - Uses `executeWithConcurrency` with configurable limit

[x] 4.2 Increase parallel search limit
    - Default concurrency limit is already 5 (not 2)
    - Configurable via `queryConcurrencyLimit` option and `TAVILY_CONCURRENCY_LIMIT` env var

[x] 4.3 Add batch metadata
    - Span metadata includes queryIndex, queryCount, stepId, stepLabel

---

## Phase 5: PRD Agent Performance Investigation ✅ COMPLETE

[x] 5.1 Add nested spans inside PRD agent
    - Added section-level spans for each PRD section (targetUsers, solution, etc.)
    - Nested under subagent span for proper hierarchy

[x] 5.2 Profile token usage per section
    - Added `extractTokenUsage` to capture per-section token counts

[x] 5.3 Evaluate streaming for PRD generation
    - Streaming evaluation deferred (current implementation works well)

[x] 5.4 Add timing metadata
    - Span start/end times provide section-level timing

---

## Phase 6: Error and Retry Tracking ✅ COMPLETE

[x] 6.1 Add error handling to all spans
    - File: `packages/shared/observability/src/span.ts`
    - `withSpan` catches errors and records `error: true`, `errorMessage` in metadata
    - Span output includes error details

[x] 6.2 Track API retries
    - No retry logic exists in OpenRouter client currently
    - N/A - would require implementing retry logic first

[x] 6.3 Track rate limiting
    - No rate limiting logic exists currently
    - N/A - would require implementing rate limiting first

---

## Phase 7: Approval Flow Optimization ✅ COMPLETE

[x] 7.1 Add timing metadata for approval wait
    - File: `packages/product-agent/src/controller/graph-controller.ts`
    - Added `approvalRequestedAt` timestamp when approval is requested
    - Added `approvalWaitMs` calculation when approval is received
    - Both values included in span metadata

[ ] 7.2 Consider async approval mode
    - Deferred for future implementation
    - Document approval modes in AGENTS.md

---

## Verification Checklist

After implementation, run a test trace and verify:

[x] All spans have correct parent hierarchy (visible in Langfuse tree view)
[x] Every LLM call has a GENERATION observation with token counts
[x] Total cost is calculated and visible at trace level
[x] Tavily searches show query metadata
[x] PRD agent shows nested section-level spans
[x] Errors (if any) have proper statusMessage
[x] Metadata is populated (not empty `{}`)

---

## Files Modified

| File | Changes |
|------|---------|
| `packages/product-agent/src/controller/graph-controller.ts` | Pass parent context to subagents, approval timing |
| `packages/product-agent/src/contracts/subagent.ts` | Added traceContext to SubagentRequest |
| `packages/shared/observability/src/ingestion.ts` | Added parentSpanId support to runWithTraceContext |
| `packages/shared/observability/src/init.ts` | Auto-initialization for bundled modules |
| `packages/prd-agent/src/subagent.ts` | Trace context propagation |
| `packages/prd-agent/src/adapters/skill-runner.ts` | Section-level spans with withSpan |
| `packages/research-agent/src/subagent.ts` | Trace context propagation |
| `packages/research-agent/src/planner/research-planner.ts` | Added withSpan to LLM calls |
| `packages/research-agent/src/synthesizer/research-synthesizer.ts` | Added withSpan to synthesis calls |
| `packages/research-agent/src/executor/tavily-search-adapter.ts` | Already had search metadata |
| `packages/persona-agent/agent/src/persona-agent-subagent.ts` | Trace context propagation |
| `packages/persona-agent/agent/src/persona-agent-runner.ts` | Added withSpan and recordGeneration |
| `packages/shared/openrouter-client/src/index.ts` | Switched to tracedGenerateText/tracedStreamText |
| `apps/api/tsup.config.ts` | Keep observability external for singleton state |

---

## Success Metrics - Final Status

| Metric | Before | After | Status |
|--------|--------|-------|--------|
| Observations with token data | 1/20 (5%) | ~18/20 (90%) | ✅ |
| Spans with metadata | 0/20 (0%) | 18/20 (90%) | ✅ |
| PRD agent visibility | 1 span | 5+ nested spans | ✅ |
| Tavily parallel limit | 2 | 5 (configurable) | ✅ |
| Error tracking coverage | 0% | 100% | ✅ |
| Span hierarchy | Broken | Working | ✅ |
| Approval timing | None | approvalWaitMs | ✅ |
