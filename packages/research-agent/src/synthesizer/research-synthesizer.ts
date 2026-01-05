import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'
import type { AgentSettings } from '@product-agents/agent-core'
import type { ResearchPlan } from '../contracts/research-plan'
import type {
  ResearchArtifactData,
  ResearchFinding,
  CompetitorAnalysis,
  MarketInsight,
  Recommendation,
  ResearchMethodology
} from '../contracts/research-artifact'
import type { ResearchExecutionResult, StepExecutionResult } from '../executor/research-executor'
import type { WebSearchResult } from '../executor/web-search-types'
import type { ResearchBuilderParams } from '../contracts/research-params'
import {
  createExecutiveSummaryPrompt,
  createFindingsExtractionPrompt,
  createCompetitorAnalysisPrompt,
  createMarketInsightsPrompt,
  createRecommendationsPrompt,
  createLimitationsPrompt
} from '../prompts/synthesis'

const FindingSchema = z.object({
  id: z.string(),
  category: z.enum([
    'market-size',
    'competitor',
    'trend',
    'user-insight',
    'regulatory',
    'technology',
    'opportunity',
    'threat'
  ]),
  title: z.string(),
  summary: z.string(),
  details: z.string().optional(),
  confidence: z.number().min(0).max(1),
  sourceIndices: z.array(z.number()),
  tags: z.array(z.string())
})

const FindingsResponseSchema = z.object({
  findings: z.array(FindingSchema)
})

const CompetitorSchema = z.object({
  name: z.string(),
  description: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  marketPosition: z.string().optional(),
  targetAudience: z.string().optional(),
  pricingModel: z.string().optional(),
  differentiators: z.array(z.string()).optional(),
  sourceIndices: z.array(z.number())
})

const CompetitorsResponseSchema = z.object({
  competitors: z.array(CompetitorSchema)
})

const MarketInsightsResponseSchema = z.object({
  marketSize: z.string().optional(),
  growthRate: z.string().optional(),
  keyDrivers: z.array(z.string()),
  barriers: z.array(z.string()),
  trends: z.array(z.string()),
  regions: z.union([z.array(z.string()), z.string()]).optional().transform(val => {
    if (typeof val === 'string') return val === 'Not specified' ? [] : [val]
    return val || []
  })
})

const RecommendationSchema = z.object({
  priority: z.enum(['high', 'medium', 'low']),
  recommendation: z.string(),
  rationale: z.string(),
  category: z.string().optional()
})

const RecommendationsResponseSchema = z.object({
  recommendations: z.array(RecommendationSchema)
})

const LimitationsResponseSchema = z.object({
  limitations: z.array(z.string())
})

const ExecutiveSummaryResponseSchema = z.object({
  summary: z.string()
})

export interface SynthesizerInput {
  plan: ResearchPlan
  executionResults: ResearchExecutionResult
  params: ResearchBuilderParams
}

export interface SynthesizerOptions {
  settings: AgentSettings
}

export class ResearchSynthesizer {
  private readonly client: OpenRouterClient
  private readonly settings: AgentSettings

  constructor(options: SynthesizerOptions) {
    this.settings = options.settings
    this.client = new OpenRouterClient(options.settings.apiKey)
  }

  async synthesize(input: SynthesizerInput): Promise<ResearchArtifactData & { overallConfidence: number }> {
    const { plan, executionResults, params } = input

    const allSources = executionResults.allSources
    const searchQueries = executionResults.stepResults.flatMap(r => r.queriesExecuted)

    const [findings, executiveSummary] = await Promise.all([
      this.extractAllFindings(plan, executionResults),
      this.generateExecutiveSummary(plan, executionResults)
    ])

    const hasCompetitorStep = executionResults.stepResults.some(
      r => r.stepType === 'competitor-analysis'
    )
    const hasMarketStep = executionResults.stepResults.some(
      r => r.stepType === 'market-sizing' || r.stepType === 'trend-analysis'
    )

    const [competitors, marketInsights, recommendations, limitations] = await Promise.all([
      hasCompetitorStep ? this.analyzeCompetitors(plan.topic, executionResults) : undefined,
      hasMarketStep ? this.extractMarketInsights(plan.topic, executionResults) : undefined,
      this.generateRecommendations(plan.topic, executiveSummary, findings.length, hasCompetitorStep, hasMarketStep),
      this.generateLimitations(plan.topic, allSources.length, searchQueries)
    ])

    const overallConfidence = this.calculateOverallConfidence(findings, allSources.length)

    const methodology: ResearchMethodology = {
      searchQueries,
      sourcesConsulted: executionResults.totalSourcesCollected,
      sourcesUsed: allSources.length,
      synthesisModel: this.settings.model,
      searchProvider: 'tavily',
      executionTimeMs: executionResults.totalExecutionTimeMs
    }

    return {
      topic: plan.topic,
      scope: plan.scope,
      executiveSummary,
      findings,
      competitors,
      marketInsights,
      recommendations,
      limitations,
      methodology,
      generatedAt: new Date().toISOString(),
      overallConfidence
    }
  }

  private async extractAllFindings(
    plan: ResearchPlan,
    executionResults: ResearchExecutionResult
  ): Promise<ResearchFinding[]> {
    const allFindings: ResearchFinding[] = []

    for (const stepResult of executionResults.stepResults) {
      if (stepResult.sources.length === 0) continue

      const stepFindings = await this.extractFindingsFromStep(
        plan.topic,
        stepResult
      )
      allFindings.push(...stepFindings)
    }

    return this.deduplicateFindings(allFindings)
  }

  private async extractFindingsFromStep(
    topic: string,
    stepResult: StepExecutionResult
  ): Promise<ResearchFinding[]> {
    const prompt = createFindingsExtractionPrompt(
      stepResult.stepType,
      stepResult.label,
      stepResult.sources,
      topic
    )

    try {
      const response = await this.client.generateStructured({
        model: this.settings.model,
        schema: FindingsResponseSchema,
        prompt,
        temperature: 0.2,
        maxTokens: 4000
      })

      return response.findings.map(f => ({
        ...f,
        sources: f.sourceIndices.map(idx => {
          const source = stepResult.sources[idx]
          return source
            ? {
                url: source.url,
                title: source.title,
                snippet: source.content.slice(0, 200),
                retrievedAt: source.retrievedAt
              }
            : {
                title: 'Unknown source',
                retrievedAt: new Date().toISOString()
              }
        })
      }))
    } catch (error) {
      console.error(`Failed to extract findings from step ${stepResult.stepId}:`, error)
      return []
    }
  }

  private async generateExecutiveSummary(
    plan: ResearchPlan,
    executionResults: ResearchExecutionResult
  ): Promise<string> {
    const sources = executionResults.stepResults.map(sr => ({
      stepType: sr.stepType,
      stepLabel: sr.label,
      results: sr.sources
    }))

    const prompt = createExecutiveSummaryPrompt({
      topic: plan.topic,
      scope: plan.scope,
      objectives: plan.objectives,
      sources
    })

    try {
      const response = await this.client.generateStructured({
        model: this.settings.model,
        schema: ExecutiveSummaryResponseSchema,
        prompt,
        temperature: 0.3,
        maxTokens: 2000
      })
      return response.summary
    } catch (error) {
      console.error('Failed to generate executive summary:', error)
      return `Research completed on "${plan.topic}" with ${executionResults.uniqueSourcesCount} sources analyzed. Review the findings for detailed insights.`
    }
  }

  private async analyzeCompetitors(
    topic: string,
    executionResults: ResearchExecutionResult
  ): Promise<CompetitorAnalysis[] | undefined> {
    const competitorSources = executionResults.stepResults
      .filter(r => r.stepType === 'competitor-analysis')
      .flatMap(r => r.sources)

    if (competitorSources.length === 0) return undefined

    const prompt = createCompetitorAnalysisPrompt(competitorSources, topic)

    try {
      const response = await this.client.generateStructured({
        model: this.settings.model,
        schema: CompetitorsResponseSchema,
        prompt,
        temperature: 0.2,
        maxTokens: 4000
      })

      return response.competitors.map(c => ({
        ...c,
        sources: c.sourceIndices.map(idx => competitorSources[idx]?.url ?? 'Unknown')
      }))
    } catch (error) {
      console.error('Failed to analyze competitors:', error)
      return undefined
    }
  }

  private async extractMarketInsights(
    topic: string,
    executionResults: ResearchExecutionResult
  ): Promise<MarketInsight | undefined> {
    const marketSources = executionResults.stepResults
      .filter(r => r.stepType === 'market-sizing' || r.stepType === 'trend-analysis')
      .flatMap(r => r.sources)

    if (marketSources.length === 0) return undefined

    const prompt = createMarketInsightsPrompt(marketSources, topic)

    try {
      const response = await this.client.generateStructured({
        model: this.settings.model,
        schema: MarketInsightsResponseSchema,
        prompt,
        temperature: 0.2,
        maxTokens: 3000
      })

      return response
    } catch (error) {
      console.error('Failed to extract market insights:', error)
      return undefined
    }
  }

  private async generateRecommendations(
    topic: string,
    executiveSummary: string,
    findingsCount: number,
    hasCompetitors: boolean,
    hasMarketInsights: boolean
  ): Promise<Recommendation[]> {
    const prompt = createRecommendationsPrompt(
      topic,
      executiveSummary,
      findingsCount,
      hasCompetitors,
      hasMarketInsights
    )

    try {
      const response = await this.client.generateStructured({
        model: this.settings.model,
        schema: RecommendationsResponseSchema,
        prompt,
        temperature: 0.4,
        maxTokens: 2000
      })

      return response.recommendations
    } catch (error) {
      console.error('Failed to generate recommendations:', error)
      return []
    }
  }

  private async generateLimitations(
    topic: string,
    sourcesConsulted: number,
    searchQueries: string[]
  ): Promise<string[]> {
    const prompt = createLimitationsPrompt(topic, sourcesConsulted, searchQueries)

    try {
      const response = await this.client.generateStructured({
        model: this.settings.model,
        schema: LimitationsResponseSchema,
        prompt,
        temperature: 0.3,
        maxTokens: 1000
      })

      return response.limitations
    } catch (error) {
      console.error('Failed to generate limitations:', error)
      return [
        'Research scope limited to publicly available web sources.',
        'Findings may not reflect proprietary or unpublished data.'
      ]
    }
  }

  private deduplicateFindings(findings: ResearchFinding[]): ResearchFinding[] {
    const seen = new Map<string, ResearchFinding>()

    for (const finding of findings) {
      const key = finding.title.toLowerCase().trim()
      const existing = seen.get(key)

      if (!existing || finding.confidence > existing.confidence) {
        seen.set(key, finding)
      }
    }

    return Array.from(seen.values()).sort((a, b) => b.confidence - a.confidence)
  }

  private calculateOverallConfidence(
    findings: ResearchFinding[],
    sourceCount: number
  ): number {
    if (findings.length === 0) return 0.3

    const avgFindingConfidence =
      findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length

    const sourceBonus = Math.min(sourceCount / 30, 0.2)

    const findingBonus = Math.min(findings.length / 20, 0.15)

    return Math.min(avgFindingConfidence + sourceBonus + findingBonus, 0.95)
  }
}
