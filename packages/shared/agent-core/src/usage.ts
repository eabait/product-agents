export type UsageCategory = 'analyzer' | 'section' | 'orchestrator' | 'clarification' | 'other'

export interface TokenUsageMetrics {
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
}

export interface CostUsageMetrics {
  promptCost?: number
  completionCost?: number
  totalCost?: number
  currency?: string
}

export interface GenerationUsage extends TokenUsageMetrics, CostUsageMetrics {
  model?: string
  provider?: string
  rawUsage?: Record<string, any>
}

export interface UsageEntry {
  name: string
  category: UsageCategory
  usage: GenerationUsage
  metadata?: Record<string, any>
}

export interface UsageSummary extends TokenUsageMetrics, CostUsageMetrics {
  entries: UsageEntry[]
}

export function summarizeUsage(entries: UsageEntry[]): UsageSummary {
  const summary: UsageSummary = {
    entries: []
  }

  if (!entries || entries.length === 0) {
    return { entries: [] }
  }

  summary.entries = entries

  let promptTokensSum: number | undefined
  let completionTokensSum: number | undefined
  let totalTokensSum: number | undefined
  let promptCostSum: number | undefined
  let completionCostSum: number | undefined
  let totalCostSum: number | undefined

  for (const entry of entries) {
    const usage = entry.usage || {}
    if (typeof usage.promptTokens === 'number') {
      promptTokensSum = (promptTokensSum ?? 0) + usage.promptTokens
    }
    if (typeof usage.completionTokens === 'number') {
      completionTokensSum = (completionTokensSum ?? 0) + usage.completionTokens
    }
    if (typeof usage.totalTokens === 'number') {
      totalTokensSum = (totalTokensSum ?? 0) + usage.totalTokens
    }

    if (typeof usage.promptCost === 'number') {
      promptCostSum = (promptCostSum ?? 0) + usage.promptCost
    }
    if (typeof usage.completionCost === 'number') {
      completionCostSum = (completionCostSum ?? 0) + usage.completionCost
    }
    if (typeof usage.totalCost === 'number') {
      totalCostSum = (totalCostSum ?? 0) + usage.totalCost
    }

    if (!summary.currency && usage.currency) {
      summary.currency = usage.currency
    }
  }

  if (promptTokensSum !== undefined) {
    summary.promptTokens = promptTokensSum
  }
  if (completionTokensSum !== undefined) {
    summary.completionTokens = completionTokensSum
  }
  if (totalTokensSum !== undefined) {
    summary.totalTokens = totalTokensSum
  } else if (promptTokensSum !== undefined || completionTokensSum !== undefined) {
    summary.totalTokens = (promptTokensSum ?? 0) + (completionTokensSum ?? 0)
  }

  if (promptCostSum !== undefined) {
    summary.promptCost = promptCostSum
  }
  if (completionCostSum !== undefined) {
    summary.completionCost = completionCostSum
  }
  if (totalCostSum !== undefined) {
    summary.totalCost = totalCostSum
  } else if (promptCostSum !== undefined || completionCostSum !== undefined) {
    summary.totalCost = (promptCostSum ?? 0) + (completionCostSum ?? 0)
  }

  return summary
}
