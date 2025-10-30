# Product Agent PRD Generation Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Client as Client (API/Caller)
    participant Controller as GraphController
    participant Planner as PrdPlanner
    participant SkillRunner as PrdSkillRunner
    participant Orchestrator as Legacy PRD Orchestrator
    participant Clarifier as ClarificationAnalyzer
    participant ContextAnalyzer as ContextAnalyzer
    participant SectionWriter as PRD Section Writers
    participant LLM as OpenRouterClient (LLM)
    participant Workspace as FilesystemWorkspaceDAO
    participant Verifier as PrdVerifier

    Client->>Controller: start({ runRequest, overrides })
    Controller->>Planner: createPlan(runContext)
    Planner-->>Controller: PlanDraft (PlanGraph)

    loop For each plan step
        Controller->>SkillRunner: invoke(step, context)
        SkillRunner->>Orchestrator: generateSectionsWithProgress(request)
        Orchestrator->>Clarifier: analyze(message, context)
        Clarifier->>LLM: generateStructured(prompt)
        LLM-->>Clarifier: ClarificationResult
        Clarifier-->>Orchestrator: ClarificationResult
        alt Clarification needed
            Orchestrator-->>SkillRunner: Clarification response
        else Continue generation
            Orchestrator->>ContextAnalyzer: analyze(message, context)
            ContextAnalyzer->>LLM: generateStructured(prompt)
            LLM-->>ContextAnalyzer: AnalysisResult
            ContextAnalyzer-->>Orchestrator: AnalysisResult
            loop For each targeted section
                Orchestrator->>SectionWriter: writeSection(sectionInput)
                SectionWriter->>LLM: generateStructured / generateText
                LLM-->>SectionWriter: Section draft + usage
                SectionWriter-->>Orchestrator: SectionWriterResult
            end
            Orchestrator-->>SkillRunner: SectionRoutingResponse
        end
        SkillRunner-->>Controller: SkillResult { artifact metadata }

        alt artifact returned
            Controller->>Workspace: writeArtifact(runId, artifact)
            Controller->>Workspace: appendEvent(type="artifact", payload)
        end
    end

    Controller->>Verifier: verify(artifact, runContext)
    Verifier-->>Controller: VerificationResult
    Controller->>Workspace: appendEvent(type="verification", payload)
    Controller-->>Client: ControllerRunSummary (status, artifact, events)
```

**Key Notes**

- The adapter layer (planner, skill runner, verifier) bridges the generic graph controller with the legacy PRD orchestrator while the refactor is in progress.
- `FilesystemWorkspaceDAO` maintains artifact snapshots and event journals on disk per run, ensuring parity with the future persistent workspace contract.
- Progress events emitted inside the controller can stream back to the caller (e.g., via SSE) for live run updates.
- Clarification and context analyzers (`packages/prd-agent/agent/src/prd-orchestrator-agent.ts`) call into `OpenRouterClient.generateStructured` via the analyzer base class before section drafting begins.
- Section writers (`packages/prd-agent/agent/src/section-writers/`) rely on `OpenRouterClient` methods to produce section drafts and usage metadata that the orchestrator aggregates.
