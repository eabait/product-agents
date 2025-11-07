import { GraphController } from '../controller/graph-controller'
import {
  getDefaultProductAgentConfig,
  loadProductAgentConfig,
  type ProductAgentConfig
} from '../config/product-agent.config'
import { createPrdPlanner, createPrdSkillRunner, createPrdVerifier } from '../adapters/prd'
import { FilesystemWorkspaceDAO } from '../workspace/filesystem-workspace-dao'
import type { AgentController } from '../contracts/controller'
import { createPersonaBuilderSubagent } from '../subagents'

interface CreatePrdControllerOptions {
  config?: ProductAgentConfig
  workspaceRoot?: string
  clock?: () => Date
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

  const planner = createPrdPlanner({ clock: options?.clock })
  const skillRunner = createPrdSkillRunner({
    fallbackModel: config.runtime.fallbackModel,
    clock: options?.clock
  })
  const verifier = createPrdVerifier({ clock: options?.clock })
  const subagents = [createPersonaBuilderSubagent({ clock: options?.clock })]

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
      clock: options?.clock
    }
  )
}

export const getDefaultPrdController = (): AgentController =>
  createPrdController({ config: getDefaultProductAgentConfig() })
