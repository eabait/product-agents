import type { Artifact, ArtifactKind } from '../contracts/core'
import type { ToolDescriptor, OrchestratorInput } from '../contracts/orchestrator'

/**
 * Configuration for prompt building.
 */
export interface PromptBuilderConfig {
  /** Whether to include detailed examples */
  includeExamples?: boolean
  /** Maximum number of conversation history messages to include */
  maxHistoryMessages?: number
  /** Whether to group tools by type */
  groupToolsByType?: boolean
}

const DEFAULT_CONFIG: Required<PromptBuilderConfig> = {
  includeExamples: true,
  maxHistoryMessages: 10,
  groupToolsByType: true
}

/**
 * Format a single tool for the prompt.
 */
const formatTool = (tool: ToolDescriptor): string => {
  const inputs = tool.inputArtifacts.length > 0
    ? tool.inputArtifacts.join(', ')
    : 'none (can start from prompt)'
  const capabilities = tool.capabilities.length > 0
    ? tool.capabilities.join(', ')
    : 'general'

  return `- **${tool.label}** (id: \`${tool.id}\`)
  - Type: ${tool.type}
  - Description: ${tool.description}
  - Consumes: ${inputs}
  - Produces: ${tool.outputArtifact}
  - Capabilities: ${capabilities}`
}

/**
 * Format tools grouped by type.
 */
const formatToolsByType = (tools: ToolDescriptor[]): string => {
  const skills = tools.filter(t => t.type === 'skill')
  const subagents = tools.filter(t => t.type === 'subagent')

  const sections: string[] = []

  if (skills.length > 0) {
    sections.push(`### Skills (atomic operations)
${skills.map(formatTool).join('\n\n')}`)
  }

  if (subagents.length > 0) {
    sections.push(`### Subagents (complex workflows)
${subagents.map(formatTool).join('\n\n')}`)
  }

  return sections.join('\n\n')
}

/**
 * Format existing artifacts for context.
 */
const formatExistingArtifacts = (artifacts: Map<ArtifactKind, Artifact[]>): string => {
  if (artifacts.size === 0) {
    return 'No existing artifacts available.'
  }

  const lines: string[] = []
  artifacts.forEach((artifactList, kind) => {
    artifactList.forEach(artifact => {
      const version = artifact.version ?? 'unknown'
      const label = artifact.label ?? artifact.id
      lines.push(`- **${kind}**: ${label} (v${version})`)
    })
  })

  return lines.join('\n')
}

/**
 * Format conversation history.
 */
const formatHistory = (
  history: Array<{ role: string; content: string }> | undefined,
  maxMessages: number
): string => {
  if (!history || history.length === 0) {
    return ''
  }

  const recentHistory = history.slice(-maxMessages)
  return recentHistory
    .map(msg => `**${msg.role}**: ${msg.content}`)
    .join('\n\n')
}

/**
 * Build the output schema description for structured generation.
 */
const buildOutputSchema = (): string => {
  return `{
  "targetArtifact": "string - The final artifact kind to produce",
  "overallRationale": "string - Why this plan was chosen overall",
  "confidence": "number (0-1) - How confident you are in this plan",
  "warnings": ["string array - Any potential issues or concerns"],
  "clarifications": ["string array - Questions to ask the user if information is missing"],
  "steps": [
    {
      "id": "string - Unique step identifier (e.g., 'step-1')",
      "toolId": "string - The tool ID to use",
      "toolType": "string - Either 'skill' or 'subagent'",
      "label": "string - Human-readable description of this step",
      "rationale": "string - Why this tool was chosen for this step",
      "dependsOn": ["string array - Step IDs this step depends on"],
      "outputArtifact": "string - Expected artifact kind from this step"
    }
  ]
}`
}

/**
 * Build the planning rules section.
 */
const buildRules = (): string => {
  return `## Planning Rules

1. **Dependency Order**: Steps that produce artifacts must come before steps that consume them
2. **No Cycles**: Never create circular dependencies between steps
3. **Minimize Steps**: Only include tools that are necessary for the user's request
4. **Reuse Artifacts**: If an artifact already exists, don't regenerate it unless explicitly asked
5. **Subagents for Complete Artifacts**: Use subagents for generating complete artifacts (PRD, personas, research). The PRD subagent handles the full PRD generation workflow internally.
6. **Skills for Atomic Operations**: Use skills for specific operations that don't have a dedicated subagent
7. **Rationale Required**: Every step must explain WHY that specific tool was chosen
8. **Clarify Before Planning**: If the user's request is too vague to propose meaningful steps, return a minimal plan (0-2 steps) with clarification questions. Don't propose research on overly broad topics.

## When to Ask for Clarifications (No Research Yet)

Ask for clarifications with MINIMAL OR NO STEPS when the request is **extremely vague**:
- **Too broad to research**: "SaaS product", "mobile app", "AI tool" (entire categories, not specific domains)
- **Missing basic domain context**: No indication of what problem space or market
- **Zero user/use case info**: No hint about who would use it or why

For these cases:
- Set confidence LOW (0.2-0.5)
- Include 3+ clarification questions about: market/domain, target users, key problems/use cases
- Include 0-2 steps maximum (or empty steps array)
- Add warnings about insufficient context
- DO NOT propose research - the topic is too vague to research meaningfully

## When to Start with Research (After Basic Context)

Start with research-agent when the request has a **specific domain** but is missing details:
- **Has domain**: "mobile payment app", "fitness tracker", "project management tool" (specific enough to research)
- **Missing specifics**: No target audience, competitors, unique value prop, or detailed use cases

A request like "Create a PRD for a mobile payment app" has enough context to research (mobile payments is a specific domain).
A request like "I need a PRD for a new SaaS product" is TOO VAGUE - "SaaS" is an entire industry, not a researchable topic.

## Common Patterns

- **PRD with full context**: prd.core.agent (handles full workflow internally)
- **PRD with minimal context**: research.core.agent → persona.builder → prd.core.agent
- **Personas with minimal context**: research.core.agent → persona.builder
- **Quick Market Research**: prompt → research.core.agent`
}

/**
 * Build examples section.
 */
const buildExamples = (): string => {
  return `## Example Plans

### Example 1: User asks "I need a PRD for a task management app for remote teams that integrates with Slack and focuses on async collaboration"
{
  "targetArtifact": "prd",
  "overallRationale": "User provided detailed context: target audience (remote teams), integration requirements (Slack), and core value proposition (async collaboration). This is enough context to proceed directly with PRD generation using the PRD subagent.",
  "confidence": 0.9,
  "steps": [
    {
      "id": "step-1",
      "toolId": "prd.core.agent",
      "toolType": "subagent",
      "label": "Generate complete PRD",
      "rationale": "User provided sufficient context for the PRD subagent to handle clarification, context analysis, section writing, and assembly internally",
      "dependsOn": [],
      "outputArtifact": "prd"
    }
  ]
}

### Example 2: User asks "Research the market for AI writing tools"
{
  "targetArtifact": "research",
  "overallRationale": "User wants market research, so we should use the research agent directly",
  "confidence": 0.85,
  "steps": [
    {
      "id": "step-1",
      "toolId": "research.core.agent",
      "toolType": "subagent",
      "label": "Conduct market research",
      "rationale": "Research agent can search and synthesize market information",
      "dependsOn": [],
      "outputArtifact": "research"
    }
  ]
}

### Example 3: User asks "Create personas for my fitness app" with insufficient context
{
  "targetArtifact": "persona",
  "overallRationale": "User wants personas but hasn't provided enough context about the target market, user segments, or competitive landscape. Running research first will provide the necessary context for creating well-informed personas.",
  "confidence": 0.7,
  "warnings": ["Limited context provided - research will help define target user segments"],
  "suggestedClarifications": ["What specific fitness goals does your app target?", "Is this for beginners, athletes, or a general audience?"],
  "steps": [
    {
      "id": "step-1",
      "toolId": "research.core.agent",
      "toolType": "subagent",
      "label": "Research fitness app market and user segments",
      "rationale": "Gather market context, competitor analysis, and user segment data to inform persona creation",
      "dependsOn": [],
      "outputArtifact": "research"
    },
    {
      "id": "step-2",
      "toolId": "persona.builder",
      "toolType": "subagent",
      "label": "Generate user personas based on research",
      "rationale": "Create detailed personas using the research insights about target user segments",
      "dependsOn": ["step-1"],
      "outputArtifact": "persona"
    }
  ]
}

### Example 4: User asks "I need a PRD for a new SaaS product" (extremely vague)
{
  "targetArtifact": "prd",
  "overallRationale": "Request is too vague to propose meaningful steps - 'SaaS product' is an entire industry category, not a specific domain. Need basic context about market, target users, and problem space before we can plan any research or artifact generation.",
  "confidence": 0.3,
  "warnings": ["Extremely limited context - 'SaaS product' is too broad to research", "Please provide information about the specific market, problem, or target audience"],
  "clarifications": [
    "What specific market or industry is this SaaS product targeting? (e.g., healthcare, education, e-commerce)",
    "What problem or pain point will this product solve for users?",
    "Who are the intended users or target audience? (e.g., small businesses, enterprise teams, consumers)",
    "Are there any similar products or competitors you're aware of?"
  ],
  "steps": []
}

### Example 5: User asks "Create a PRD for a mobile payment app" (vague but has domain)
{
  "targetArtifact": "prd",
  "overallRationale": "User specified a domain (mobile payment) which is specific enough to research, but lacks details about target users, use cases, and differentiation. Starting with research will gather competitive landscape and market context to inform the PRD.",
  "confidence": 0.6,
  "warnings": ["Limited context about target users and specific use cases"],
  "clarifications": ["What makes your mobile payment app different from existing solutions like Venmo, PayPal, or Cash App?", "Who is the primary target audience? (consumers, businesses, specific demographics)"],
  "steps": [
    {
      "id": "step-1",
      "toolId": "research.core.agent",
      "toolType": "subagent",
      "label": "Research mobile payment market and competitors",
      "rationale": "Mobile payments is a specific domain we can research to understand competitive landscape, user needs, and market opportunities",
      "dependsOn": [],
      "outputArtifact": "research"
    },
    {
      "id": "step-2",
      "toolId": "prd.core.agent",
      "toolType": "subagent",
      "label": "Generate PRD using research insights",
      "rationale": "PRD subagent will use research artifact to generate a comprehensive PRD with market context",
      "dependsOn": ["step-1"],
      "outputArtifact": "prd"
    }
  ]
}

### Example 6: Refinement after clarifications - User provided domain context
**Scenario**: Original request was "I need a PRD for a new SaaS product" (too vague, returned clarifications). User then provides feedback: "It's for healthcare teams managing patient data and coordinating care across departments."

**Refined Plan**:
{
  "targetArtifact": "prd",
  "overallRationale": "User feedback provided specific domain context (healthcare, patient data management, care coordination). This is now specific enough to research. Starting with research will help understand the healthcare IT market, existing solutions (EHR systems, care coordination platforms), regulatory requirements, and user needs before building the PRD.",
  "confidence": 0.7,
  "warnings": [],
  "clarifications": [],
  "steps": [
    {
      "id": "step-1",
      "toolId": "research.core.agent",
      "toolType": "subagent",
      "label": "Research healthcare patient data management and care coordination market",
      "rationale": "Now that we have a specific domain (healthcare care coordination), research can gather competitive landscape, regulatory context, and user needs",
      "dependsOn": [],
      "outputArtifact": "research"
    },
    {
      "id": "step-2",
      "toolId": "persona.builder",
      "toolType": "subagent",
      "label": "Build healthcare team personas",
      "rationale": "Use research insights to create detailed personas for different healthcare team roles",
      "dependsOn": ["step-1"],
      "outputArtifact": "persona"
    },
    {
      "id": "step-3",
      "toolId": "prd.core.agent",
      "toolType": "subagent",
      "label": "Generate PRD using research and personas",
      "rationale": "PRD subagent will synthesize research and persona artifacts into a comprehensive PRD",
      "dependsOn": ["step-2"],
      "outputArtifact": "prd"
    }
  ]
}`
}

/**
 * PromptBuilder constructs the system and user prompts for the Orchestrator's
 * LLM-based planning.
 */
export class PromptBuilder {
  private readonly config: Required<PromptBuilderConfig>

  constructor(config?: PromptBuilderConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * Build the complete system prompt.
   */
  buildSystemPrompt(tools: ToolDescriptor[]): string {
    const toolsSection = this.config.groupToolsByType
      ? formatToolsByType(tools)
      : tools.map(formatTool).join('\n\n')

    const sections = [
      `# Product Agent Orchestrator

You are an intelligent orchestrator for a Product Agent system. Your role is to analyze user requests and create execution plans by composing available tools.

## Available Tools

${toolsSection}`,
      buildRules()
    ]

    if (this.config.includeExamples) {
      sections.push(buildExamples())
    }

    sections.push(`## Output Format

Return a valid JSON object matching this schema:

${buildOutputSchema()}

**Important**: Return ONLY the JSON object, no markdown code blocks or additional text.`)

    return sections.join('\n\n')
  }

  /**
   * Build the user prompt from orchestrator input.
   */
  buildUserPrompt(input: OrchestratorInput): string {
    const sections: string[] = []

    // User request
    sections.push(`## User Request

"${input.message}"`)

    // Existing artifacts
    sections.push(`## Existing Artifacts

${formatExistingArtifacts(input.existingArtifacts)}`)

    // Conversation history
    if (input.conversationHistory && input.conversationHistory.length > 0) {
      const historyText = formatHistory(
        input.conversationHistory,
        this.config.maxHistoryMessages
      )
      if (historyText) {
        sections.push(`## Conversation History

${historyText}`)
      }
    }

    // Target hint
    if (input.targetArtifact) {
      sections.push(`## Target Artifact Hint

The user has indicated they want a **${input.targetArtifact}** artifact.`)
    }

    // Instruction
    sections.push(`## Instructions

Analyze the user's request and create an execution plan. Consider:
1. What artifacts does the user ultimately want?
2. What tools are needed to produce those artifacts?
3. What is the correct order of operations?
4. Are there any existing artifacts we can reuse?

Provide your plan as a JSON object.`)

    return sections.join('\n\n')
  }

  /**
   * Build a refinement prompt based on user feedback.
   */
  buildRefinementPrompt(
    originalInput: OrchestratorInput,
    currentPlanJson: string,
    feedback: string
  ): string {
    return `## Current Plan

${currentPlanJson}

## User Feedback

"${feedback}"

## Original Request

"${originalInput.message}"

## Instructions

The user has provided feedback on the current plan. **Treat their feedback as additional context that enriches the original request.**

**Important**: If the current plan had clarifications and the user provided answers:
1. The feedback provides **new domain/market context** that was previously missing
2. You should **re-apply the planning rules** with this new context
3. If the request was too vague before but NOW has a specific domain (from the feedback), consider whether **research is now appropriate**
4. Follow the "When to Start with Research" vs "When to Ask for Clarifications" rules based on the COMBINED context (original + feedback)

Consider:
1. Does the feedback provide enough context to move from "too vague" to "specific domain"?
2. If so, should we start with research to gather competitive/market insights?
3. What specific changes does the user want (if they explicitly requested changes)?
4. Are there steps that should be added, removed, or reordered?
5. Should different tools be used?

Provide your revised plan as a JSON object.`
  }
}

/**
 * Create a PromptBuilder instance.
 */
export const createPromptBuilder = (config?: PromptBuilderConfig): PromptBuilder => {
  return new PromptBuilder(config)
}
