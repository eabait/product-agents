# PRD Orchestrator Agent – Architectural History

This log captures the major architecture shifts of the legacy PRD orchestrator (now superseded by the `packages/product-agent` controller), with an emphasis on how worker orchestration and platform capabilities evolved in line with the principles outlined in `blog/article.md` (context planning, creation vs. edition, and UX transparency).

# VERSION v0

## 2025-09-05 · Bootstrapping the orchestrator (`d5bb100`)
- Introduced the first orchestration graph: a `ClarificationAnalyzer` gate, centralized `ContextAnalyzer`/`RiskIdentifier`/`ContentSummarizer` workers, and four section writers (context, problem statement, assumptions, metrics).
- Established dual execution paths—full PRD generation and targeted edits—so the orchestrator could reuse prior sections instead of rebuilding the whole document.
- Embedded shared-analysis caching to prevent redundant analyzer invocations, addressing the article’s call for deliberate cognition planning.

# VERSION v1

## 2025-09-05 · Five-section PRD redesign (`8155f568`)
- Refocused the worker set on five audience-facing sections (target users, solution, key features, success metrics, constraints) and retired the heavier analyzer trio.
- Allowed all section writers to operate in parallel atop a single `ContextAnalyzer` result, reducing coupling and matching the article’s distinction between creation and edition workflows.
- Updated PRD assembly to mirror the new section taxonomy while preserving legacy fields for backward compatibility.

## 2025-09-06 · Confidence instrumentation (`67f6ec9a`)
- Added structured `ConfidenceAssessment` payloads per section and a combiner helper so the UI can surface quality telemetry next to each worker’s output.
- Clarification failures now return confidence metadata, tightening the feedback loop the article recommends for transparent handoffs.

## 2025-09-09 · LLM-driven edit routing (`895b2b19`)
- Introduced the `SectionDetectionAnalyzer` worker to interpret change requests and select affected sections, falling back to heuristics when needed.
- `chat` now autodetects existing PRDs and routes straight into the edition path, reinforcing the “creation vs. edition” split from the article.
- Logging highlights analyzer confidence, giving operators insight into why specific writers were triggered.

## 2025-09-09 · Pipeline modularization (`6cd05117`)
- Broke the monolithic `generateSections` flow into composable helpers (`checkClarificationNeeded`, `runCentralizedAnalysis`, `processSectionsInParallel`, `buildSectionResponse`) that isolate worker responsibilities.
- Centralized constants (`SECTION_NAMES`, `ALL_SECTION_NAMES`) and metadata builders, reducing ad-hoc string usage and making future worker additions less error-prone.
- Laid the groundwork for richer runtime instrumentation by standardizing how shared analysis and per-section outputs are collected.

# VERSION v2

## 2025-09-30 · Streaming progress events (`a4b9933b`)
- Added `ProgressEvent` types and an optional `onProgress` callback so analyzers and writers can emit `worker_start`, `section_complete`, and final status messages in real time.
- `processSectionsInParallel` now streams partial results, giving the frontend the UX transparency championed in the article and reinforcing the value of observable workers.
- Mapped confidence levels to numeric hints for each streamed section, helping users judge when to intervene.

## 2025-10-09 · Sub-agent configurability (`a845b38f`, `10c2617c`)
- Wrapped the orchestrator in `PRD_AGENT_METADATA`, exposing default settings, configurable parameters, and worker roster for UI/editor tooling.
- Introduced `getSubAgentRuntimeSettings`, letting every analyzer and section writer target bespoke models, temperatures, and API keys while inheriting orchestrator fallbacks.
- Marked streaming as a required capability so model selection stays aligned with the progress-event pipeline.

## 2025-10-13 · Usage and cost accounting (`9b53a32c`)
- Integrated `UsageEntry` capture and `summarizeUsage` reporting, allowing each worker to append token/cost telemetry that rolls up into the orchestrator response.
- Section execution now records usage metadata alongside confidence, expanding the observability surface the article argues is critical for trustworthy agent UX.

## 2025-10-20 · Edition data parity fixes (`06e07ca5`)
- Hardened section detection fallbacks (empty analyzer responses now trigger heuristic coverage) to avoid silent no-op edits.
- Ensured top-level PRD fields (solution overview, target users, goals, metrics, constraints, assumptions) stay in sync with edited section payloads, preventing stale data when only a subset of workers rerun.
- Keeps the edition workflow aligned with creation outputs, maintaining the coherent PRD “source of truth” described in the article.
