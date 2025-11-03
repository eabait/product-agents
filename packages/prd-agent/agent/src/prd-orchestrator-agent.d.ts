import { BaseAgent, AgentSettings } from '@product-agents/agent-core';
import { ModelCapability } from '@product-agents/model-compatibility';
import { PRD, ClarificationResult, SectionRoutingRequest, SectionRoutingResponse } from '@product-agents/prd-shared';
import { AgentMetadata } from './agent-metadata';
export interface ProgressEvent {
    type: 'status' | 'worker_start' | 'worker_complete' | 'section_start' | 'section_complete' | 'final';
    timestamp: string;
    message?: string;
    worker?: string;
    section?: string;
    data?: any;
    confidence?: number;
    error?: string;
}
export type ProgressCallback = (event: ProgressEvent) => void;
export declare class PRDOrchestratorAgent extends BaseAgent {
    static readonly requiredCapabilities: ModelCapability[];
    static readonly defaultModel = "anthropic/claude-3-7-sonnet";
    static readonly agentName = "PRD Orchestrator";
    static readonly agentDescription = "Orchestrates PRD generation with modular section writers";
    static getMetadata(): AgentMetadata;
    private sectionWriters;
    private clarificationAnalyzer;
    private contextAnalyzer;
    private sectionDetectionAnalyzer;
    constructor(settings?: Partial<AgentSettings>);
    private getSubAgentRuntimeSettings;
    chat(message: string, context?: any): Promise<PRD | ClarificationResult>;
    generateSections(request: SectionRoutingRequest): Promise<SectionRoutingResponse>;
    generateSectionsWithProgress(request: SectionRoutingRequest, onProgress?: ProgressCallback): Promise<SectionRoutingResponse>;
    private emitProgress;
    private handleEditOperation;
    private handleFullGeneration;
    private determineSectionsToProcess;
    private getSectionProcessingOrder;
    private detectAffectedSections;
    private applySectionUpdates;
    private checkClarificationNeeded;
    private runCentralizedAnalysis;
    private processSectionsInParallelWithProgress;
    private processSectionsInParallel;
    private captureUsageEntry;
    private extractConfidenceScore;
    private buildSectionResponse;
}
//# sourceMappingURL=prd-orchestrator-agent.d.ts.map