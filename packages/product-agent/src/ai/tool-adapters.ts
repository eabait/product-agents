import { tool } from 'ai'
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
    parameters: defaultInputSchema,
    execute: async (_input: unknown, options: { abortSignal?: AbortSignal } = {}): Promise<ToolExecutionResult> => {
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
    parameters: defaultInputSchema,
    execute: async (_input: unknown, options: { abortSignal?: AbortSignal } = {}): Promise<ToolExecutionResult> => {
      const lifecycle = await params.resolveLifecycle()
      const sourceArtifact = params.resolveSourceArtifact(lifecycle)
      if (!sourceArtifact) {
        throw new Error(
          `Subagent "${lifecycle.metadata.id}" requires a source artifact but none was available`
        )
      }

      const result = await lifecycle.execute({
        params: (params.node.metadata?.params as Record<string, unknown>) ?? {},
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
