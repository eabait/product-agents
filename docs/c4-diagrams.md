# C4 Diagrams

The diagrams below use the [C4-PlantUML](https://github.com/plantuml-stdlib/C4-PlantUML) macros. Render with PlantUML (ensuring the C4 macros are available locally or via include URLs).

## Level 1: System Context

```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml

Person(user, "Product builder", "Creates and edits PRDs through the UI")
System_Boundary(platform, "Product Agents Platform") {
  System(frontend, "Frontend (Next.js)", "Chat + settings UI")
  System(api, "API Server (apps/api)", "HTTP + SSE interface to agents")
  System(agent, "Product Agent Core", "Planner + controller for PRD runs")
  System_Ext(subagents, "Registered Subagents", "Persona, story, or other agent manifests")
}

System_Ext(openrouter, "OpenRouter LLM API", "External LLM provider")
System_Ext(workspace, "Workspace Storage", "Filesystem artifacts per run")

Rel(user, frontend, "Starts PRD runs, streams progress")
Rel(frontend, api, "HTTPS/SSE requests")
Rel(api, agent, "Invokes controller", "JSON")
Rel(agent, subagents, "Delegates specialized work")
Rel(agent, openrouter, "LLM completions", "Model API")
Rel(agent, workspace, "Persist artifacts/logs")

@enduml
```

## Level 2: Container View

```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

Person(user, "Product builder")

Container_Boundary(productAgents, "Product Agents Platform") {
  Container(frontend, "Frontend (frontend/product-agent)", "Next.js 14", "Chat UI, streams progress, proxies API routes")
  Container(api, "API Server (apps/api)", "Node HTTP + Zod", "Validates payloads, streams events, manages run history")
  Container(agentCore, "Product Agent Core (packages/product-agent)", "TypeScript library", "Graph controller, planner, verifier, workspace management")
  Container(skillPack, "PRD Skill Pack (packages/skills/prd)", "TypeScript workers", "Analyzers + section writers for PRDs")
  Container(shared, "Shared libs (packages/shared/*)", "TypeScript utilities", "LLM adapters, schemas, contracts")
  Container(subagentRegistry, "Subagent Registry", "Manifests + lifecycle hooks", "Persona agent and other subagents")
  ContainerDb(workspace, "Workspace Storage", "Filesystem", "Run artifacts, events, interim drafts")
}

System_Ext(openrouter, "OpenRouter LLM API", "External model host")

Rel(user, frontend, "Uses")
Rel(frontend, api, "Calls /prd*, streams SSE")
Rel(api, agentCore, "Starts runs, passes overrides")
Rel(agentCore, skillPack, "Executes analyzers/section writers")
Rel(agentCore, shared, "Uses LLM adapters, schemas")
Rel(agentCore, subagentRegistry, "Discovers/executes subagents")
Rel(agentCore, workspace, "Persist/load artifacts")
Rel(agentCore, openrouter, "LLM completion calls")
Rel(skillPack, openrouter, "LLM prompts via shared client")

@enduml
```

## Level 3: Component View (Product Agent Core)

```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Component.puml

Container(agentCore, "Product Agent Core", "packages/product-agent")

Component(controller, "GraphController", "Orchestrates runs, emits progress, manages lifecycle")
Component(planner, "Planner (PrdPlanner)", "Builds dependency graph of skills/subagents")
Component(skillRunner, "SkillRunner (PrdSkillRunner)", "Executes skill nodes")
Component(verifier, "Verifier (PrdVerifier)", "Checks outputs, may gate or request input")
Component(workspace, "Workspace DAO", "Filesystem persistence for artifacts/events")
Component(subagentReg, "Subagent Registry", "Registers manifests, resolves subagent handlers")
Component(subagents, "Subagents (Persona, etc.)", "Specialized delegates invoked from plans")
Component(skillPack, "PRD Skills", "Analyzers and section writers")
Component(llm, "LLM Client", "Shared client to OpenRouter")

Rel(controller, planner, "Requests plan graph")
Rel(controller, skillRunner, "Executes planned steps")
Rel(controller, verifier, "Submits artifacts for QA")
Rel(controller, workspace, "Persist artifacts + events")
Rel(controller, subagentReg, "Resolves subagents in plan")
Rel(planner, subagentReg, "Incorporates subagent steps")
Rel(skillRunner, skillPack, "Invokes analyzers/writers")
Rel(skillRunner, llm, "Sends prompts via shared client")
Rel(verifier, llm, "LLM-backed validation")
Rel(skillRunner, workspace, "Write artifacts per step")
Rel(verifier, workspace, "Store verification results")
Rel(subagents, llm, "Calls models via shared client")
Rel(subagents, workspace, "Store their outputs")

@enduml
```
