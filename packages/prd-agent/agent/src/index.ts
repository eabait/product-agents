import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import { BaseAgent, WorkerAgent, WorkerResult } from '@product-agents/agent-core'
import { ModelCapability } from '@product-agents/model-compatibility'

const PRDSchema = z.object({
  problemStatement: z.string(),
  solutionOverview: z.string(),
  targetUsers: z.array(z.string()),
  goals: z.array(z.string()),
  successMetrics: z.array(z.object({
    metric: z.string(),
    target: z.string(),
    timeline: z.string()
  })),
  constraints: z.array(z.string()),
  assumptions: z.array(z.string())
})

export type PRD = z.infer<typeof PRDSchema>

// Simplified PRD Patch schema for Cerebras/DeepSeek compatibility
// Using only required non-null types to avoid JSON schema issues
const PRDPatchSchema = z.object({
  mode: z.literal('patch'),
  patch: z.object({
    problemStatement: z.string().optional(),
    solutionOverview: z.string().optional(),
    targetUsers: z.array(z.string()).optional(),
    goals: z.array(z.string()).optional(),
    successMetrics: z.array(z.object({
      metric: z.string(),
      target: z.string(),
      timeline: z.string()
    })).optional(),
    constraints: z.array(z.string()).optional(),
    assumptions: z.array(z.string()).optional()
  }).strict()  // Only allow defined fields, no additional properties
})

export type PRDPatch = z.infer<typeof PRDPatchSchema>

class ContextAnalysisWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any): Promise<WorkerResult> {
    const analysisRaw = await this.client.generateStructured({
      model: this.settings.model,
      schema: z.object({
        themes: z.array(z.string()).optional(),
        requirements: z.object({
          functional: z.array(z.string()).optional(),
          technical: z.array(z.string()).optional(),
          user_experience: z.array(z.string()).optional()
        }).optional(),
        functional: z.array(z.string()).optional(),
        technical: z.array(z.string()).optional(),
        user_experience: z.array(z.string()).optional(),
        constraints: z.array(z.string()).optional()
      }),
      prompt: `Analyze this product request and extract key themes, requirements, and constraints: ${input.message}`,
      temperature: this.settings.temperature
    })

    // Normalize the response so downstream workers always see the same shape
    const normalized = {
      themes: (analysisRaw as any).themes || [],
      requirements: (analysisRaw as any).requirements ? (analysisRaw as any).requirements : {
        functional: (analysisRaw as any).functional || [],
        technical: (analysisRaw as any).technical || [],
        user_experience: (analysisRaw as any).user_experience || []
      },
      constraints: (analysisRaw as any).constraints || []
    }

    return {
      name: 'contextAnalysis',
      data: normalized,
      confidence: 0.85
    }
  }
}

class RequirementsExtractionWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any, context?: Map<string, any>): Promise<WorkerResult> {
    const contextAnalysis = context?.get('contextAnalysis')?.data
    
    const requirements = await this.client.generateStructured({
      model: this.settings.model,
      schema: z.object({
        functional: z.array(z.string()),
        nonFunctional: z.array(z.string())
      }),
      prompt: `Extract functional and non-functional requirements from:
               Original request: ${input.message}
               Context analysis: ${JSON.stringify(contextAnalysis)}`,
      temperature: this.settings.temperature
    })

    return {
      name: 'requirementsExtraction',
      data: requirements,
      confidence: 0.8
    }
  }
}

class ProblemStatementWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any, context?: Map<string, any>): Promise<WorkerResult> {
    const contextAnalysis = context?.get('contextAnalysis')?.data
    const requirements = context?.get('requirementsExtraction')?.data

    const statement = await this.client.generateText({
      model: this.settings.model,
      prompt: `Create a clear, concise problem statement for this product:
               Original request: ${input.message}
               Context: ${JSON.stringify(contextAnalysis)}
               Requirements: ${JSON.stringify(requirements)}
               
               The problem statement should be 2-3 sentences that clearly define what problem this product solves.`,
      temperature: this.settings.temperature
    })

    return {
      name: 'problemStatement',
      data: statement,
      confidence: 0.9
    }
  }
}

class SolutionFrameworkWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any, context?: Map<string, any>): Promise<WorkerResult> {
    const problemStatement = context?.get('problemStatement')?.data

    const frameworkRaw = await this.client.generateStructured({
      model: this.settings.model,
      schema: z.object({
        approach: z.string().optional(),
        components: z.array(z.string()).optional(),
        technologies: z.array(z.string()).optional()
      }),
      prompt: `Design a minimal, PRD-friendly solution framework for this problem:
               Problem: ${problemStatement}
               
               You are producing content for a Product Requirements Document — be concise and return only the JSON object requested (no explanation text).
               Return exactly this structure and keep values short (one line strings or short arrays):
               {
                 "approach": "One-sentence overview",
                 "components": ["UI", "API", "Database"],
                 "technologies": ["React", "Postgres"]
               }
               
               Prefer human-readable strings/arrays. If you must return objects, keep values short and suitable for insertion into a PRD.`,
      temperature: this.settings.temperature
    })

    // Normalize so downstream workers always receive the same shape
    const framework = {
      approach: (frameworkRaw as any).approach || '',
      components: (frameworkRaw as any).components || [],
      technologies: (frameworkRaw as any).technologies || []
    }

    return {
      name: 'solutionFramework',
      data: framework,
      confidence: 0.85
    }
  }
}

class PRDSynthesisWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any, context?: Map<string, any>): Promise<WorkerResult> {
    const allResults = Object.fromEntries(context || new Map())

    const prd = await this.client.generateStructured({
      model: this.settings.model,
      schema: PRDSchema,
      prompt: `Synthesize a complete Product Requirements Document from this analysis:
               ${JSON.stringify(allResults)}
               
               Create a comprehensive PRD with:
               - Clear problem statement
               - Solution overview
               - Target users (be specific about user personas)
               - Goals (business and user goals)
               - Success metrics (measurable KPIs with targets and timelines)
               - Constraints (technical, business, regulatory)
               - Assumptions (key assumptions being made)`,
      temperature: this.settings.temperature,
      maxTokens: this.settings.maxTokens
    })

    return {
      name: 'prdSynthesis',
      data: prd,
      confidence: 0.9
    }
  }
}

// New ChangeWorker for handling PRD edits as patches
class ChangeWorker extends WorkerAgent {
  private client: OpenRouterClient

  constructor(settings: any) {
    super(settings)
    this.client = new OpenRouterClient(settings?.apiKey)
  }

  async chat(message: string): Promise<any> {
    return this.execute({ message })
  }

  async execute(input: any, context?: Map<string, any>): Promise<WorkerResult> {
    const { message, existingPRD } = input
    
    if (!existingPRD) {
      throw new Error('ChangeWorker requires an existing PRD to edit')
    }

    // Generate a patch for the PRD
    const rawPatchResponse = await this.client.generateStructured({
      model: this.settings.model,
      schema: PRDPatchSchema,
      prompt: `You are editing an existing Product Requirements Document. 
               Return ONLY a JSON patch object that describes the changes to make.
               
               Existing PRD:
               ${JSON.stringify(existingPRD, null, 2)}
               
               User change request:
               "${message}"
               
               Return a JSON object with this exact structure:
               {
                 "mode": "patch",
                 "patch": {
                   // ONLY include fields that need to change
                   // Do NOT include fields that should remain unchanged
                   // Provide the complete new value for each field that changes
                 }
               }
               
               Examples:
               - To update problem statement: "problemStatement": "New problem statement text"
               - To update goals: "goals": ["Updated goal 1", "Updated goal 2", "New goal 3"]  
               - To update target users: "targetUsers": ["Updated user persona 1", "Updated user persona 2"]
               - To update success metrics: "successMetrics": [{"metric": "Updated metric", "target": "New target", "timeline": "Updated timeline"}]
               - To update constraints: "constraints": ["Updated constraint 1", "Updated constraint 2"]
               - To update assumptions: "assumptions": ["Updated assumption 1", "Updated assumption 2"]
               
               CRITICAL RULES: 
               - Return ONLY the JSON patch object
               - OMIT fields that don't need to change completely from the JSON
               - NEVER use null values, undefined, or empty strings
               - Do not use nested objects like {"replace": [...]} or {"add": [...]}
               - Provide direct values: arrays for array fields, strings for string fields
               - Do not include any explanation or the full PRD
               - Example: If only constraints change, return {"mode":"patch","patch":{"constraints":["new constraint"]}}`,
      temperature: this.settings.temperature || 0.2, // Use settings temperature (fixed for consistency)
      maxTokens: this.settings.maxTokens || 2000
    })

    // Clean the patch response by removing null values to avoid schema issues
    const cleanPatch = cleanPatchResponse(rawPatchResponse as PRDPatch)

    return {
      name: 'prdPatch',
      data: cleanPatch,
      confidence: 0.95
    }
  }
}

// Helper function to clean patch response by removing null values
function cleanPatchResponse(patch: PRDPatch): PRDPatch {
  const cleanedPatch = { ...patch }
  
  // Remove null values from the patch object
  for (const [key, value] of Object.entries(cleanedPatch.patch)) {
    if (value === null) {
      delete (cleanedPatch.patch as any)[key]
    }
  }
  
  return cleanedPatch
}

// Helper function to apply a patch to a PRD
export function applyPatch(basePRD: PRD, patch: PRDPatch['patch']): PRD {
  const result = { ...basePRD }
  
  for (const [field, operation] of Object.entries(patch)) {
    if (operation === null || operation === undefined) continue
    
    // Handle different field types
    if (typeof operation === 'string') {
      // Simple string replacement
      (result as any)[field] = operation
    } else if (Array.isArray(operation)) {
      // Direct array replacement
      (result as any)[field] = operation
    } else if (typeof operation === 'object' && operation !== null) {
      // Complex operation object
      const op = operation as any
      
      if ('replace' in op) {
        (result as any)[field] = op.replace
      } else if ('add' in op) {
        const currentValue = (result as any)[field]
        if (Array.isArray(currentValue)) {
          const itemsToAdd: any[] = Array.isArray(op.add) ? op.add : [op.add]
          ;(result as any)[field] = [...currentValue, ...itemsToAdd]
        } else {
          // If not an array, just replace with the add value
          (result as any)[field] = op.add
        }
      } else if ('remove' in op) {
        const currentValue = (result as any)[field]
        if (Array.isArray(currentValue)) {
          const itemsToRemove = Array.isArray(op.remove) ? op.remove : [op.remove]
          
          // Special handling for successMetrics (objects with properties)
          if (field === 'successMetrics') {
            (result as any)[field] = currentValue.filter((item: any) => {
              return !itemsToRemove.some((removeItem: any) => {
                if (typeof removeItem === 'string') {
                  return item.metric === removeItem
                }
                return JSON.stringify(item) === JSON.stringify(removeItem)
              })
            })
          } else {
            // For simple string arrays
            (result as any)[field] = currentValue.filter((item: any) => 
              !itemsToRemove.includes(item)
            )
          }
        }
      }
    }
  }
  
  // Validate the result
  const validated = PRDSchema.safeParse(result)
  if (!validated.success) {
    console.error('Patch application resulted in invalid PRD:', validated.error)
    throw new Error(`Invalid PRD after patch: ${validated.error.message}`)
  }
  
  return validated.data
}

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

export { PRDSchema, PRDPatchSchema }
export type { WorkerResult }
