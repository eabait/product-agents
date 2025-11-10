import {
  GraphController,
  FilesystemWorkspaceDAO,
  getDefaultProductAgentConfig,
  loadProductAgentConfig,
  createPersonaBuilderSubagent,
  type AgentController,
  type ProductAgentConfig,
  type SubagentRegistry
} from '@product-agents/product-agent'
import { createPrdPlanner, createPrdSkillRunner, createPrdVerifier } from '../adapters'

interface CreatePrdControllerOptions {
  config?: ProductAgentConfig
  workspaceRoot?: string
  clock?: () => Date
  subagentRegistry?: SubagentRegistry
}

export const createPrdController = (options?: CreatePrdControllerOptions): AgentController => {
  const config =
    options?.config ??
    loadProductAgentConfig(
      options?.workspaceRoot
        ? {
            overrides: {
              workspace: {
                storageRoot: options.workspaceRoot
              }
            }
          }
        : undefined
    )

  const subagents = [createPersonaBuilderSubagent({ clock: options?.clock })]

  const planner = createPrdPlanner({
    config,
    clock: options?.clock,
    subagentRegistry: options?.subagentRegistry,
    subagents
  })
  const skillRunner = createPrdSkillRunner({
    fallbackModel: config.runtime.fallbackModel,
    clock: options?.clock
  })
  const verifier = createPrdVerifier({ clock: options?.clock })

  const workspace = new FilesystemWorkspaceDAO({
    root: options?.workspaceRoot ?? config.workspace.storageRoot,
    persistArtifacts: config.workspace.persistArtifacts,
    defaultTempSubdir: config.workspace.tempSubdir,
    clock: options?.clock
  })

  return new GraphController(
    {
      planner,
      skillRunner,
      verifier: {
        primary: verifier
      },
      workspace,
      subagents
    },
    config,
    {
      clock: options?.clock,
      subagentRegistry: options?.subagentRegistry
    }
  )
}

export const getDefaultPrdController = (): AgentController =>
  createPrdController({ config: getDefaultProductAgentConfig() })
