'use client';

import { Badge } from '@/components/ui/badge';
import {
  TrendingUp,
  Users,
  AlertTriangle,
  Lightbulb,
  ExternalLink,
  CheckCircle2,
  Target
} from 'lucide-react';

interface ResearchSource {
  url?: string;
  title: string;
  snippet?: string;
  score?: number;
  retrievedAt: string;
}

interface ResearchFinding {
  id: string;
  category:
    | 'market-size'
    | 'competitor'
    | 'trend'
    | 'user-insight'
    | 'regulatory'
    | 'technology'
    | 'opportunity'
    | 'threat';
  title: string;
  summary: string;
  details?: string;
  confidence: number;
  sources: ResearchSource[];
  tags: string[];
}

interface CompetitorAnalysis {
  name: string;
  description: string;
  strengths: string[];
  weaknesses: string[];
  marketPosition?: string;
  targetAudience?: string;
  pricingModel?: string;
  differentiators?: string[];
  sources: string[];
}

interface MarketInsight {
  marketSize?: string;
  growthRate?: string;
  keyDrivers: string[];
  barriers: string[];
  trends: string[];
  regions?: string[];
}

interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  recommendation: string;
  rationale: string;
  category?: string;
}

interface ResearchMethodology {
  searchQueries: string[];
  sourcesConsulted: number;
  sourcesUsed: number;
  synthesisModel: string;
  searchProvider: string;
  executionTimeMs?: number;
}

interface ResearchArtifactData {
  topic: string;
  scope: string;
  executiveSummary: string;
  findings: ResearchFinding[];
  competitors?: CompetitorAnalysis[];
  marketInsights?: MarketInsight;
  recommendations: Recommendation[];
  limitations: string[];
  methodology: ResearchMethodology;
  generatedAt: string;
}

interface ResearchArtifactViewProps {
  data: ResearchArtifactData;
  confidence?: number;
}

export function ResearchArtifactView({ data, confidence }: ResearchArtifactViewProps) {
  const getConfidenceBadgeColor = (conf: number) => {
    if (conf >= 0.8) return 'bg-green-100 text-green-800 border-green-200';
    if (conf >= 0.6) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getPriorityBadgeColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  return (
    <div className="prose prose-sm max-w-none p-6 space-y-8">
      {/* Header */}
      <div className="border-b-2 border-gray-300 pb-4 not-prose">
        <h1 className="text-3xl font-bold mb-2 text-gray-900">{data.topic}</h1>
        <p className="text-base text-gray-600 mb-3">{data.scope}</p>
        <div className="flex flex-wrap gap-2 items-center">
          <Badge variant="outline">Research Report</Badge>
          {confidence !== undefined && (
            <Badge className={getConfidenceBadgeColor(confidence)}>
              {Math.round(confidence * 100)}% Confidence
            </Badge>
          )}
          <Badge variant="outline">
            {data.methodology.sourcesUsed} / {data.methodology.sourcesConsulted} Sources
          </Badge>
        </div>
      </div>

      {/* Executive Summary */}
      <section>
        <h2 className="text-2xl font-bold mb-3 text-gray-900">Executive Summary</h2>
        <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
          {data.executiveSummary}
        </p>
      </section>

      {/* Key Findings */}
      {data.findings && data.findings.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-4 text-gray-900 flex items-center gap-2">
            <Target className="w-6 h-6" />
            Key Findings
          </h2>
          <div className="space-y-6 not-prose">
            {data.findings.map((finding, idx) => (
              <div key={finding.id} className="pl-4 border-l-4 border-blue-500">
                <div className="mb-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="text-xs">
                      {finding.category}
                    </Badge>
                    <Badge className={getConfidenceBadgeColor(finding.confidence)}>
                      {Math.round(finding.confidence * 100)}% confidence
                    </Badge>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {idx + 1}. {finding.title}
                  </h3>
                </div>
                <p className="text-gray-700 leading-relaxed mb-2">{finding.summary}</p>
                {finding.details && (
                  <p className="text-sm text-gray-600 leading-relaxed mb-3 whitespace-pre-wrap">
                    {finding.details}
                  </p>
                )}
                {finding.sources.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-gray-600 mb-1">Sources:</p>
                    <ul className="space-y-1">
                      {finding.sources.map((source, sidx) => (
                        <li key={sidx} className="text-sm">
                          {source.url ? (
                            <a
                              href={source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline inline-flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              {source.title}
                            </a>
                          ) : (
                            <span className="text-gray-700">{source.title}</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Competitor Analysis */}
      {data.competitors && data.competitors.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-4 text-gray-900 flex items-center gap-2">
            <Users className="w-6 h-6" />
            Competitor Analysis
          </h2>
          <div className="space-y-6 not-prose">
            {data.competitors.map((competitor, idx) => (
              <div key={idx} className="pl-4 border-l-4 border-purple-500">
                <div className="mb-2">
                  <h3 className="text-xl font-semibold text-gray-900 mb-1">
                    {idx + 1}. {competitor.name}
                  </h3>
                  {competitor.marketPosition && (
                    <Badge variant="outline" className="mb-2">
                      {competitor.marketPosition}
                    </Badge>
                  )}
                </div>
                <p className="text-gray-700 leading-relaxed mb-3">{competitor.description}</p>

                {competitor.strengths.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-green-600" />
                      Strengths:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-5">
                      {competitor.strengths.map((strength, sidx) => (
                        <li key={sidx}>{strength}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {competitor.weaknesses.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      Weaknesses:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-5">
                      {competitor.weaknesses.map((weakness, widx) => (
                        <li key={widx}>{weakness}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {competitor.differentiators && competitor.differentiators.length > 0 && (
                  <div className="mb-3">
                    <p className="text-sm font-semibold text-gray-700 mb-1">
                      Key Differentiators:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-sm text-gray-700 ml-5">
                      {competitor.differentiators.map((diff, didx) => (
                        <li key={didx}>{diff}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {competitor.targetAudience && (
                  <p className="text-sm text-gray-600 mb-2">
                    <span className="font-medium">Target Audience:</span> {competitor.targetAudience}
                  </p>
                )}

                {competitor.pricingModel && (
                  <p className="text-sm text-gray-600 mb-2">
                    <span className="font-medium">Pricing Model:</span> {competitor.pricingModel}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Market Insights */}
      {data.marketInsights && (
        <section>
          <h2 className="text-2xl font-bold mb-4 text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            Market Insights
          </h2>
          <div className="space-y-4 not-prose">
            {data.marketInsights.marketSize && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Market Size</h3>
                <p className="text-gray-700">{data.marketInsights.marketSize}</p>
              </div>
            )}

            {data.marketInsights.growthRate && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">Growth Rate</h3>
                <p className="text-gray-700">{data.marketInsights.growthRate}</p>
              </div>
            )}

            {data.marketInsights.keyDrivers.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Key Drivers</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                  {data.marketInsights.keyDrivers.map((driver, idx) => (
                    <li key={idx}>{driver}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.marketInsights.barriers.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Barriers</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                  {data.marketInsights.barriers.map((barrier, idx) => (
                    <li key={idx}>{barrier}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.marketInsights.trends.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Key Trends</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                  {data.marketInsights.trends.map((trend, idx) => (
                    <li key={idx}>{trend}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {data.recommendations && data.recommendations.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-4 text-gray-900 flex items-center gap-2">
            <Lightbulb className="w-6 h-6" />
            Recommendations
          </h2>
          <div className="space-y-4 not-prose">
            {data.recommendations.map((rec, idx) => (
              <div key={idx} className="pl-4 border-l-4 border-green-500">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={getPriorityBadgeColor(rec.priority)}>
                    {rec.priority} priority
                  </Badge>
                  {rec.category && (
                    <Badge variant="outline" className="text-xs">
                      {rec.category}
                    </Badge>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {idx + 1}. {rec.recommendation}
                </h3>
                <p className="text-gray-700 leading-relaxed">{rec.rationale}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Limitations */}
      {data.limitations && data.limitations.length > 0 && (
        <section>
          <h2 className="text-2xl font-bold mb-3 text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-6 h-6" />
            Research Limitations
          </h2>
          <ul className="list-disc list-inside space-y-2 text-gray-700">
            {data.limitations.map((limitation, idx) => (
              <li key={idx}>{limitation}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Methodology */}
      <section className="not-prose">
        <h2 className="text-2xl font-bold mb-3 text-gray-900">Research Methodology</h2>
        <div className="text-sm text-gray-700 space-y-2">
          <p>
            <span className="font-medium">Sources:</span> {data.methodology.sourcesUsed} used out
            of {data.methodology.sourcesConsulted} consulted
          </p>
          <p>
            <span className="font-medium">Search Provider:</span>{' '}
            <span className="capitalize">{data.methodology.searchProvider}</span>
          </p>
          <p>
            <span className="font-medium">Synthesis Model:</span> {data.methodology.synthesisModel}
          </p>
          {data.methodology.searchQueries.length > 0 && (
            <div>
              <p className="font-medium mb-1">Search Queries:</p>
              <ul className="list-disc list-inside ml-4 space-y-1">
                {data.methodology.searchQueries.map((query, idx) => (
                  <li key={idx}>{query}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-200">
            Generated: {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
      </section>
    </div>
  );
}
