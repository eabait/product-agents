import { z } from 'zod'

export const ResearchSourceSchema = z.object({
  url: z.string().optional(),
  title: z.string(),
  snippet: z.string().optional(),
  score: z.number().min(0).max(1).optional(),
  retrievedAt: z.string()
})

export const ResearchFindingSchema = z.object({
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
  sources: z.array(ResearchSourceSchema),
  tags: z.array(z.string())
})

export const CompetitorAnalysisSchema = z.object({
  name: z.string(),
  description: z.string(),
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  marketPosition: z.string().optional(),
  targetAudience: z.string().optional(),
  pricingModel: z.string().optional(),
  differentiators: z.array(z.string()).optional(),
  sources: z.array(z.string())
})

export const MarketInsightSchema = z.object({
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

export const RecommendationSchema = z.object({
  priority: z.enum(['high', 'medium', 'low']),
  recommendation: z.string(),
  rationale: z.string(),
  category: z.string().optional()
})

export const ResearchMethodologySchema = z.object({
  searchQueries: z.array(z.string()),
  sourcesConsulted: z.number(),
  sourcesUsed: z.number(),
  synthesisModel: z.string(),
  searchProvider: z.string(),
  executionTimeMs: z.number().optional()
})

export const ResearchArtifactDataSchema = z.object({
  topic: z.string(),
  scope: z.string(),
  executiveSummary: z.string(),
  findings: z.array(ResearchFindingSchema),
  competitors: z.array(CompetitorAnalysisSchema).optional(),
  marketInsights: MarketInsightSchema.optional(),
  recommendations: z.array(RecommendationSchema),
  limitations: z.array(z.string()),
  methodology: ResearchMethodologySchema,
  generatedAt: z.string()
})

export type ResearchSource = z.infer<typeof ResearchSourceSchema>
export type ResearchFinding = z.infer<typeof ResearchFindingSchema>
export type CompetitorAnalysis = z.infer<typeof CompetitorAnalysisSchema>
export type MarketInsight = z.infer<typeof MarketInsightSchema>
export type Recommendation = z.infer<typeof RecommendationSchema>
export type ResearchMethodology = z.infer<typeof ResearchMethodologySchema>
export type ResearchArtifactData = z.infer<typeof ResearchArtifactDataSchema>
