import { randomUUID } from 'node:crypto'

import type { Artifact, SubagentLifecycle, SubagentManifest } from '@product-agents/product-agent'
import type { SectionRoutingRequest, SectionRoutingResponse } from '@product-agents/prd-shared'

import {
  type PersonaArtifact,
  type PersonaBuilderOptions,
  type PersonaBuilderParams,
  type PersonaProfile,
  resolveSectionsContext,
  extractTargetUsers,
  extractKeyFeatures,
  extractConstraints,
  extractSuccessMetrics,
  extractSolutionSummary,
  buildPersonaProfiles
} from './persona-subagent'
import { PersonaAgentRunner, type PersonaAgentTelemetry } from './persona-agent-runner'

const PERSONA_AGENT_VERSION = '0.2.0'

export const personaAgentManifest: SubagentManifest = {
  id: 'persona.builder',
  package: '@product-agents/persona-agent',
  version: PERSONA_AGENT_VERSION,
  label: 'Persona Agent',
  description: 'LLM-backed persona analyst with deterministic fallback heuristics.',
  creates: 'persona',
  consumes: ['prd', 'prompt'],
  capabilities: ['analyze', 'synthesize'],
  entry: '@product-agents/persona-agent',
  exportName: 'createPersonaAgentSubagent',
  tags: ['persona', 'agent']
}

export interface PersonaAgentSubagentOptions extends PersonaBuilderOptions {
  runner?: PersonaAgentRunner
}

const buildArtifactNotes = (baseNotes: string[], runnerNotes?: string[]): string | undefined => {
  const combined = [...baseNotes]
  if (runnerNotes && runnerNotes.length > 0) {
    combined.push(...runnerNotes)
  }
  return combined.length > 0 ? combined.join(' ') : undefined
}

type PersonaRunnerResult = Awaited<ReturnType<PersonaAgentRunner['run']>>

export const createPersonaAgentSubagent = (
  options?: PersonaAgentSubagentOptions
): SubagentLifecycle<PersonaBuilderParams, SectionRoutingResponse, PersonaArtifact> => {
  const clock = options?.clock ?? (() => new Date())
  const idFactory = options?.idFactory ?? (() => randomUUID())
  const runner = options?.runner ?? new PersonaAgentRunner()

  const emitProgress = (
    request: Parameters<SubagentLifecycle['execute']>[0],
    message: string,
    payload?: Record<string, unknown>
  ): void => {
    request.emit?.({
      type: 'subagent.progress',
      runId: request.run.runId,
      timestamp: clock().toISOString(),
      message,
      payload
    } as any)
  }

  return {
    metadata: {
      id: personaAgentManifest.id,
      label: personaAgentManifest.label,
      version: personaAgentManifest.version,
      artifactKind: personaAgentManifest.creates ?? 'persona',
      sourceKinds: personaAgentManifest.consumes,
      description: personaAgentManifest.description,
      tags: personaAgentManifest.capabilities
    },
    async execute(request) {
      const params = (request.params as PersonaBuilderParams | undefined) ?? undefined
      const sectionInput = request.run.request.input as SectionRoutingRequest | undefined

      emitProgress(request, 'persona-agent.context.start')

      const resolvedParams: PersonaBuilderParams | undefined =
        params?.contextPayload || sectionInput?.context?.contextPayload
          ? {
              ...params,
              contextPayload: params?.contextPayload ?? sectionInput?.context?.contextPayload
            }
          : params

      const { sections, summary: promptSummary, derivedFromPrompt } = resolveSectionsContext(
        request.sourceArtifact as Artifact<SectionRoutingResponse> | undefined,
        resolvedParams,
        sectionInput
      )

      const sectionsUsed = new Set<string>()
      if (derivedFromPrompt) {
        sectionsUsed.add('promptContext')
      }

      const targetUsers = extractTargetUsers(sections, sectionsUsed)
      const keyFeatures = extractKeyFeatures(sections, sectionsUsed)
      const constraints = extractConstraints(sections, sectionsUsed)
      const successMetrics = extractSuccessMetrics(sections, sectionsUsed)
      let solutionSummary = extractSolutionSummary(sections, sectionsUsed)
      if (!solutionSummary && promptSummary) {
        solutionSummary = promptSummary
        sectionsUsed.add('promptSummary')
      }

      const additionalNotes: string[] = []
      if (!request.sourceArtifact) {
        additionalNotes.push('No prior PRD artifact supplied; relying on prompt context only.')
      }
      if (targetUsers.length === 0) {
        additionalNotes.push('Explicit target users missing — infer personas from broader PRD details.')
      }

      emitProgress(request, 'persona-agent.generation.start', {
        targetUsers: targetUsers.length,
        keyFeatures: keyFeatures.length,
        constraints: constraints.length,
        successMetrics: successMetrics.length,
        derivedFromPrompt
      })

      const llmDisabled = process.env.PERSONA_AGENT_FORCE_HEURISTIC === 'true'

      const buildForcedTelemetry = (): PersonaAgentTelemetry => ({
        model: request.run.settings.model,
        durationMs: 0,
        promptLength: 0,
        promptPreview: undefined,
        responsePreview: undefined,
        strategy: 'heuristic',
        timestamp: clock().toISOString(),
        errorMessage: 'forced-heuristic-mode'
      })

      const runnerResult: PersonaRunnerResult = llmDisabled
        ? {
            personas: [],
            strategy: 'heuristic',
            notes: ['LLM persona generation disabled via PERSONA_AGENT_FORCE_HEURISTIC.'],
            telemetry: buildForcedTelemetry()
          }
        : await runner.run({
            model: request.run.settings.model,
            temperature: request.run.settings.temperature ?? 0.7,
            maxOutputTokens: request.run.settings.maxOutputTokens ?? 800,
            targetUsers,
            keyFeatures,
            constraints,
            successMetrics,
            solutionSummary,
            promptSummary,
            requestMessage: sectionInput?.message,
            params: resolvedParams,
            additionalNotes
          })

      emitProgress(request, 'persona-agent.generation.complete', {
        strategy: runnerResult.strategy,
        personaCount: runnerResult.personas.length
      })

      const personas: PersonaProfile[] =
        runnerResult.personas.length > 0
          ? runnerResult.personas
          : buildPersonaProfiles(targetUsers, keyFeatures, constraints, successMetrics, solutionSummary)

      const generatedAt = clock().toISOString()
      const artifactId = `artifact-${idFactory()}`

      const sourceArtifactId =
        request.sourceArtifact?.id ?? (request.run.request.attributes?.sourceArtifactId as string | undefined)
      const derivedSourceId = sourceArtifactId ?? `input-${request.run.runId}`
      const sourceKind = request.sourceArtifact?.kind ?? request.run.request.artifactKind ?? 'prompt'

      const personaArtifact: Artifact<PersonaArtifact> = {
        id: artifactId,
        kind: 'persona',
        version: '1.0.0',
        label: 'Persona Bundle',
        data: {
          personas,
          source: {
            artifactId: derivedSourceId,
            artifactKind: sourceKind,
            runId: request.run.runId,
            sectionsUsed: Array.from(sectionsUsed)
          },
          generatedAt,
          notes: buildArtifactNotes(additionalNotes, runnerResult.notes)
        },
        metadata: {
          createdAt: generatedAt,
          createdBy: request.run.request.createdBy,
          tags: ['persona', runnerResult.strategy],
          extras: {
            sourceArtifactId: derivedSourceId,
            personaCount: personas.length,
            sectionsUsed: Array.from(sectionsUsed),
            sourceArtifactKind: sourceKind,
            sourceMode: request.sourceArtifact ? 'artifact' : 'prompt',
            generationStrategy: runnerResult.strategy,
            usage: runnerResult.usage ?? null,
            telemetry: runnerResult.telemetry ?? null
          }
        }
      }

      emitProgress(request, 'persona-agent.artifact.ready', {
        personaCount: personas.length,
        sourceKind,
        sourceArtifactId: derivedSourceId
      })

      return {
        artifact: personaArtifact,
        metadata: {
          personaCount: personas.length,
          sectionsUsed: Array.from(sectionsUsed),
          sourceArtifactId: derivedSourceId,
          strategy: runnerResult.strategy,
          telemetry: runnerResult.telemetry ?? null
        }
      }
    }
  }
}
