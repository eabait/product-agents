import type { ResearchStep } from '../contracts/research-plan'
import type { WebSearchResult } from '../executor/web-search-types'

export interface SynthesisPromptInput {
  topic: string
  scope: string
  objectives: string[]
  sources: Array<{
    stepType: string
    stepLabel: string
    results: WebSearchResult[]
  }>
  focusAreas?: string[]
}

export function createExecutiveSummaryPrompt(input: SynthesisPromptInput): string {
  const sourceSummaries = input.sources
    .map(
      s =>
        `\n### ${s.stepLabel} (${s.stepType})\n${s.results
          .slice(0, 5)
          .map(r => `- ${r.title}: ${r.content.slice(0, 300)}...`)
          .join('\n')}`
    )
    .join('\n')

  return `Synthesize an executive summary for the following research:

Topic: ${input.topic}
Scope: ${input.scope}

Research Objectives:
${input.objectives.map((o, i) => `${i + 1}. ${o}`).join('\n')}

Source Material:
${sourceSummaries}

Write a concise executive summary (2-3 paragraphs) that:
1. Captures the key insights from the research
2. Highlights the most significant findings
3. Provides actionable context for decision-making
4. Mentions any notable limitations or gaps

The summary should be professional, objective, and data-driven.`
}

export function createFindingsExtractionPrompt(
  stepType: string,
  stepLabel: string,
  sources: WebSearchResult[],
  topic: string
): string {
  const sourceContent = sources
    .map((s, i) => `[Source ${i + 1}] ${s.title}\nURL: ${s.url}\n${s.content}`)
    .join('\n\n---\n\n')

  return `Extract key findings from the following sources for a research report on "${topic}".

Step Type: ${stepType}
Step Label: ${stepLabel}

Sources:
${sourceContent}

For each distinct finding, provide:
- id: finding-{stepType}-{number}
- category: one of [market-size, competitor, trend, user-insight, regulatory, technology, opportunity, threat]
- title: A clear, concise title (max 10 words)
- summary: 1-2 sentence summary of the finding
- details: Additional context if significant (optional)
- confidence: 0.0-1.0 based on source quality and corroboration
- sourceIndices: Which source numbers support this finding
- tags: Relevant tags for categorization

Extract 3-7 distinct, meaningful findings. Avoid duplicates or trivial information.
Prioritize findings that are:
1. Backed by data or credible sources
2. Relevant to the research objectives
3. Actionable or strategically significant`
}

export function createCompetitorAnalysisPrompt(
  sources: WebSearchResult[],
  topic: string
): string {
  const sourceContent = sources
    .map((s, i) => `[Source ${i + 1}] ${s.title}\n${s.content}`)
    .join('\n\n---\n\n')

  return `Analyze competitors mentioned in the following sources for research on "${topic}".

Sources:
${sourceContent}

For each competitor identified, provide:
- name: Company/product name
- description: Brief description of what they offer
- strengths: Array of key strengths (2-4 items)
- weaknesses: Array of weaknesses or gaps (1-3 items)
- marketPosition: Their market position (leader, challenger, niche, etc.)
- targetAudience: Who they serve
- pricingModel: If mentioned
- differentiators: What makes them unique (1-3 items)
- sourceIndices: Which sources mention this competitor

Focus on the most relevant competitors. Include 3-6 competitors maximum.`
}

export function createMarketInsightsPrompt(
  sources: WebSearchResult[],
  topic: string
): string {
  const sourceContent = sources
    .map((s, i) => `[Source ${i + 1}] ${s.title}\n${s.content}`)
    .join('\n\n---\n\n')

  return `Extract market insights from the following sources for research on "${topic}".

Sources:
${sourceContent}

Provide market insights including:
- marketSize: Market size if mentioned (with currency and year)
- growthRate: Growth rate or CAGR if mentioned
- keyDrivers: 3-5 factors driving market growth
- barriers: 2-4 barriers to entry or challenges
- trends: 3-5 current trends shaping the market
- regions: Key regions discussed (if applicable)

Only include data points that are explicitly mentioned or strongly supported by the sources. Use "Not specified" for missing information rather than guessing.`
}

export function createRecommendationsPrompt(
  topic: string,
  executiveSummary: string,
  findingsCount: number,
  hasCompetitors: boolean,
  hasMarketInsights: boolean
): string {
  return `Based on the research conducted on "${topic}", generate strategic recommendations.

Executive Summary:
${executiveSummary}

Research Coverage:
- Findings extracted: ${findingsCount}
- Competitor analysis: ${hasCompetitors ? 'Yes' : 'No'}
- Market insights: ${hasMarketInsights ? 'Yes' : 'No'}

Generate 3-5 recommendations with:
- priority: high | medium | low
- recommendation: Clear, actionable recommendation
- rationale: Why this is recommended based on the research
- category: Optional category (strategy, product, market-entry, risk-mitigation, etc.)

Prioritize recommendations that:
1. Are directly supported by research findings
2. Address identified opportunities or threats
3. Are specific and actionable
4. Consider competitive dynamics`
}

export function createLimitationsPrompt(
  topic: string,
  sourcesConsulted: number,
  searchQueries: string[]
): string {
  return `Identify limitations of the research conducted on "${topic}".

Research Parameters:
- Sources consulted: ${sourcesConsulted}
- Search queries used: ${searchQueries.length}
- Sample queries: ${searchQueries.slice(0, 5).join(', ')}

Generate 3-5 limitations that:
1. Acknowledge gaps in the research coverage
2. Note any potential biases in the sources
3. Identify areas that may need deeper investigation
4. Are honest about the scope boundaries

Be specific but concise. Each limitation should be one sentence.`
}
