import type { ResearchPlan, ResearchStep } from '../contracts/research-plan'
import type { WebSearchAdapter, WebSearchResult } from './web-search-types'

// Default concurrency limit for parallel searches (conservative to avoid rate limits)
const DEFAULT_CONCURRENCY_LIMIT = 5

/**
 * Execute promises with concurrency control
 */
async function executeWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrencyLimit: number
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let currentIndex = 0

  async function runNext(): Promise<void> {
    while (currentIndex < tasks.length) {
      const index = currentIndex++
      try {
        const value = await tasks[index]()
        results[index] = { status: 'fulfilled', value }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  // Start workers up to the concurrency limit
  const workers = Array(Math.min(concurrencyLimit, tasks.length))
    .fill(null)
    .map(() => runNext())

  await Promise.all(workers)
  return results
}

export interface StepExecutionResult {
  stepId: string
  stepType: string
  label: string
  sources: WebSearchResult[]
  queriesExecuted: string[]
  executionTimeMs: number
}

export interface ResearchExecutionResult {
  planId: string
  stepResults: StepExecutionResult[]
  allSources: WebSearchResult[]
  totalSourcesCollected: number
  uniqueSourcesCount: number
  totalExecutionTimeMs: number
}

export interface ExecutionOptions {
  maxSourcesPerStep?: number
  maxTotalSources?: number
  /** Concurrency limit for parallel query execution within a step (default: 5) */
  queryConcurrencyLimit?: number
  runId?: string
  traceId?: string
  onStepStarted?: (step: ResearchStep) => void
  onStepProgress?: (step: ResearchStep, progress: number, sourcesFound: number) => void
  onStepCompleted?: (step: ResearchStep, result: StepExecutionResult) => void
}

export class ResearchExecutor {
  private readonly webSearch: WebSearchAdapter

  constructor(options: { webSearchAdapter: WebSearchAdapter }) {
    this.webSearch = options.webSearchAdapter
  }

  async execute(
    plan: ResearchPlan,
    options?: ExecutionOptions
  ): Promise<ResearchExecutionResult> {
    const startTime = Date.now()
    const stepResults: StepExecutionResult[] = []
    const allSources: WebSearchResult[] = []
    const seenUrls = new Set<string>()

    const maxTotalSources = options?.maxTotalSources ?? 50
    const stepsCount = plan.steps.length
    const defaultSourcesPerStep = Math.ceil(maxTotalSources / stepsCount)

    const executionOrder = this.topologicalSort(plan.steps)

    for (const step of executionOrder) {
      if (allSources.length >= maxTotalSources) {
        break
      }

      options?.onStepStarted?.(step)

      const remainingSources = maxTotalSources - allSources.length
      const maxForThisStep = Math.min(
        options?.maxSourcesPerStep ?? defaultSourcesPerStep,
        remainingSources
      )

      const stepResult = await this.executeStep(step, {
        maxSources: maxForThisStep,
        concurrencyLimit: options?.queryConcurrencyLimit ?? DEFAULT_CONCURRENCY_LIMIT,
        runId: options?.runId,
        traceId: options?.traceId,
        onProgress: (progress, sourcesFound) => {
          options?.onStepProgress?.(step, progress, sourcesFound)
        }
      })

      for (const source of stepResult.sources) {
        if (!seenUrls.has(source.url)) {
          seenUrls.add(source.url)
          allSources.push(source)
        }
      }

      stepResults.push(stepResult)
      options?.onStepCompleted?.(step, stepResult)
    }

    return {
      planId: plan.id,
      stepResults,
      allSources,
      totalSourcesCollected: stepResults.reduce((sum, r) => sum + r.sources.length, 0),
      uniqueSourcesCount: allSources.length,
      totalExecutionTimeMs: Date.now() - startTime
    }
  }

  private async executeStep(
    step: ResearchStep,
    options: {
      maxSources: number
      concurrencyLimit: number
      runId?: string
      traceId?: string
      onProgress?: (progress: number, sourcesFound: number) => void
    }
  ): Promise<StepExecutionResult> {
    const startTime = Date.now()
    const queries = step.queries.length > 0 ? step.queries : [step.label]
    const sourcesPerQuery = Math.ceil(options.maxSources / queries.length)
    const queriesExecuted: string[] = [...queries]

    // Create search tasks for parallel execution
    const searchTasks = queries.map((query, i) => async () => {
      const results = await this.webSearch.search(query, {
        maxResults: sourcesPerQuery,
        searchDepth: 'advanced',
        runId: options.runId,
        traceId: options.traceId,
        stepId: step.id,
        stepLabel: step.label,
        stepType: step.type,
        queryIndex: i,
        queryCount: queries.length
      })
      return { query, results, index: i }
    })

    // Execute searches in parallel with concurrency control
    const settledResults = await executeWithConcurrency(
      searchTasks,
      options.concurrencyLimit
    )

    // Collect results and track progress
    const allStepSources: WebSearchResult[] = []
    let completedCount = 0

    for (const result of settledResults) {
      completedCount++
      if (result.status === 'fulfilled') {
        allStepSources.push(...result.value.results)
      } else {
        console.error(`Search failed:`, result.reason)
      }

      const progress = Math.round((completedCount / queries.length) * 100)
      options.onProgress?.(progress, allStepSources.length)
    }

    const uniqueSources = this.deduplicateSources(allStepSources)

    return {
      stepId: step.id,
      stepType: step.type,
      label: step.label,
      sources: uniqueSources.slice(0, options.maxSources),
      queriesExecuted,
      executionTimeMs: Date.now() - startTime
    }
  }

  private topologicalSort(steps: ResearchStep[]): ResearchStep[] {
    const stepMap = new Map(steps.map(s => [s.id, s]))
    const sorted: ResearchStep[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    const visit = (stepId: string) => {
      if (visited.has(stepId)) return
      if (visiting.has(stepId)) {
        throw new Error(`Circular dependency detected in research plan at step: ${stepId}`)
      }

      const step = stepMap.get(stepId)
      if (!step) return

      visiting.add(stepId)

      for (const depId of step.dependsOn) {
        visit(depId)
      }

      visiting.delete(stepId)
      visited.add(stepId)
      sorted.push(step)
    }

    for (const step of steps) {
      visit(step.id)
    }

    return sorted
  }

  private deduplicateSources(sources: WebSearchResult[]): WebSearchResult[] {
    const seen = new Set<string>()
    const unique: WebSearchResult[] = []

    for (const source of sources) {
      const normalizedUrl = this.normalizeUrl(source.url)
      if (!seen.has(normalizedUrl)) {
        seen.add(normalizedUrl)
        unique.push(source)
      }
    }

    return unique.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  }

  private normalizeUrl(url: string): string {
    try {
      const parsed = new URL(url)
      parsed.hash = ''
      const normalized = parsed.toString()
      return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized
    } catch {
      return url.toLowerCase().trim()
    }
  }
}
