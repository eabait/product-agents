import type { ResearchPlan, ResearchStep } from '../contracts/research-plan'
import type { WebSearchAdapter, WebSearchResult } from './web-search-types'

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
      onProgress?: (progress: number, sourcesFound: number) => void
    }
  ): Promise<StepExecutionResult> {
    const startTime = Date.now()
    const queries = step.queries.length > 0 ? step.queries : [step.label]
    const sourcesPerQuery = Math.ceil(options.maxSources / queries.length)

    const allStepSources: WebSearchResult[] = []
    const queriesExecuted: string[] = []

    for (let i = 0; i < queries.length; i++) {
      const query = queries[i]
      queriesExecuted.push(query)

      try {
        const results = await this.webSearch.search(query, {
          maxResults: sourcesPerQuery,
          searchDepth: 'advanced'
        })

        allStepSources.push(...results)

        const progress = Math.round(((i + 1) / queries.length) * 100)
        options.onProgress?.(progress, allStepSources.length)
      } catch (error) {
        console.error(`Search failed for query "${query}":`, error)
      }
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
