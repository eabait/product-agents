export type UsageCategory = 'analyzer' | 'section' | 'orchestrator' | 'clarification' | 'other';
export interface TokenUsageMetrics {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
}
export interface CostUsageMetrics {
    promptCost?: number;
    completionCost?: number;
    totalCost?: number;
    currency?: string;
}
export interface GenerationUsage extends TokenUsageMetrics, CostUsageMetrics {
    model?: string;
    provider?: string;
    rawUsage?: Record<string, any>;
}
export interface UsageEntry {
    name: string;
    category: UsageCategory;
    usage: GenerationUsage;
    metadata?: Record<string, any>;
}
export interface UsageSummary extends TokenUsageMetrics, CostUsageMetrics {
    entries: UsageEntry[];
}
export declare function summarizeUsage(entries: UsageEntry[]): UsageSummary;
//# sourceMappingURL=usage.d.ts.map