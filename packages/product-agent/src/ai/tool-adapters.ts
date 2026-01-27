import { tool, type ToolCallOptions } from 'ai'
import { z } from 'zod'

import type { Artifact, PlanNode, RunContext } from '../contracts/core'
import type { SkillResult, SkillRunner } from '../contracts/skill-runner'
import type { SubagentLifecycle } from '../contracts/subagent'

export type ToolExecutionStatus = 'completed' | 'awaiting-input' | 'failed'

export interface ToolExecutionResult {
  status: ToolExecutionStatus
  nodeId: string
  skillId?: string
  subagentId?: string
  artifact?: Artifact
  metadata?: Record<string, unknown>
  confidence?: number
  error?: string
  skillResult?: SkillResult
}

type SkillToolParams = {
  node: PlanNode
  runContext: RunContext
  skillRunner: SkillRunner
}

type SubagentToolParams = {
  node: PlanNode
  runContext: RunContext
  resolveLifecycle: () => Promise<SubagentLifecycle>
  resolveSourceArtifact: (lifecycle: SubagentLifecycle) => Artifact | undefined
  emitProgress?: (event: Record<string, unknown>) => void
}

const defaultInputSchema = z.object({
  rationale: z.string().optional(),
  notes: z.string().optional()
})

export const createSkillTool = (params: SkillToolParams) =>
  tool({
    description: `Execute plan node "${params.node.label}" using the configured skill runner.`,
    inputSchema: defaultInputSchema,
    execute: async (_input: z.infer<typeof defaultInputSchema>, options: ToolCallOptions): Promise<ToolExecutionResult> => {
      const skillId = (params.node.metadata?.skillId as string) ?? params.node.id
      const result = await params.skillRunner.invoke({
        skillId,
        planNode: params.node,
        input: params.node.task,
        context: {
          run: params.runContext,
          step: params.node,
          abortSignal: options.abortSignal,
          metadata: params.runContext.metadata
        }
      })

      const artifact = (result.metadata as { artifact?: Artifact } | undefined)?.artifact
      const status =
        (result.metadata as { runStatus?: ToolExecutionStatus } | undefined)?.runStatus ??
        'completed'

      return {
        status,
        nodeId: params.node.id,
        skillId,
        artifact,
        metadata: result.metadata,
        confidence: result.confidence,
        skillResult: result
      }
    }
  })

export const createSubagentTool = (params: SubagentToolParams) =>
  tool({
    description: `Run subagent "${params.node.metadata?.subagentId ?? params.node.id}" for this plan step.`,
    inputSchema: defaultInputSchema,
    execute: async (_input: z.infer<typeof defaultInputSchema>, options: ToolCallOptions): Promise<ToolExecutionResult> => {
      const lifecycle = await params.resolveLifecycle()
      const sourceArtifact = params.resolveSourceArtifact(lifecycle)
      if (!sourceArtifact) {
        throw new Error(
          `Subagent "${lifecycle.metadata.id}" requires a source artifact but none was available`
        )
      }

      // Extract context payload from the run context request input
      const requestInput = params.runContext.request.input as { context?: { contextPayload?: unknown } } | undefined
      const contextPayload = requestInput?.context?.contextPayload as Record<string, unknown> | undefined

      // Merge node params and context payload, with context payload taking precedence
      // Also include the full input for subagents that require it (e.g., PRD subagent)
      const nodeParams = (params.node.metadata?.params as Record<string, unknown>) ?? {}
      const subagentParams = {
        ...nodeParams,
        ...(contextPayload ?? {}),
        input: params.runContext.request.input
      }

      const result = await lifecycle.execute({
        params: subagentParams,
        run: params.runContext,
        sourceArtifact,
        emit: params.emitProgress
          ? event => params.emitProgress?.(event as unknown as Record<string, unknown>)
          : undefined
      })

      return {
        status: 'completed',
        nodeId: params.node.id,
        subagentId: lifecycle.metadata.id,
        artifact: result.artifact,
        metadata: result.metadata
      }
    }
  })
