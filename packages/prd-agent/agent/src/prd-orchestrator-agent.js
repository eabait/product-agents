import { BaseAgent, summarizeUsage } from '@product-agents/agent-core';
import { combineConfidenceAssessments, SECTION_NAMES, ALL_SECTION_NAMES } from '@product-agents/prd-shared';
import { buildPRDMetadata } from './utilities';
import { ClarificationAnalyzer, ContextAnalyzer, SectionDetectionAnalyzer } from '@product-agents/skills-prd';
import { 
// New simplified section writers
TargetUsersSectionWriter, SolutionSectionWriter, KeyFeaturesSectionWriter, SuccessMetricsSectionWriter, ConstraintsSectionWriter } from '@product-agents/skills-prd';
import { PRD_AGENT_METADATA, getDefaultSubAgentSettings } from './agent-metadata';
export class PRDOrchestratorAgent extends BaseAgent {
    // Agent capabilities and default configuration
    static requiredCapabilities = [
        'structured_output',
        'streaming'
    ];
    static defaultModel = 'anthropic/claude-3-7-sonnet';
    static agentName = 'PRD Orchestrator';
    static agentDescription = 'Orchestrates PRD generation with modular section writers';
    static getMetadata() {
        return {
            ...PRD_AGENT_METADATA,
            defaultSettings: { ...PRD_AGENT_METADATA.defaultSettings },
            subAgents: PRD_AGENT_METADATA.subAgents.map(subAgent => ({
                ...subAgent,
                defaultSettings: { ...subAgent.defaultSettings },
                configurableParameters: subAgent.configurableParameters.map(param => ({ ...param }))
            }))
        };
    }
    sectionWriters;
    clarificationAnalyzer;
    // Simplified analyzers for centralized analysis
    contextAnalyzer;
    sectionDetectionAnalyzer;
    constructor(settings) {
        super({
            ...settings,
            subAgentSettings: {
                ...getDefaultSubAgentSettings(),
                ...(settings?.subAgentSettings || {})
            }
        });
        const orchestratorOverrides = this.settings.subAgentSettings?.['orchestrator-core'];
        if (orchestratorOverrides) {
            super.updateSettings({
                model: orchestratorOverrides.model,
                temperature: orchestratorOverrides.temperature,
                maxTokens: orchestratorOverrides.maxTokens,
                apiKey: orchestratorOverrides.apiKey
            });
        }
        // Initialize simplified analyzers for centralized analysis
        this.contextAnalyzer = new ContextAnalyzer(this.getSubAgentRuntimeSettings('context-analyzer'));
        this.clarificationAnalyzer = new ClarificationAnalyzer(this.getSubAgentRuntimeSettings('clarification-analyzer'));
        this.sectionDetectionAnalyzer = new SectionDetectionAnalyzer(this.getSubAgentRuntimeSettings('section-detection-analyzer'));
        // Initialize simplified section writers for 5-section PRD
        this.sectionWriters = new Map();
        this.sectionWriters.set('targetUsers', new TargetUsersSectionWriter(this.getSubAgentRuntimeSettings('target-users-writer')));
        this.sectionWriters.set('solution', new SolutionSectionWriter(this.getSubAgentRuntimeSettings('solution-writer')));
        this.sectionWriters.set('keyFeatures', new KeyFeaturesSectionWriter(this.getSubAgentRuntimeSettings('key-features-writer')));
        this.sectionWriters.set('successMetrics', new SuccessMetricsSectionWriter(this.getSubAgentRuntimeSettings('success-metrics-writer')));
        this.sectionWriters.set('constraints', new ConstraintsSectionWriter(this.getSubAgentRuntimeSettings('constraints-writer')));
    }
    getSubAgentRuntimeSettings(subAgentId) {
        const overrides = this.settings.subAgentSettings?.[subAgentId];
        const fallbackAdvanced = {
            ...(this.settings.advanced || {}),
            fallbackModel: this.settings.model
        };
        return {
            model: overrides?.model || this.settings.model,
            temperature: overrides?.temperature ?? this.settings.temperature,
            maxTokens: overrides?.maxTokens ?? this.settings.maxTokens,
            apiKey: overrides?.apiKey || this.settings.apiKey,
            advanced: {
                ...fallbackAdvanced,
                ...(overrides?.advanced || {})
            }
        };
    }
    async chat(message, context) {
        // Convert to new routing format
        const routingRequest = {
            message,
            context: {
                contextPayload: context?.contextPayload,
                existingPRD: context, // Support passing existing PRD directly as context
                conversationHistory: context?.conversationHistory
            },
            settings: this.settings,
            targetSections: context?.targetSections
        };
        // Handle edit operations - detect automatically if PRD already exists
        const existingPRD = context?.existingPRD || (context?.sections ? context : null);
        if (existingPRD) {
            routingRequest.context.existingPRD = existingPRD;
            return this.handleEditOperation(routingRequest);
        }
        // Handle full PRD generation
        return this.handleFullGeneration(routingRequest);
    }
    async generateSections(request) {
        return this.generateSectionsWithProgress(request);
    }
    async generateSectionsWithProgress(request, onProgress) {
        const startTime = Date.now();
        const usageEntries = [];
        // Emit initial status
        this.emitProgress(onProgress, {
            type: 'status',
            timestamp: new Date().toISOString(),
            message: 'Starting PRD generation...'
        });
        // Check if clarification is needed first
        this.emitProgress(onProgress, {
            type: 'worker_start',
            timestamp: new Date().toISOString(),
            worker: 'ClarificationAnalyzer',
            message: 'Checking if more information is needed...'
        });
        const clarificationCheck = await this.checkClarificationNeeded(request, startTime, usageEntries);
        if (clarificationCheck) {
            this.emitProgress(onProgress, {
                type: 'worker_complete',
                timestamp: new Date().toISOString(),
                worker: 'ClarificationAnalyzer',
                message: 'Additional information required'
            });
            return clarificationCheck;
        }
        this.emitProgress(onProgress, {
            type: 'worker_complete',
            timestamp: new Date().toISOString(),
            worker: 'ClarificationAnalyzer',
            message: 'Requirements analysis complete'
        });
        // Determine which sections to generate/update
        const sectionsToProcess = this.determineSectionsToProcess(request);
        this.emitProgress(onProgress, {
            type: 'status',
            timestamp: new Date().toISOString(),
            message: `Processing sections: ${sectionsToProcess.join(', ')}`
        });
        // PHASE 1: Run simplified centralized analysis once
        this.emitProgress(onProgress, {
            type: 'worker_start',
            timestamp: new Date().toISOString(),
            worker: 'ContextAnalyzer',
            message: 'Analyzing themes and requirements...'
        });
        const sharedAnalysisResults = await this.runCentralizedAnalysis(request, usageEntries);
        this.emitProgress(onProgress, {
            type: 'worker_complete',
            timestamp: new Date().toISOString(),
            worker: 'ContextAnalyzer',
            message: 'Requirements analysis complete',
            confidence: 0.85
        });
        // PHASE 2: Process sections in parallel with progress tracking
        const { sectionResults, confidenceAssessments, allIssues, allWarnings } = await this.processSectionsInParallelWithProgress(request, sectionsToProcess, sharedAnalysisResults, usageEntries, onProgress);
        const response = this.buildSectionResponse(sectionResults, confidenceAssessments, allIssues, allWarnings, sectionsToProcess, usageEntries, startTime);
        // Emit final completion
        this.emitProgress(onProgress, {
            type: 'final',
            timestamp: new Date().toISOString(),
            message: 'PRD generation complete',
            data: response
        });
        return response;
    }
    emitProgress(onProgress, event) {
        if (onProgress) {
            try {
                onProgress(event);
            }
            catch (error) {
                console.warn('Progress callback failed:', error);
            }
        }
    }
    async handleEditOperation(request) {
        // Detect which sections are affected by the edit
        const affectedSections = await this.detectAffectedSections(request.message, request.context?.existingPRD);
        const updateRequest = {
            ...request,
            targetSections: affectedSections
        };
        const sectionResponse = await this.generateSections(updateRequest);
        // Apply section updates to existing PRD
        const updatedPRD = this.applySectionUpdates(request.context?.existingPRD, sectionResponse.sections, sectionResponse.metadata);
        return updatedPRD;
    }
    async handleFullGeneration(request) {
        const sectionResponse = await this.generateSections(request);
        // Check if clarification was needed
        if (!sectionResponse.validation.is_valid && sectionResponse.validation.issues.includes('Clarification needed')) {
            return {
                needsClarification: true,
                confidence: sectionResponse.metadata.overall_confidence,
                missingCritical: sectionResponse.validation.issues,
                questions: sectionResponse.validation.warnings,
                usage: sectionResponse.metadata.usage
            };
        }
        // Assemble final PRD
        const prd = {
            // Legacy fields for backward compatibility - map from new section structure
            problemStatement: undefined, // No longer generated as separate section
            solutionOverview: sectionResponse.sections.solution?.solutionOverview || '',
            targetUsers: sectionResponse.sections.targetUsers?.targetUsers || [],
            goals: sectionResponse.sections.keyFeatures?.keyFeatures || [],
            successMetrics: sectionResponse.sections.successMetrics?.successMetrics || [],
            constraints: sectionResponse.sections.constraints?.constraints || [],
            assumptions: sectionResponse.sections.constraints?.assumptions || [],
            // New detailed sections
            sections: sectionResponse.sections,
            // Metadata
            metadata: buildPRDMetadata({
                sectionsGenerated: sectionResponse.metadata.sections_updated,
                confidenceAssessments: sectionResponse.metadata.confidence_assessments,
                overallConfidence: sectionResponse.metadata.overall_confidence,
                processingTimeMs: sectionResponse.metadata.processing_time_ms,
                usageSummary: sectionResponse.metadata.usage
            }),
            // Validation
            validation: sectionResponse.validation
        };
        return prd;
    }
    determineSectionsToProcess(request) {
        // If specific sections are targeted, use those
        if (request.targetSections && request.targetSections.length > 0) {
            return request.targetSections;
        }
        // If no existing PRD, generate all sections
        if (!request.context?.existingPRD) {
            return ALL_SECTION_NAMES;
        }
        // For updates, analyze the message to determine affected sections
        const messageWords = request.message.toLowerCase().split(' ');
        const affectedSections = [];
        // Simple keyword-based section detection for new structure
        if (messageWords.some(word => ['users', 'persona', 'audience', 'customer', 'who'].includes(word))) {
            affectedSections.push(SECTION_NAMES.TARGET_USERS);
        }
        if (messageWords.some(word => ['solution', 'approach', 'how', 'what', 'build'].includes(word))) {
            affectedSections.push(SECTION_NAMES.SOLUTION);
        }
        if (messageWords.some(word => ['feature', 'function', 'capability', 'requirement'].includes(word))) {
            affectedSections.push(SECTION_NAMES.KEY_FEATURES);
        }
        if (messageWords.some(word => ['metric', 'kpi', 'success', 'measure', 'goal'].includes(word))) {
            affectedSections.push(SECTION_NAMES.SUCCESS_METRICS);
        }
        if (messageWords.some(word => ['constraint', 'limitation', 'assumption', 'dependency'].includes(word))) {
            affectedSections.push(SECTION_NAMES.CONSTRAINTS);
        }
        // Default to all sections if no specific matches
        return affectedSections.length > 0
            ? affectedSections
            : [];
    }
    getSectionProcessingOrder(sections) {
        // All sections are independent and can run in parallel (all use shared context analysis)
        return ALL_SECTION_NAMES.filter(section => sections.includes(section));
    }
    async detectAffectedSections(message, existingPRD) {
        try {
            // Use LLM-powered section detection for accurate results
            const detectionResult = await this.sectionDetectionAnalyzer.analyze({
                message,
                existingPRD,
                context: { existingPRD }
            });
            const detected = (detectionResult.data.affectedSections ?? []);
            const heuristic = this.determineSectionsToProcess({
                message,
                context: { existingPRD }
            });
            const combined = Array.from(new Set([...detected, ...heuristic]));
            if (combined.length === 0) {
                combined.push(...ALL_SECTION_NAMES);
            }
            console.log(`SectionDetection: ${detected.join(', ') || 'none'} (confidence: ${detectionResult.data.confidence})`);
            if (heuristic.length > 0) {
                console.log(`SectionDetection heuristics added: ${heuristic.filter(section => !detected.includes(section)).join(', ') || 'none'}`);
            }
            return combined;
        }
        catch (error) {
            console.warn('Section detection analyzer failed, using fallback logic:', error);
            // Fallback to conservative keyword-based detection
            return this.determineSectionsToProcess({
                message,
                context: { existingPRD }
            });
        }
    }
    applySectionUpdates(existingPRD, updatedSections, responseMetadata) {
        const sectionsGenerated = responseMetadata?.sections_updated?.length
            ? responseMetadata.sections_updated
            : Object.keys(updatedSections);
        const confidenceAssessments = responseMetadata?.confidence_assessments || existingPRD.metadata?.confidence_assessments || {};
        const overallConfidence = responseMetadata?.overall_confidence || existingPRD.metadata?.overall_confidence || {
            level: 'medium',
            reasons: ['Updated sections without detailed confidence data'],
            factors: {}
        };
        const mergedSections = {
            ...existingPRD.sections,
            ...updatedSections
        };
        const updatedSolutionOverview = typeof mergedSections.solution?.solutionOverview === 'string'
            ? mergedSections.solution.solutionOverview
            : existingPRD.solutionOverview;
        const updatedTargetUsers = Array.isArray(mergedSections.targetUsers?.targetUsers)
            ? mergedSections.targetUsers.targetUsers
            : existingPRD.targetUsers;
        const updatedGoals = Array.isArray(mergedSections.keyFeatures?.keyFeatures)
            ? mergedSections.keyFeatures.keyFeatures
            : existingPRD.goals;
        const updatedSuccessMetrics = Array.isArray(mergedSections.successMetrics?.successMetrics)
            ? mergedSections.successMetrics.successMetrics
            : existingPRD.successMetrics;
        const updatedConstraints = Array.isArray(mergedSections.constraints?.constraints)
            ? mergedSections.constraints.constraints
            : existingPRD.constraints;
        const updatedAssumptions = Array.isArray(mergedSections.constraints?.assumptions)
            ? mergedSections.constraints.assumptions
            : existingPRD.assumptions;
        return {
            ...existingPRD,
            solutionOverview: updatedSolutionOverview,
            targetUsers: updatedTargetUsers,
            goals: updatedGoals,
            successMetrics: updatedSuccessMetrics,
            constraints: updatedConstraints,
            assumptions: updatedAssumptions,
            sections: mergedSections,
            metadata: buildPRDMetadata({
                sectionsGenerated,
                confidenceAssessments,
                overallConfidence,
                processingTimeMs: responseMetadata?.processing_time_ms,
                usageSummary: responseMetadata?.usage,
                existingMetadata: existingPRD.metadata
            })
        };
    }
    // Helper methods extracted from generateSections for better readability
    async checkClarificationNeeded(request, startTime, usageEntries) {
        const clarificationResult = await this.clarificationAnalyzer.analyze({
            message: request.message,
            context: request.context
        });
        this.captureUsageEntry('clarification', 'clarification', clarificationResult.metadata, usageEntries);
        if (clarificationResult.data.needsClarification) {
            const usageSummary = usageEntries.length > 0 ? summarizeUsage(usageEntries) : undefined;
            return {
                sections: {},
                metadata: {
                    sections_updated: [],
                    confidence_assessments: {},
                    overall_confidence: clarificationResult.confidence || {
                        level: 'low',
                        reasons: ['Clarification required before proceeding'],
                        factors: {}
                    },
                    processing_time_ms: Date.now() - startTime,
                    should_regenerate_prd: false,
                    ...(usageSummary ? { usage: usageSummary } : {})
                },
                validation: {
                    is_valid: false,
                    issues: ['Clarification needed'],
                    warnings: clarificationResult.data.questions || []
                }
            };
        }
        return null;
    }
    async runCentralizedAnalysis(request, usageEntries) {
        console.log('Running simplified analysis phase...');
        const sharedAnalysisResults = new Map();
        const analyzerInput = {
            message: request.message,
            context: {
                contextPayload: request.context?.contextPayload,
                existingPRD: request.context?.existingPRD
            }
        };
        try {
            const contextResult = await this.contextAnalyzer.analyze(analyzerInput);
            sharedAnalysisResults.set('contextAnalysis', contextResult);
            this.captureUsageEntry('contextAnalysis', 'analyzer', contextResult.metadata, usageEntries);
            console.log('✓ Context analysis completed');
        }
        catch (error) {
            console.warn('Context analysis failed:', error);
        }
        return sharedAnalysisResults;
    }
    async processSectionsInParallelWithProgress(request, sectionsToProcess, sharedAnalysisResults, usageEntries, onProgress) {
        const sectionResults = new Map();
        const confidenceAssessments = new Map();
        const allIssues = [];
        const allWarnings = [];
        const sectionsToGenerate = this.getSectionProcessingOrder(sectionsToProcess);
        console.log(`Processing ${sectionsToGenerate.length} sections with progress tracking:`, sectionsToGenerate);
        const sectionPromises = sectionsToGenerate.map(async (sectionName) => {
            const writer = this.sectionWriters.get(sectionName);
            if (!writer) {
                return { sectionName, error: 'Writer not found' };
            }
            try {
                // Emit section start
                this.emitProgress(onProgress, {
                    type: 'section_start',
                    timestamp: new Date().toISOString(),
                    section: sectionName,
                    message: `Generating ${sectionName} section...`
                });
                const sectionInput = {
                    message: request.message,
                    context: {
                        contextPayload: request.context?.contextPayload,
                        existingPRD: request.context?.existingPRD,
                        existingSection: request.context?.existingPRD?.sections?.[sectionName],
                        targetSection: request.targetSections?.includes(sectionName) ? sectionName : undefined,
                        sharedAnalysisResults: sharedAnalysisResults
                    }
                };
                console.log(`Starting parallel processing for section: ${sectionName}`);
                const result = await writer.writeSection(sectionInput);
                console.log(`✓ Completed section: ${sectionName}`);
                this.captureUsageEntry(sectionName, 'section', result.metadata, usageEntries);
                // Emit section completion
                this.emitProgress(onProgress, {
                    type: 'section_complete',
                    timestamp: new Date().toISOString(),
                    section: sectionName,
                    message: `${sectionName} section generated successfully`,
                    data: result.content,
                    confidence: this.extractConfidenceScore(result.confidence)
                });
                return {
                    sectionName,
                    result,
                    content: result.content,
                    confidenceAssessment: result.confidence,
                    validationIssues: result.metadata?.validation_issues || []
                };
            }
            catch (error) {
                console.error(`✗ Error processing section ${sectionName}:`, error);
                // Emit section error
                this.emitProgress(onProgress, {
                    type: 'section_complete',
                    timestamp: new Date().toISOString(),
                    section: sectionName,
                    message: `Failed to generate ${sectionName} section`,
                    error: String(error)
                });
                return {
                    sectionName,
                    error: `Failed to generate ${sectionName} section: ${error}`
                };
            }
        });
        const sectionOutcomes = await Promise.all(sectionPromises);
        for (const outcome of sectionOutcomes) {
            if (outcome.error) {
                allIssues.push(outcome.error);
            }
            else {
                sectionResults.set(outcome.sectionName, outcome.content);
                if (outcome.confidenceAssessment) {
                    confidenceAssessments.set(outcome.sectionName, outcome.confidenceAssessment);
                }
                if (outcome.validationIssues && outcome.validationIssues.length > 0) {
                    allIssues.push(...outcome.validationIssues);
                }
            }
        }
        return { sectionResults, confidenceAssessments, allIssues, allWarnings };
    }
    async processSectionsInParallel(request, sectionsToProcess, sharedAnalysisResults, usageEntries) {
        return this.processSectionsInParallelWithProgress(request, sectionsToProcess, sharedAnalysisResults, usageEntries);
    }
    captureUsageEntry(name, category, metadata, usageEntries) {
        if (!metadata || typeof metadata !== 'object') {
            return;
        }
        const usageData = metadata.usage;
        if (!usageData || typeof usageData !== 'object') {
            return;
        }
        usageEntries.push({
            name,
            category,
            usage: { ...usageData }
        });
    }
    extractConfidenceScore(confidence) {
        if (!confidence)
            return undefined;
        // Convert confidence level to numeric score
        switch (confidence.level) {
            case 'high': return 0.9;
            case 'medium': return 0.7;
            case 'low': return 0.4;
            default: return 0.5;
        }
    }
    buildSectionResponse(sectionResults, confidenceAssessments, allIssues, allWarnings, sectionsToProcess, usageEntries, startTime) {
        const overallConfidence = confidenceAssessments.size > 0
            ? combineConfidenceAssessments(Object.fromEntries(confidenceAssessments))
            : {
                level: 'medium',
                reasons: ['No confidence assessments available'],
                factors: {}
            };
        const usageSummary = usageEntries.length > 0 ? summarizeUsage(usageEntries) : undefined;
        return {
            sections: Object.fromEntries(sectionResults),
            metadata: {
                sections_updated: Array.from(sectionResults.keys()),
                confidence_assessments: Object.fromEntries(confidenceAssessments),
                overall_confidence: overallConfidence,
                processing_time_ms: Date.now() - startTime,
                should_regenerate_prd: sectionsToProcess.length > 0,
                ...(usageSummary ? { usage: usageSummary } : {})
            },
            validation: {
                is_valid: allIssues.length === 0,
                issues: allIssues,
                warnings: allWarnings
            }
        };
    }
}
