import { GraphController } from '../controller/graph-controller.ts'
import {
  getDefaultProductAgentConfig,
  loadProductAgentConfig,
  type ProductAgentConfig
} from '../config/product-agent.config.ts'
import { createPrdPlanner, createPrdSkillRunner, createPrdVerifier } from '../adapters/prd/index.ts'
import { FilesystemWorkspaceDAO } from '../workspace/filesystem-workspace-dao.ts'
import type { AgentController } from '../contracts/controller.ts'

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
      workspace
    },
    config,
    {
      clock: options?.clock
    }
  )
}

export const getDefaultPrdController = (): AgentController =>
  createPrdController({ config: getDefaultProductAgentConfig() })
