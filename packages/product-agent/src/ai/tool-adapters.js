import { tool } from 'ai';
import { z } from 'zod';
const defaultInputSchema = z.object({
    rationale: z.string().optional(),
    notes: z.string().optional()
});
export const createSkillTool = (params) => tool({
    description: `Execute plan node "${params.node.label}" using the configured skill runner.`,
    parameters: defaultInputSchema,
    execute: async (_input, options = {}) => {
        const skillId = params.node.metadata?.skillId ?? params.node.id;
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
        });
        const artifact = result.metadata?.artifact;
        const status = result.metadata?.runStatus ??
            'completed';
        return {
            status,
            nodeId: params.node.id,
            skillId,
            artifact,
            metadata: result.metadata,
            confidence: result.confidence,
            skillResult: result
        };
    }
});
export const createSubagentTool = (params) => tool({
    description: `Run subagent "${params.node.metadata?.subagentId ?? params.node.id}" for this plan step.`,
    parameters: defaultInputSchema,
    execute: async (_input, options = {}) => {
        const lifecycle = await params.resolveLifecycle();
        const sourceArtifact = params.resolveSourceArtifact(lifecycle);
        if (!sourceArtifact) {
            throw new Error(`Subagent "${lifecycle.metadata.id}" requires a source artifact but none was available`);
        }
        const result = await lifecycle.execute({
            params: params.node.metadata?.params ?? {},
            run: params.runContext,
            sourceArtifact,
            emit: params.emitProgress
                ? event => params.emitProgress?.(event)
                : undefined
        });
        return {
            status: 'completed',
            nodeId: params.node.id,
            subagentId: lifecycle.metadata.id,
            artifact: result.artifact,
            metadata: result.metadata
        };
    }
});
