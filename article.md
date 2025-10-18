# Building a PRD Agent: Iterating on Patterns, Context, and UX

I started this repository as a side project to stretch my understanding of how to design AI agents, especially with the practices Anthropic outlined in “Building Effective Agents.”<sup>[1](https://www.anthropic.com/engineering/building-effective-agents)</sup> I wanted a hands-on way to test emerging orchestration patterns, experiment with new UI affordances, and explore what it really takes to generate and maintain a living product requirements document (PRD) with LLMs.

The result is a TypeScript monorepo that blends an agent backend (AI SDK, Zod-validated schemas, orchestrator + subagents) with a Next.js frontend where I could obsess over the user experience. Along the way I re-architected the system twice, collected a pile of hunches about context management, and became increasingly convinced—at least for my own workflows—that UX has to sit at the same table as agent logic from day one.

Nothing here has been validated with users yet; it’s an exploratory lab notebook, not a production postmortem. Treat the following sections as ideas, principles I’m testing, and hypotheses about what might matter when you build agent tooling.

---

## Audience and Tooling Snapshot

- **Audience:** Staff-level AI engineers and product-minded builders who already speak the language of LLM orchestration but want a deeper dive into practical design trade-offs.
- **Stack:** TypeScript monorepo, Next.js frontend, custom agent runtime using the Vercel AI SDK, Zod for schema enforcement, serverless-friendly orchestration.
- **Reading foundations:** Anthropic’s playbooks on agent design and context engineering,<sup>[1](https://www.anthropic.com/engineering/building-effective-agents), [2](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)</sup> plus Dan Breunig’s essays on how context fails and how to fix it.<sup>[3](https://www.dbreunig.com/2025/06/22/how-contexts-fail-and-how-to-fix-them.html), [4](https://www.dbreunig.com/2025/06/26/how-to-fix-your-context.html)</sup>

---

## From Idea to Initial Architecture (v0)

I began with the simplest possible framing: build an agent that gathers inputs (kickoff notes, research, feature requests) and outputs a coherent PRD. The first version followed a straightforward orchestrator-subagent model:

1. **Orchestrator**: Receives the user prompt and selects a fixed sequence of workers.
2. **Analyzers**: Subagents that extract user personas, pain points, and competitor insights.
3. **Change Worker**: Applies the analyzers’ findings to a monolithic PRD template.

It worked for simple drafts, but three problems surfaced immediately:

- **Context Blindness:** Inputs ballooned quickly; the agent lacked a disciplined way to prioritize or trim context. I often exceeded model limits or saw hallucinations tied to stale snippets.
- **Rigid Orchestration:** The orchestrator ran every subagent in a predetermined order. Even small edits resulted in full-document rewrites, wasting tokens and time.
- **Opaque UX:** The UI treated the agent like a black box. Users (including me) saw a spinner and a wall of text. No cost visibility, no configurability, no sense of what context the model consumed.

The project needed more than incremental tweaks; it demanded a rethink guided by the best practices in the Anthropic articles and Breunig’s context postmortems.

---

## Iteration One: Designing for Context Awareness

The first redesign focused on taming context. Anthropic’s recommendation to “plan the agent’s cognition” pushed me to model distinct context phases: ingestion, synthesis, and application. Breunig’s critique of “bag-of-text prompts” reinforced the idea that context should be curated, not dumped wholesale.

### Architectural Shifts

- **Clarification Subagent:** Before anything is drafted, a dedicated clarifier loops with the user (up to three turns) to solicit missing details—target personas, success metrics, risk tolerances. Once the subagent is confident the inputs meet a minimum completeness threshold, it signals the orchestrator to proceed.
- **Context Handling:** Analyzer calls carry the raw context payload, any existing PRD, and snippets from the conversation history. Each analyzer restructures what it needs on demand, and the orchestrator controls what flows forward to the section writers.
- **Schema-Centric Outputs:** Using Zod, every analyzer now returns structured summaries (personas, goals, constraints). The orchestrator caches those results in a shared analysis bundle so section writers can reuse them without reprocessing raw inputs.
- **Dual Context Pipelines:** I separated *creation* context (used to draft new sections) from *editing* context (diffs, feedback, change requests). This distinction, inspired by context-engineering best practices,<sup>[2](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)</sup> aims to avoid the common trap of mixing contradictory instructions.

### Early Observations

In my own dogfooding runs, drafts felt more grounded and the agent stopped hallucinating details from outdated inputs. Yet orchestration remained overly rigid. I still regenerated an entire PRD when the user asked to “update the target personas for LATAM,” even though only one subsection changed. Context was healthier, but editing was clumsy—a signal for the next iteration.

---

## Iteration Two: UX-Driven Agenting

The second redesign started not with the agent, but with the interface. I mapped the user journey and realized there are two distinct modes: **artifact creation** and **artifact editing**. Each requires different affordances, different context, and different orchestration strategies.

### Key UX Principles I Adopted

1. **Cost Visibility:** Surfacing estimated token usage and dollar cost per run. Engineers care about the burn.
2. **Configurability:** Exposing agent and subagent toggles—temperature, model choice, context filters—without forcing a detour into config files.
3. **Context Control:** Letting the user see and curate what the agent ingests. Every context chunk is inspectable and removable.
4. **Artifact-Specific Rendering:** PRDs are structured documents; the UI renders them with custom components (section headers, inline comments, diff views) instead of plain markdown.

### Architectural Changes Backing the UX

- **Section Writers:** The monolithic Change Worker was replaced with dedicated writers for every PRD section (Context, Personas, Requirements, Scope, Metrics, etc.). Each writer consumes the shared analysis bundle and outputs PRD-ready prose.
- **Editing Subagent:** I added a classifier that maps user change requests to the correct section. When someone says, “Change user personas to be from LATAM,” the system routes only the Personas writer, preserving other sections.
- **Orchestrator Hooks:** The orchestrator still coordinates everything, but now it exposes hooks for the UI to retrieve intermediate artifacts—context slices, analyzer outputs, writer drafts. That data powers the configurability panels and context inspector.
- **Immutable Audit Trail:** Every run captures analyzer outputs, section-level metadata, and usage stats. The UI replays this history so users can compare drafts or diagnose odd behavior.

The payoff, at least in my solo testing, was noticeable. Editing felt faster and more surgical, the UX surfaced the agent’s decision-making, and I stopped wasting tokens rewriting sections that never changed. The system started to feel more like a collaborative tool than a magic trick.

---

## Custom UI Components for Agent Artifacts

I underestimated how much custom UI work an agent-facing product needs. Generic chat UIs fall short when your agent produces rich artifacts. Here are the components that seem to matter in this experiment:

- **PRD Section Renderer:** Renders each section with contextual metadata—last updated timestamp, responsible writer, source citations. Users can collapse, comment, or request edits in place.
- **Context Inspector:** A side panel listing the curated context items the user has stored—each with source type, token footprint, and an option to remove or pin them. Inspired by Breunig’s “fix your context” advice,<sup>[4](https://www.dbreunig.com/2025/06/26/how-to-fix-your-context.html)</sup> it gives humans a say before the model hallucinates.
- **Configuration Drawer:** Toggles for model selection, temperature, max tokens, and even which analyzers are allowed to fire. It’s opinionated yet explorable.
- **Cost Meter:** Tracks estimated token usage for the current run and displays rolling totals. It’s a nudge toward responsible experimentation.

Some experiments stalled. I prototyped a “context suggestion” component that would recommend dropping low-signal sources, but without real users it was impossible to gauge whether the heuristics were helpful or annoying. Even so, the exercise nudged me toward the hypothesis that agent UX is a domain-specific design problem—no one-size-fits-all framework exists yet.

---

## Platform Foundations and Model Routing

Under the hood this project is also a platform bet. The Turborepo monorepo pulls every agent—PRD, research, personas, story mapping, story generation—into a single workspace, with shared packages doing the heavy lifting. `@product-agents/agent-core` defines extensible orchestration primitives (base agents, worker abstractions, usage tracking), `@product-agents/ui-components` ships reusable React controls for settings and chat flows, and `@product-agents/openrouter-client` centralizes cost accounting alongside the Vercel AI SDK integration. With everything co-located, both humans and future coding agents can discover capabilities without hopping repos.

OpenRouter is the configurability engine. The frontend hits OpenRouter’s model catalog, enriches each model with pricing and context metadata, and then filters choices by the capabilities each subagent declares in its metadata. In theory that gives me the “best fit” model per workflow—streaming writers get streaming models, analyzers that use tools land on tool-capable backends. In practice the heuristic mapping is too strict; some perfectly capable models are filtered out because OpenRouter’s metadata doesn’t advertise a parameter I expect. I’m keeping the safeguards for now but plan to loosen the filter and expose manual overrides so advanced users can opt into models that aren’t yet tagged with my capability taxonomy.

---

```mermaid
flowchart LR
    subgraph V0[Iteration 0 – Initial Architecture]
        A0[User Prompt] --> B0[Orchestrator<br/>Fixed sequence]
        B0 --> C0[Analyzers<br/>(Personas, Pain Points, Research)]
        C0 --> D0[Change Worker<br/>Apply patches to PRD template]
        D0 --> E0[Monolithic PRD Output]
    end

    subgraph V1[Iteration 1 – Context Awareness]
        A1[User Prompt + Inputs] --> B1[Clarification Analyzer<br/>(0–3 clarification loops)]
        B1 --> C1[Context Analyzer<br/>Structured summaries via Zod]
        C1 --> D1[Shared Analysis Bundle]
        D1 --> E1[Section Writers v1<br/>(Regenerate full PRD)]
        E1 --> F1[Assembled PRD + Metadata]
    end

    subgraph V2[Iteration 2 – UX-driven Agent]
        A2[User Prompt / Edit Request] --> B2[Clarification Analyzer<br/>(loop until confident)]
        A2 -.existing PRD.- C2[Editing Intent Classifier<br/>(Section detection)]
        B2 --> D2[Context Analyzer]
        D2 --> E2[Shared Analysis Bundle]
        C2 --> G2[Targeted Section List]
        E2 --> H2[Section Writers v2<br/>(Target Users, Solution, Features, Metrics, Constraints)]
        G2 --> H2
        H2 --> I2[Section Outputs + Confidence]
        I2 --> J2[Orchestrator Merge]
        J2 --> K2[Final PRD + Audit Trail<br/>(usage, costs, context snapshot)]
    end

    V0 -->|"Pain points discovered"| V1
    V1 -->|"UX hypotheses + section writers"| V2
```

---

## Development Workflow

This wasn’t a solo slog in a vacuum. I leaned heavily on AI-native workflows, starting every architectural conversation inside Claude’s Projects. I collected the Anthropic best practice articles, my own deep-dive research on product management techniques, and even dropped wireframe images so Claude had visual anchors. That context let Claude suggest design moves that echoed the principles I cared about.

I mirrored the same approach in ChatGPT, keeping a parallel project for functionality debates and technical design reviews. Once Claude or ChatGPT helped me shape a coherent doc, I’d hand that artifact to Claude Code or Codex to draft an implementation plan. From there I always worked in small slices: ask the coding agent to implement one thin vertical feature with unit tests, review the diff, run tests locally, and only commit when the quality bar—tempered for an exploratory build—was met. The discipline of small, test-backed increments kept me from “vibe coding” sprawling features that might not survive the next iteration.

To make that collaboration repeatable, I wrote AGENT.md and CLAUDE.md guides so future coding agents know the conventions, patterns, and expectations. Standardizing on TypeScript, Node.js, and React also matters; today’s AI pair programmers understand that stack far better than niche ecosystems, so they can contribute meaningfully with minimal ramp.

---

## Orchestration Patterns and Remaining Gaps

Even after two iterations, the orchestrator is intentionally conservative. Subagent invocation is still defined in code rather than dynamically learned. That decision trades flexibility for predictability; I can reason about the graph, test it, and expose it in the UI. But it leaves future opportunities on the table:

- **Dynamic Routing:** I’d like the orchestrator to choose subagents based on runtime signals—confidence scores, context drift, or user preferences—without hardcoding the paths.
- **Feedback Loops:** Today, analyzers feed writers, but writers don’t feed back improvement signals. Closing that loop (e.g., writer detects missing personas, asks analyzer to hunt for them) would push the system toward self-healing behavior.
- **Cross-Section Consistency Checks:** I perform lightweight validations (scope vs. requirements mismatches), but deeper semantic checks require either an additional verification agent or symbolic rules.

Anthropic’s guidance gave me a solid foundation, yet implementing it exposed all the messy middle-ground decisions. The best practices are signposts, not plug-and-play modules.

---

## Creation vs. Edition: A Tale of Two Workflows

Separating creation and edition might be the most consequential design choice in this project so far.

- **Creation Mode:** High-context runs where the agent synthesizes large inputs into coherent drafts. Section writers operate in sequence, and the UI emphasizes transparency—show me what you read, which analyzers fired, and how much it cost.
- **Edition Mode:** Precision updates triggered by user feedback. The editing subagent classifies the change, pulls only the relevant context, and re-invokes the targeted writer. The UI focuses on diffing, rollback, and audit history.

The division also influenced testing. Creation runs are evaluated holistically (does the PRD hang together?), while edition runs are regression-tested to ensure untouched sections stay untouched. It’s a mindset shift: treat editing as a first-class product experience, not a bonus feature.

---

## Working Hypotheses for Builders

1. **Context Might Be a Product Surface:** I keep coming back to the idea that exposing what the agent knows—and letting humans curate it—will make debugging and iteration easier.
2. **UX and Orchestration Probably Co-Evolve:** When I invest in frontend configurability, I inevitably add backend hooks and telemetry. The coupling feels healthy so far.
3. **Schema Everything (Maybe):** Enforcing Zod schemas has reduced glue-code thrash for me. I suspect structured outputs are a worthwhile constraint, even if they add overhead.
4. **Separate Creation from Editing:** Treating those workflows differently seems to reduce regressions and improve clarity, though I still need data from real teams.
5. **Stay Candid About Gaps:** Writing down the trade-offs—like hardcoded subagent routing—helps me, and hopefully future contributors, remember what still needs exploration.

---

## What’s Next

The repository is usable, but unfinished by design. My near-term roadmap:

- **Dynamic Orchestration Experiments:** Introduce heuristics or lightweight policies to decide which analyzers fire per request.
- **Real-World Feedback:** Put the tool in the hands of product managers to validate the UX assumptions and context controls.
- **Verification Agents:** Add a reviewer agent focused on cross-section consistency and requirement traceability.
- **Context Suggestion UI:** Revive the experiment that proposes context pruning automatically, grounded in Breunig’s principles.
- **Platformizing the Monorepo:** Grow the shared packages into a reusable foundation so future agents—say, a User Personas specialist or a User Story Mapping agent that consumes PRDs to generate epics—live in the same codebase. Keeping everything under one roof also helps coding agents discover components without spelunking across repos.

If any of these themes resonate, explore the code, fork the repo, or reach out. Agents are still an emerging discipline, and we need more field reports that blend architecture, UX, and raw lessons learned. This project started as a personal lab; maybe—after more feedback and experimentation—it can grow into a playbook for building domain-specific agent experiences.

---

**References**

1. Anthropic, “Building Effective Agents.” https://www.anthropic.com/engineering/building-effective-agents  
2. Anthropic, “Effective Context Engineering for AI Agents.” https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents  
3. Dan Breunig, “How Contexts Fail (and How to Fix Them).” https://www.dbreunig.com/2025/06/22/how-contexts-fail-and-how-to-fix-them.html  
4. Dan Breunig, “How to Fix Your Context.” https://www.dbreunig.com/2025/06/26/how-to-fix-your-context.html
