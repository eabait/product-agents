# Persona Creation Sequence

The diagram shows how a persona request flows through the planner, graph controller, and persona subagent to produce a `persona` artifact. The planner is artifact-agnostic: it selects a core builder from a registry (PRD by default) and only seeds `prompt` when a subagent allows it. The controller chooses verifiers by artifact kind from its registry and skips verification if no matching verifier exists. A clarification intent short-circuits execution until the user responds.

```plantuml
@startuml
title Persona Creation Flow

actor User
participant "GraphController\npackages/product-agent/src/controller/graph-controller.ts" as GC
participant "WorkspaceDAO" as WS
participant "IntelligentPlanner\npackages/product-agent/src/planner/intelligent-planner.ts" as IP
participant "IntentResolver\npackages/product-agent/src/planner/intent-resolver.ts" as IR
participant "IntentClassifierSkill\n@product-agents/skills-intent" as IC
participant "SubagentRegistry\n(config + manifests)" as SRG
participant "SkillRunner\n(PRD skills)" as SR
participant "Persona Subagent\npersona.builder" as PS
participant "PersonaAgentRunner\npackages/persona-agent/agent/src/persona-agent-runner.ts" as PAR
participant "VerifierRegistry\ncontroller composition" as VR

User -> GC: start(request targeting persona)
GC -> WS: ensureWorkspace(runId, artifactKind)
GC -> IP: createPlan(runContext)
IP -> IR: resolve(runContext)
IR -> IC: classify(message, availableArtifacts)
IC --> IR: IntentClassifierOutput(chain: prd -> persona | prompt -> persona | needs-clarification)
IR --> IP: ArtifactIntent(transitions, status: ready|needs-clarification)
IP -> IP: select core builder (PRD) if transitions include prd
IP -> IP: buildPrdCoreSegment() when PRD needed\nclarification -> analyze -> write sections -> assemble PRD
IP -> SRG: list persona.builder\n(consumes prd or prompt)
IP -> IP: buildTransitionSegments()\nlocate persona.builder subagent
IP --> GC: PlanGraph(transitionPath: prd -> persona OR prompt -> persona,\nentry: core or subagent)
GC -> WS: append plan event

== Execute plan ==
alt intent.status == needs-clarification
  GC --> User: clarification needed\n(plan awaits input)
else
  loop PRD skill nodes (only if core PRD segment present)
    GC -> SR: execute skill node
    SR --> GC: SkillResult + PRD Artifact
    GC -> WS: writeArtifact(prd)
  end
  GC -> PS: execute persona.builder\nsourceArtifact = latest PRD (if present)
  PS -> PAR: run(model, sections, prompt summary)
  PAR --> PS: personas (LLM or heuristic)
  PS --> GC: PersonaArtifact + metadata
  GC -> WS: writeArtifact(persona)\nrecord subagent result
  GC -> VR: resolve verifier for artifact.kind
  alt verifier found
    GC -> VR: verify persona artifact
  else
    GC -> GC: skip verification\n(no matching verifier)
  end
  GC --> User: ControllerRunSummary\nstatus: completed, artifact: persona
end
@enduml
```
