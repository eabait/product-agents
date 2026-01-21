import type { ResearchFocusArea, ResearchDepth } from '../contracts/research-params'

export interface PlanningPromptInput {
  query: string
  industry?: string
  region?: string
  timeframe?: string
  focusAreas?: ResearchFocusArea[]
  depth: ResearchDepth
  existingContext?: string
}

export function createAnalyzeRequestPrompt(input: PlanningPromptInput): string {
  const focusAreasText = input.focusAreas?.length
    ? `Focus areas requested: ${input.focusAreas.join(', ')}`
    : 'No specific focus areas requested - determine the most relevant ones.'

  const contextText = input.existingContext
    ? `\nExisting context provided:\n${input.existingContext}`
    : ''

  const constraintsText = [
    input.industry && `Industry: ${input.industry}`,
    input.region && `Region: ${input.region}`,
    input.timeframe && `Timeframe: ${input.timeframe}`
  ]
    .filter(Boolean)
    .join('\n')

  return `You are a research planning assistant. Analyze the following research request and determine:
1. The core topic and scope
2. Whether clarification is needed before proceeding
3. Suggested objectives for the research
4. Recommended research steps

Research Request: "${input.query}"

${constraintsText ? `Constraints:\n${constraintsText}\n` : ''}
${focusAreasText}
Research Depth: ${input.depth} (quick = 2 steps, standard = 3-4 steps, deep = 4-5 steps)
${contextText}

Analyze this request and provide:
- topic: A clear, concise topic title (max 10 words)
- scope: A one-sentence description of what this research will cover
- needsClarification: true if the request is too vague or ambiguous to proceed
- clarificationQuestions: If clarification is needed, provide 1-3 specific questions (each with id, question, context, required boolean, and optional options array)
- suggestedObjectives: 3-5 clear objectives for the research
- suggestedStepTypes: Array of step types from [web-search, competitor-analysis, market-sizing, trend-analysis, user-research-synthesis, regulatory-scan, opportunity-analysis]
- estimatedComplexity: simple | moderate | complex

IMPORTANT: Only set needsClarification to true if the request is genuinely unclear. Most requests with a clear subject should proceed without clarification.`
}

export function createGeneratePlanPrompt(
  input: PlanningPromptInput,
  analysis: {
    topic: string
    scope: string
    suggestedObjectives: string[]
    suggestedStepTypes: string[]
  }
): string {
  // Optimized depth config: fewer steps and queries for better performance
  // while maintaining research quality through better query targeting
  const depthConfig = {
    quick: { minSteps: 2, maxSteps: 2, queriesPerStep: 2 },
    standard: { minSteps: 3, maxSteps: 4, queriesPerStep: 2 },
    deep: { minSteps: 4, maxSteps: 5, queriesPerStep: 3 }
  }

  const config = depthConfig[input.depth]

  return `Generate a detailed research plan for the following:

Topic: ${analysis.topic}
Scope: ${analysis.scope}
Original Query: "${input.query}"

Objectives:
${analysis.suggestedObjectives.map((obj, i) => `${i + 1}. ${obj}`).join('\n')}

Suggested Step Types: ${analysis.suggestedStepTypes.join(', ')}

Constraints:
- Research depth: ${input.depth}
- Steps required: ${config.minSteps}-${config.maxSteps}
- Queries per step: ${config.queriesPerStep}
${input.region ? `- Region focus: ${input.region}` : ''}
${input.industry ? `- Industry: ${input.industry}` : ''}
${input.timeframe ? `- Timeframe: ${input.timeframe}` : ''}

Generate a plan with the following structure for each step:
- id: step-1, step-2, etc.
- type: one of the suggested step types
- label: A clear label for the step (e.g., "Market Landscape Analysis")
- description: What this step will accomplish
- queries: ${config.queriesPerStep} specific search queries that will yield relevant results
- estimatedSources: Expected number of sources (5-15)
- dependsOn: Array of step IDs this depends on (first step has empty array)

IMPORTANT for queries:
- Make queries specific and likely to return relevant results
- Include year (2024) for current data
- Include region/industry terms when relevant
- Avoid overly broad or generic queries`
}

export function createGenerateQueriesPrompt(
  topic: string,
  stepType: string,
  stepLabel: string,
  constraints: { region?: string; industry?: string; timeframe?: string },
  count: number
): string {
  return `Generate ${count} specific web search queries for the following research step:

Topic: ${topic}
Step Type: ${stepType}
Step Label: ${stepLabel}
${constraints.region ? `Region: ${constraints.region}` : ''}
${constraints.industry ? `Industry: ${constraints.industry}` : ''}
${constraints.timeframe ? `Timeframe: ${constraints.timeframe}` : ''}

Generate queries that:
1. Are specific enough to return relevant results
2. Include relevant year (2024) for current information
3. Use industry-standard terminology
4. Cover different aspects of the step's purpose
5. Are likely to surface authoritative sources

Return an array of ${count} search query strings.`
}
