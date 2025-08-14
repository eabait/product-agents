import { BaseAgent, WorkerAgent, WorkerResult } from '@product-agents/agent-core'
import { ModelCapability } from '@product-agents/model-compatibility'
import { PRD, PRDPatch } from './schemas'
import { applyPatch } from './utils'
import {
  ContextAnalysisWorker,
  RequirementsExtractionWorker,
  ProblemStatementWorker,
  SolutionFrameworkWorker,
  PRDSynthesisWorker,
  ChangeWorker
} from './workers'

export class PRDGeneratorAgent extends BaseAgent {
  // Agent capabilities and default configuration
  static readonly requiredCapabilities: ModelCapability[] = ['structured_output' as ModelCapability]
  static readonly defaultModel = 'anthropic/claude-3-7-sonnet'
  static readonly agentName = 'PRD Generator'
  static readonly agentDescription = 'Generates comprehensive Product Requirements Documents from user requirements'

  private workers: WorkerAgent[]
  private changeWorker: ChangeWorker

  constructor(settings?: any) {
    super(settings)
    
    this.workers = [
      new ContextAnalysisWorker(this.settings),
      new RequirementsExtractionWorker(this.settings),
      new ProblemStatementWorker(this.settings),
      new SolutionFrameworkWorker(this.settings),
      new PRDSynthesisWorker(this.settings)
    ]
    
    // Create ChangeWorker with fixed temperature for consistent patch generation
    const changeWorkerSettings = {
      ...this.settings,
      temperature: (this.settings as any).changeWorkerTemperature || 0.2
    }
    this.changeWorker = new ChangeWorker(changeWorkerSettings)
  }

  async chat(message: string, context?: any): Promise<PRD | { prd: PRD; patch: PRDPatch }> {
    // Check if this is an edit operation
    if (context?.operation === 'edit' && context?.existingPRD) {
      // Use ChangeWorker for edits
      const patchResult = await this.changeWorker.execute({
        message,
        existingPRD: context.existingPRD
      })
      
      const patch = patchResult.data as PRDPatch
      const updatedPRD = applyPatch(context.existingPRD, patch.patch)
      
      return {
        prd: updatedPRD,
        patch: patch
      }
    }
    
    // Default: create new PRD
    const results = new Map<string, WorkerResult>()
    
    // Execute workers sequentially (Orchestrator-Workers pattern)
    for (const worker of this.workers) {
      const result = await worker.execute({ message, context }, results)
      results.set(result.name, result)
    }
    
    // Return the final PRD
    const finalResult = results.get('prdSynthesis')
    return finalResult?.data as PRD
  }
}