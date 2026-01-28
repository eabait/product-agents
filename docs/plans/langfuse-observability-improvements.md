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

## Phase 1: Fix Parent-Child Span Hierarchy

[ ] 1.1 Audit span context propagation in `GraphController`
    - File: `packages/product-agent/src/controller/graph-controller.ts`
    - Ensure subagent spans receive parent observation ID from step spans
    - Add explicit parent context passing to subagent executors

[ ] 1.2 Update subagent executor interface to accept trace context
    - File: `packages/product-agent/src/subagents/types.ts`
    - Add optional `parentSpanId` or trace context to SubagentRequest

[ ] 1.3 Verify hierarchy in Langfuse UI
    - Run a test trace and confirm all spans nest correctly under `run:*`

---

## Phase 2: Add LLM Generation Tracking to Subagents

[ ] 2.1 Research agent - Add traced LLM calls
    - File: `packages/product-agent/src/subagents/research/`
    - Replace `generateText` with `tracedGenerateText`
    - Wrap `plan:analyze-request` and `plan:generate-plan` internal LLM calls

[ ] 2.2 Persona agent - Add traced LLM calls
    - File: `packages/product-agent/src/subagents/persona/`
    - Replace `generateText` with `tracedGenerateText`
    - Add GENERATION observations for persona creation

[ ] 2.3 PRD agent - Add traced LLM calls (PRIORITY - 92.8s bottleneck)
    - File: `packages/product-agent/src/subagents/prd/`
    - Replace all `generateText` calls with `tracedGenerateText`
    - Add nested spans for each PRD section generation
    - Track token usage per section to identify expensive prompts

[ ] 2.4 Add generation tracking to any other subagents
    - Audit all subagents for untracked LLM calls

---

## Phase 3: Enrich Metadata

[ ] 3.1 Add search query metadata to Tavily skill
    - File: `packages/product-agent/src/skills/tavily/`
    - Log search query, result count, and sources in span metadata
    - Example: `{ query: "AI chatbot competitors", resultCount: 10, sources: [...] }`

[ ] 3.2 Add intermediate artifacts to subagent spans
    - Research agent: Log generated research plan in metadata
    - Persona agent: Log persona count and types
    - PRD agent: Log section being written

[ ] 3.3 Add model parameters to all LLM spans
    - Include `temperature`, `maxTokens`, `model` in generation metadata

[ ] 3.4 Capture input/output at trace level
    - Update trace creation to include actual prompt summary
    - Capture output artifact summary (not full content to avoid size limits)

---

## Phase 4: Improve Tavily Search Parallelization

[ ] 4.1 Analyze current Tavily batching logic
    - File: `packages/product-agent/src/subagents/research/`
    - Identify why searches run in pairs (2 at a time)

[ ] 4.2 Increase parallel search limit
    - Change batch size from 2 to 4-6 concurrent searches
    - Add configurable concurrency limit

[ ] 4.3 Add batch metadata
    - Log batch number and total batches in span metadata
    - Track time saved from parallelization

---

## Phase 5: PRD Agent Performance Investigation

[ ] 5.1 Add nested spans inside PRD agent
    - Break down 92.8s into identifiable phases:
      - Section planning
      - Per-section generation (problem statement, target users, etc.)
      - Assembly/formatting
      - Validation

[ ] 5.2 Profile token usage per section
    - Identify which PRD sections consume most tokens
    - Flag sections >5000 output tokens for optimization

[ ] 5.3 Evaluate streaming for PRD generation
    - Consider `tracedStreamText` for long sections
    - Measure time-to-first-token metrics

[ ] 5.4 Add timing metadata
    - Log section-level timing: `{ section: "problem_statement", durationMs: 12500 }`

---

## Phase 6: Error and Retry Tracking

[ ] 6.1 Add error handling to all spans
    - Catch exceptions and set `statusMessage` on span
    - Set span level to `ERROR` on failure

[ ] 6.2 Track API retries
    - Log retry count in metadata when OpenRouter/Tavily retries occur
    - Add `isRetry: true` flag to retry attempt spans

[ ] 6.3 Track rate limiting
    - Log rate limit events with wait duration
    - Add span for rate limit backoff periods

---

## Phase 7: Approval Flow Optimization (Optional)

[ ] 7.1 Add timing metadata for approval wait
    - Track `approval:requested` to `approval:received` duration explicitly
    - Log in trace metadata: `{ approvalWaitMs: 11000 }`

[ ] 7.2 Consider async approval mode
    - For automated pipelines, allow configurable auto-approval
    - Document approval modes in AGENTS.md

---

## Verification Checklist

After implementation, run a test trace and verify:

[ ] All spans have correct parent hierarchy (visible in Langfuse tree view)
[ ] Every LLM call has a GENERATION observation with token counts
[ ] Total cost is calculated and visible at trace level
[ ] Tavily searches show query metadata
[ ] PRD agent shows nested section-level spans
[ ] Errors (if any) have proper statusMessage
[ ] Metadata is populated (not empty `{}`)

---

## Files to Modify

| File | Changes |
|------|---------|
| `packages/product-agent/src/controller/graph-controller.ts` | Pass parent context to subagents |
| `packages/product-agent/src/subagents/research/*.ts` | Add `tracedGenerateText`, metadata |
| `packages/product-agent/src/subagents/persona/*.ts` | Add `tracedGenerateText`, metadata |
| `packages/product-agent/src/subagents/prd/*.ts` | Add `tracedGenerateText`, nested spans |
| `packages/product-agent/src/skills/tavily/*.ts` | Add query metadata, increase parallelism |
| `packages/shared/observability/src/span.ts` | Add error handling utilities |

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Observations with token data | 1/20 (5%) | 20/20 (100%) |
| Spans with metadata | 0/20 (0%) | 18/20 (90%) |
| PRD agent visibility | 1 span | 5+ nested spans |
| Tavily parallel limit | 2 | 4-6 |
| Error tracking coverage | 0% | 100% |
