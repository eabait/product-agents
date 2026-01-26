import { generateText } from 'ai'
import {
  withSpan,
  createPlanSpan,
  isObservabilityEnabled,
  getObservabilityTransport,
  recordGeneration
} from '@product-agents/observability'

import type { RunContext } from '../contracts/core'
import type {
  Orchestrator,
  OrchestratorConfig,
  OrchestratorInput,
  OrchestratorPlanProposal,
  OrchestratorRefineInput,
  ToolDescriptor
} from '../contracts/orchestrator'
import type { ProductAgentConfig } from '../config/product-agent.config'
import type { SkillCatalog } from '../planner/skill-catalog'
import type { SubagentRegistry } from '../subagents/subagent-registry'

import { ToolDiscovery, createToolDiscovery } from './tool-discovery'
import { PromptBuilder, createPromptBuilder } from './prompt-builder'
import { createPlanTranslator } from './plan-translator'
import {
  createOpenRouterProvider,
  resolveOpenRouterModel,
  type OpenRouterProvider
} from '../providers/openrouter-provider'

/**
 * Options for creating an LLMOrchestrator.
 */
export interface LLMOrchestratorOptions {
  /** Product agent configuration */
  config: ProductAgentConfig
  /** Skill catalog for tool discovery */
  skillCatalog: SkillCatalog
  /** Subagent registry for tool discovery */
  subagentRegistry: SubagentRegistry
  /** Optional orchestrator-specific config overrides */
  orchestratorConfig?: Partial<OrchestratorConfig>
  /** Optional custom provider factory */
  providerFactory?: (apiKey?: string) => OpenRouterProvider
  /** Optional custom text generator (for testing) */
  textGenerator?: typeof generateText
  /** Optional clock function */
  clock?: () => Date
}

/**
 * Default orchestrator configuration.
 */
const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  model: 'anthropic/claude-sonnet-4',
  temperature: 0.3,
  maxTokens: 4096,
  includeRationales: true,
  maxPlanSteps: 15
}

/**
 * LLMOrchestrator implements the Orchestrator interface using an LLM
 * to generate execution plans from user requests.
 *
 * It replaces both IntentClassifier and IntelligentPlanner with a unified
 * approach that can reason about all available tools and generate
 * plans with per-step rationales.
 */
export class LLMOrchestrator implements Orchestrator {
  private readonly productConfig: ProductAgentConfig
  private readonly orchestratorConfig: OrchestratorConfig
  private readonly toolDiscovery: ToolDiscovery
  private readonly promptBuilder: PromptBuilder
  private readonly providerFactory: (apiKey?: string) => OpenRouterProvider
  private readonly textGenerator: typeof generateText
  private readonly clock: () => Date

  constructor(options: LLMOrchestratorOptions) {
    this.productConfig = options.config
    this.orchestratorConfig = {
      ...DEFAULT_ORCHESTRATOR_CONFIG,
      model: options.config.runtime.defaultModel,
      temperature: options.config.runtime.defaultTemperature,
      ...options.orchestratorConfig
    }

    this.toolDiscovery = createToolDiscovery({
      skillCatalog: options.skillCatalog,
      subagentRegistry: options.subagentRegistry,
      enableCache: true
    })

    this.promptBuilder = createPromptBuilder({
      includeExamples: true,
      maxHistoryMessages: 10,
      groupToolsByType: true
    })

    this.providerFactory =
      options.providerFactory ??
      ((apiKey?: string) => createOpenRouterProvider(this.productConfig, { apiKey }))

    this.textGenerator = options.textGenerator ?? generateText
    this.clock = options.clock ?? (() => new Date())
  }

  /**
   * Discover all available tools (skills and subagents).
   */
  async discoverTools(): Promise<ToolDescriptor[]> {
    return this.toolDiscovery.discoverAll()
  }

  /**
   * Generate a plan proposal for the given input.
   */
  async propose(
    input: OrchestratorInput,
    context?: RunContext
  ): Promise<OrchestratorPlanProposal> {
    const runId = context?.runId ?? `run-${Date.now()}`

    return withSpan(createPlanSpan({ action: 'propose', runId }), async () => {
      const tools = await this.discoverTools()

      // Build prompts
      const systemPrompt = this.promptBuilder.buildSystemPrompt(tools)
      const userPrompt = this.promptBuilder.buildUserPrompt(input)

      // Get API key from context or environment
      const apiKey = this.resolveApiKey(context)
      const provider = this.providerFactory(apiKey)
      const model = resolveOpenRouterModel(
        provider,
        this.productConfig,
        this.orchestratorConfig.model
      )

      // Generate plan using LLM with tracing (telemetry enabled for OTEL transport)
      const telemetryEnabled = isObservabilityEnabled() && getObservabilityTransport() === 'otel'
      const startTime = new Date().toISOString()
      const response = await this.textGenerator({
        model: model as any,
        system: systemPrompt,
        prompt: userPrompt,
        maxOutputTokens: this.orchestratorConfig.maxTokens,
        temperature: this.orchestratorConfig.temperature,
        experimental_telemetry: { isEnabled: telemetryEnabled }
      })

      // Record the generation with full prompts for Langfuse visibility
      const modelId = typeof (model as any)?.modelId === 'string' ? (model as any).modelId : this.orchestratorConfig.model
      void recordGeneration({
        name: 'orchestrator.propose',
        model: modelId,
        input: {
          system: systemPrompt,
          prompt: userPrompt,
          message: input.message,
          targetArtifact: input.targetArtifact
        },
        output: response.text,
        startTime,
        endTime: new Date().toISOString(),
        usage: response.usage ? {
          promptTokens: response.usage.inputTokens,
          completionTokens: response.usage.outputTokens,
          totalTokens: response.usage.totalTokens
        } : undefined,
        modelParameters: {
          temperature: this.orchestratorConfig.temperature,
          maxTokens: this.orchestratorConfig.maxTokens
        },
        metadata: {
          runId,
          action: 'propose'
        }
      })

      // Parse and translate the response
      const translator = createPlanTranslator({
        tools,
        runId,
        clock: this.clock
      })

      const rawOutput = translator.parseOutput(response.text)
      const proposal = translator.translate(rawOutput)

      return proposal
    })
  }

  /**
   * Refine an existing plan based on user feedback.
   */
  async refine(input: OrchestratorRefineInput): Promise<OrchestratorPlanProposal> {
    const runId = input.currentPlan.id.replace('plan-', '') || `run-${Date.now()}`

    return withSpan(createPlanSpan({ action: 'refine', runId }), async () => {
      const tools = await this.discoverTools()

      // Build prompts
      const systemPrompt = this.promptBuilder.buildSystemPrompt(tools)
      const currentPlanJson = JSON.stringify({
        targetArtifact: input.currentPlan.artifactKind,
        overallRationale: (input.currentPlan.metadata as any)?.overallRationale ?? '',
        confidence: (input.currentPlan.metadata as any)?.confidence ?? 0.5,
        steps: input.currentSteps.map(step => ({
          id: step.id,
          toolId: step.toolId,
          toolType: step.toolType,
          label: step.label,
          rationale: step.rationale,
          dependsOn: step.dependsOn,
          outputArtifact: step.outputArtifact
        }))
      }, null, 2)

      const refinementPrompt = this.promptBuilder.buildRefinementPrompt(
        input.originalInput,
        currentPlanJson,
        input.feedback
      )

      // Get API key from environment
      const apiKey = process.env.OPENROUTER_API_KEY
      const provider = this.providerFactory(apiKey)
      const model = resolveOpenRouterModel(
        provider,
        this.productConfig,
        this.orchestratorConfig.model
      )

      // Generate refined plan using LLM with tracing (telemetry enabled for OTEL transport)
      const telemetryEnabled = isObservabilityEnabled() && getObservabilityTransport() === 'otel'
      const startTime = new Date().toISOString()
      const response = await this.textGenerator({
        model: model as any,
        system: systemPrompt,
        prompt: refinementPrompt,
        maxOutputTokens: this.orchestratorConfig.maxTokens,
        temperature: this.orchestratorConfig.temperature,
        experimental_telemetry: { isEnabled: telemetryEnabled }
      })

      // Record the generation with full prompts for Langfuse visibility
      const modelId = typeof (model as any)?.modelId === 'string' ? (model as any).modelId : this.orchestratorConfig.model
      void recordGeneration({
        name: 'orchestrator.refine',
        model: modelId,
        input: {
          system: systemPrompt,
          prompt: refinementPrompt,
          originalMessage: input.originalInput.message,
          feedback: input.feedback,
          currentPlan: currentPlanJson
        },
        output: response.text,
        startTime,
        endTime: new Date().toISOString(),
        usage: response.usage ? {
          promptTokens: response.usage.inputTokens,
          completionTokens: response.usage.outputTokens,
          totalTokens: response.usage.totalTokens
        } : undefined,
        modelParameters: {
          temperature: this.orchestratorConfig.temperature,
          maxTokens: this.orchestratorConfig.maxTokens
        },
        metadata: {
          runId,
          action: 'refine'
        }
      })

      // Parse and translate the response
      const translator = createPlanTranslator({
        tools,
        runId,
        clock: this.clock
      })

      const rawOutput = translator.parseOutput(response.text)
      const proposal = translator.translate(rawOutput)

      return proposal
    })
  }

  /**
   * Resolve API key from context or environment.
   */
  private resolveApiKey(context?: RunContext): string | undefined {
    if (!context) {
      return process.env.OPENROUTER_API_KEY
    }

    // Try to get from request attributes
    const attributeKey =
      typeof context.request.attributes?.apiKey === 'string'
        ? (context.request.attributes.apiKey as string)
        : undefined

    // Try to get from input settings
    const input = context.request.input as Record<string, unknown> | undefined
    const settingsKey =
      typeof input?.settings === 'object' && input?.settings
        ? (input.settings as Record<string, unknown>).apiKey
        : undefined

    const sanitizedSettingsKey =
      typeof settingsKey === 'string' && settingsKey.trim().length > 0
        ? settingsKey
        : undefined

    // Fall back to environment
    const envKey =
      typeof process.env.OPENROUTER_API_KEY === 'string' &&
      process.env.OPENROUTER_API_KEY.trim().length > 0
        ? process.env.OPENROUTER_API_KEY
        : undefined

    return attributeKey ?? sanitizedSettingsKey ?? envKey
  }
}

/**
 * Factory function to create an LLMOrchestrator.
 */
export const createLLMOrchestrator = (options: LLMOrchestratorOptions): LLMOrchestrator => {
  return new LLMOrchestrator(options)
}
