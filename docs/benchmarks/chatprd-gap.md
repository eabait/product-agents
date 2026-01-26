# ChatPRD vs Product Agents (gap analysis)

This is a feature benchmarking snapshot comparing ChatPRD (as advertised on public pages) against this repo’s current capabilities.

**Evidence sources (ChatPRD):**
- https://chatprd.ai (homepage)
- https://chatprd.ai/pricing (pricing/features)

**Important limitations**
- I can’t interact with your logged-in session at https://app.chatprd.ai/chat from this environment, so this does **not** include in-app/behind-login features (e.g., actual editor capabilities, workflows, permissions, analytics, etc.).
- Any ChatPRD capability not explicitly observed on the sources above is marked as “unknown”.

## Feature matrix (high-signal items)

Legend: ✅ = present, ⚠️ = partial/exists but not as a productized feature, ❌ = missing, ? = unknown

| Area | Feature | ChatPRD (observed) | Product Agents (this repo) | Gap / Notes |
|---|---|---:|---:|---|
| Outputs | PRDs | ✅ | ✅ | Your PRD output is a structured 5-section PRD (`targetUsers`, `solution`, `keyFeatures`, `successMetrics`, `constraints`) via skills/subagents. |
| Outputs | User stories | ✅ (homepage copy) | ❌ | No first-class “user stories” artifact/skill pack in this repo. |
| Outputs | Technical specs | ✅ (homepage copy) | ❌ | No first-class “tech spec” artifact/skill pack in this repo. |
| Outputs | Other PM docs (e.g., PR/FAQ, roadmap) | ⚠️ (pricing FAQ mentions PR/FAQs + “document mode”) | ❌/⚠️ | You can generate arbitrary text, but there’s no dedicated artifact kinds/templates/UI flow for these doc types. |
| Templates | Basic templates | ✅ (Free plan) | ❌ | Your PRD schema is fixed; no template selection UI or template library. |
| Templates | Custom templates | ✅ (Pro/Teams) | ❌ | No “template authoring” or per-project template customization. |
| Knowledge | Projects w/ saved knowledge | ✅ (Pro/Teams) | ⚠️ | You have a local “context panel” + filesystem workspace artifacts, but no explicit “project” entity, shared knowledge base, or cross-doc retrieval UX. |
| Collaboration | Team workspace | ✅ (Teams) | ❌ | No multi-user accounts/workspaces. |
| Collaboration | Real-time doc collaboration | ✅ (Teams) | ❌ | No real-time multi-editor sync. |
| Collaboration | Comments on documents | ✅ (Teams) | ❌ | No commenting model/UI. |
| Integrations | Slack integration | ✅ (homepage + pricing) | ❌ | No Slack integration. |
| Integrations | Linear integration | ✅ (homepage + Teams) | ❌ | No Linear integration. |
| Integrations | Google Drive integration | ✅ (homepage + Pro) | ❌ | No Drive integration. |
| Integrations | Notion export/sync | ✅ (homepage + Pro) | ⚠️ | You can export Markdown; no Notion API export. |
| Integrations | Confluence | ✅ (homepage) | ❌/⚠️ | No Confluence export/integration. |
| UX/Flow | “Document mode” | ✅ (pricing FAQ) | ✅ | You have PRD editor UI + chat, plus section-level editing and regeneration. |
| UX/Flow | Plan review before execution | ? | ✅ | You support manual plan approval (`/runs` + `/runs/:id/approve`) and subagent plan approval/resume (`/runs/:id/subagent/:stepId/approve`). |
| Research | Web research toolchain | ? | ✅ | Research subagent plans + runs web search (Tavily) and can require plan confirmation. |
| Extensibility | Pluggable tool/subagent registry | ? | ✅ | Explicit manifests, dynamic loading, tool discovery, and orchestrator planning over available tools. |
| Deployment | Self-host | ? | ✅ | You can run locally; ChatPRD is SaaS (from public pages). |

## Biggest product gaps (if your goal is “ChatPRD-like”)

1) **Templates as a product surface**
   - Template library + template picker per doc/artifact.
   - “Custom templates” authoring (fields/sections, tone, formatting) stored per user/project.

2) **Projects & knowledge**
   - First-class `Project` model with persistent knowledge (context items, past docs, decisions).
   - Retrieval UX (what knowledge was used; pin/lock sources; reuse across docs).

3) **Collaboration**
   - Auth + team workspaces.
   - Document sharing, comments, and presence/real-time editing (or at least async collaboration + reviews).

4) **Integrations/export**
   - Notion export, Google Drive, Slack/Linear push (and/or Jira/Confluence equivalents).
   - “Doc destinations” and sync status.

5) **Doc type breadth**
   - Add artifact kinds and UI flows for user stories + technical specs (and optionally PR/FAQ, roadmap).

## Where Product Agents is already strong / differentiated

- **Transparent execution**: step-level plan graph + streaming progress events + subagent approval/resume flows.
- **Composable architecture**: skills + subagents with manifests, tool discovery, and a planner/orchestrator that can evolve.
- **Self-host + model flexibility**: OpenRouter-backed model selection and per-run overrides; optional telemetry via Langfuse/OTEL.

## Next: how to make this comparison “real”

If you want an accurate gap analysis vs the *actual* ChatPRD app (not just marketing/pricing):
- Send screenshots (or a quick screen recording) of: doc types menu, template editor, projects/knowledge, collaboration/comments, and integrations screens.
- Or paste a short feature list from the in-app settings/sidebar.

## Suggested benchmark suite (prompts + scoring)

Run each scenario in both tools and capture: final doc output, intermediate questions, and time-to-draft.

### Scenarios

1) **Greenfield PRD (moderately specified)**
   - Prompt: “PRD for a B2B SaaS that helps finance teams reconcile corporate card spend. Must integrate with NetSuite and Slack.”

2) **Greenfield PRD (too vague → clarifications)**
   - Prompt: “PRD for a new SaaS product.”
   - Evaluate: how the system asks clarifying questions and whether it avoids premature research/speculation.

3) **Feature PRD (existing product context)**
   - Prompt: “Add ‘bulk edit’ to an existing task manager; users complain edits are slow. Write PRD.”
   - Provide: a short paragraph of existing product context + constraints.

4) **Section regeneration/edit workflow**
   - Start from a generated PRD, then ask: “Regenerate success metrics to be more measurable and add timelines.”
   - Evaluate: how cleanly it updates only the relevant portion.

5) **Personas from PRD**
   - Prompt: “Generate 3 personas for the PRD above, including jobs-to-be-done and objections.”

6) **Research-first workflow**
   - Prompt: “Research the competitive landscape for mobile expense management in the US and summarize key opportunities.”

7) **User stories + acceptance criteria**
   - Prompt: “Create user stories (with acceptance criteria) for the top 5 features in this PRD.”

8) **Technical spec**
   - Prompt: “Write a technical spec for implementing NetSuite + Slack integrations, including APIs, data flow, and failure modes.”

### Scoring rubric (1–5 each)

- **Coverage**: includes the expected components for the doc type (sections, decisions, edge cases).
- **Specificity**: concrete requirements, constraints, measurable metrics (not generic filler).
- **Consistency**: no contradictions; terminology is stable; aligns with provided context.
- **Actionability**: engineering/design can execute (clear acceptance criteria, prioritized scope).
- **Editability**: can revise a single section without rewriting everything or drifting.
- **Traceability**: clear linkage from problem → user needs → solution → metrics (and persona/research linkage when relevant).

### Feature verification checklist (binary)

- Template selection/customization exists (Y/N)
- Project knowledge base exists and is reused across docs (Y/N)
- Export/sync to Notion/Drive (Y/N), push to Linear/Slack (Y/N)
- Collaboration: comments (Y/N), real-time co-edit (Y/N), sharing/permissions (Y/N)
