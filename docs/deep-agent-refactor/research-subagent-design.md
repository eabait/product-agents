# Research Subagent Design Draft

## Objectives

- Transform research prompts into structured briefings that downstream subagents (persona, story map) can consume.
- Blend curated internal knowledge (company rituals, product metrics) with live data pulls (news, market, competitors).
- Standardise outputs so orchestration can slot research briefs into the same artifact pipeline used for PRDs.

## Proposed Flow

1. **Ingestion layer**
   - Vector store seeded with prior research docs, discovery notes, and competitive analyses (`@product-agents/data-hub`).
   - On-demand connectors: web search (SerpAPI), app store intelligence, social listening.
   - Normalise into `ResearchSource` objects with provenance (url, timestamp, cost) for auditing.

2. **Planner**
   - Accepts research intent (problem statement, target market, open questions).
   - Produces sections: `marketOverview`, `userSignals`, `competitiveMoves`, `openRisks`, `recommendations`.
   - Annotates each section with required evidence types so the skill runner can decide between cached knowledge vs. live lookup.

3. **Skill Runner**
   - Uses run settings to respect rate limits and latency (e.g. `maxLookups`, `allowExternalCalls`).
   - Executes RAG pipeline: embed query → retrieve top K → draft synthesis paragraphs with inline citations.
   - Aggregates confidence per section based on source diversity and freshness.

4. **Verifier**
   - Checks citation coverage (every factual sentence must reference at least one source).
   - Flags stale sources (>90 days) and prompts for refresh.

## Artifact Contract (v0)

```ts
interface ResearchBrief {
  marketOverview: {
    summary: string;
    trends: string[];
    tamEstimate?: string;
  };
  userSignals: Array<{
    persona: string;
    insight: string;
    sourceIds: string[];
  }>;
  competitiveMoves: Array<{
    competitor: string;
    move: string;
    impact: 'low' | 'medium' | 'high';
    sourceIds: string[];
  }>;
  openRisks: string[];
  recommendations: string[];
  sources: Record<string, {
    title: string;
    url: string;
    publishedAt?: string;
    kind: 'internal' | 'external';
  }>;
}
```

## Tooling Requirements

- Shared `ResearchSourceStore` in `packages/shared` to cache search results and minimise API churn.
- Rate limited `fetch` wrapper with exponential backoff + logging hooks for audits.
- Optional enrichment step to call summarisation LLM for long-form PDFs before citation.

## Open Questions

- Budget control: should streaming metadata include accumulated vendor cost per research run?
- Security: do we need per-request allow lists for external domains?
- Collaboration: how do we surface partially complete briefs so PMs can edit before finalising?
