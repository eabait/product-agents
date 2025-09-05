import { BaseAgent } from '@product-agents/agent-core'
import { ModelCapability } from '@product-agents/model-compatibility'
import { 
  PRD, 
  ClarificationResult, 
  SectionRoutingRequest, 
  SectionRoutingResponse 
} from './schemas'
import { 
  ClarificationAnalyzer,
  ContextAnalyzer,
  RiskIdentifier,
  ContentSummarizer
} from './analyzers'
import {
  ContextSectionWriter,
  ProblemStatementSectionWriter,
  AssumptionsSectionWriter,
  MetricsSectionWriter,
  type SectionWriterInput
} from './section-writers'

export class PRDOrchestratorAgent extends BaseAgent {
  // Agent capabilities and default configuration
  static readonly requiredCapabilities: ModelCapability[] = ['structured_output' as ModelCapability]
  static readonly defaultModel = 'anthropic/claude-3-5-sonnet'
  static readonly agentName = 'PRD Orchestrator'
  static readonly agentDescription = 'Orchestrates PRD generation with modular section writers'

  private sectionWriters: Map<string, any>
  private clarificationAnalyzer: ClarificationAnalyzer
  
  // Shared analyzers for centralized analysis
  private contextAnalyzer: ContextAnalyzer
  private riskIdentifier: RiskIdentifier
  private contentSummarizer: ContentSummarizer

  constructor(settings?: any) {
    super(settings)
    
    // Initialize shared analyzers for centralized analysis
    this.contextAnalyzer = new ContextAnalyzer(this.settings)
    this.riskIdentifier = new RiskIdentifier(this.settings)
    this.contentSummarizer = new ContentSummarizer(this.settings)
    this.clarificationAnalyzer = new ClarificationAnalyzer(this.settings)
    
    // Initialize section writers (requirements extracted directly from ContextAnalyzer)
    this.sectionWriters = new Map()
    this.sectionWriters.set('context', new ContextSectionWriter(this.settings))
    this.sectionWriters.set('problemStatement', new ProblemStatementSectionWriter(this.settings))
    this.sectionWriters.set('assumptions', new AssumptionsSectionWriter(this.settings))
    this.sectionWriters.set('metrics', new MetricsSectionWriter(this.settings))
  }

  async chat(message: string, context?: any): Promise<PRD | ClarificationResult> {
    // Convert to new routing format
    const routingRequest: SectionRoutingRequest = {
      message,
      context: {
        contextPayload: context?.contextPayload,
        existingPRD: context?.existingPRD,
        conversationHistory: context?.conversationHistory
      },
      settings: this.settings,
      targetSections: context?.targetSections
    }

    // Handle edit operations
    if (context?.operation === 'edit' && context?.existingPRD) {
      return this.handleEditOperation(routingRequest)
    }

    // Handle full PRD generation
    return this.handleFullGeneration(routingRequest)
  }

  async generateSections(request: SectionRoutingRequest): Promise<SectionRoutingResponse> {
    const startTime = Date.now()
    
    // Check if clarification is needed first
    const clarificationResult = await this.clarificationAnalyzer.analyze({
      message: request.message,
      context: request.context
    })

    if (clarificationResult.data.needsClarification) {
      return {
        sections: {},
        metadata: {
          sections_updated: [],
          confidence_scores: {},
          total_confidence: clarificationResult.confidence || 0,
          processing_time_ms: Date.now() - startTime,
          should_regenerate_prd: false
        },
        validation: {
          is_valid: false,
          issues: ['Clarification needed'],
          warnings: clarificationResult.data.questions || []
        }
      }
    }

    // Determine which sections to generate/update
    const sectionsToProcess = this.determineSectionsToProcess(request)
    
    // PHASE 1: Run centralized analysis once to avoid duplication
    console.log('Running centralized analysis phase...')
    const sharedAnalysisResults = new Map<string, any>()
    
    // Prepare analyzer input
    const analyzerInput = {
      message: request.message,
      context: {
        contextPayload: request.context?.contextPayload,
        existingPRD: request.context?.existingPRD
      }
    }
    
    try {
      // Run context analysis once (previously called 6 times!)
      const contextResult = await this.contextAnalyzer.analyze(analyzerInput)
      sharedAnalysisResults.set('contextAnalysis', contextResult)
      console.log('✓ Context analysis completed')
      
      // Run risk analysis once (previously called 2 times!)
      const riskResult = await this.riskIdentifier.analyze({
        ...analyzerInput,
        context: {
          ...analyzerInput.context,
          previousResults: new Map([['contextAnalysis', contextResult]])
        }
      })
      sharedAnalysisResults.set('riskAnalysis', riskResult)
      console.log('✓ Risk analysis completed')
      
      // Run content summarization once (previously called 3 times!)  
      const summaryResult = await this.contentSummarizer.analyze(analyzerInput, {
        target_length: 'medium',
        focus_area: 'balanced',
        include_priorities: true
      })
      sharedAnalysisResults.set('contentSummary', summaryResult)
      console.log('✓ Content summarization completed', summaryResult)
      
    } catch (error) {
      console.warn('Centralized analysis failed:', error)
    }
    
    // Process sections
    const sectionResults = new Map<string, any>()
    const confidenceScores = new Map<string, number>()
    const allIssues: string[] = []
    const allWarnings: string[] = []

    // Process sections in dependency order
    const processingOrder = this.getSectionProcessingOrder(sectionsToProcess)
    
    for (const sectionName of processingOrder) {

      const writer = this.sectionWriters.get(sectionName)
      if (!writer) continue

      try {
        const sectionInput: SectionWriterInput = {
          message: request.message,
          context: {
            contextPayload: request.context?.contextPayload,
            existingPRD: request.context?.existingPRD,
            existingSection: request.context?.existingPRD?.sections?.[sectionName],
            targetSection: request.targetSections?.includes(sectionName) ? sectionName : undefined,
            previousResults: this.createPreviousResultsMap(sectionResults),
            // Pass shared analysis results to avoid duplicate LLM calls
            sharedAnalysisResults: sharedAnalysisResults
          }
        }

        console.log(`Processing section: ${sectionName} with input: {sectionInput}`)
        const result = await writer.writeSection(sectionInput)
        
        sectionResults.set(sectionName, result.content)
        if (result.confidence) {
          confidenceScores.set(sectionName, result.confidence)
        }

        // Collect validation issues
        if (result.metadata?.validation_issues) {
          allIssues.push(...result.metadata.validation_issues)
        }

      } catch (error) {
        console.error(`Error processing section ${sectionName}:`, error)
        allIssues.push(`Failed to generate ${sectionName} section: ${error}`)
      }
    }

    // Calculate overall confidence
    const totalConfidence = confidenceScores.size > 0 
      ? Array.from(confidenceScores.values()).reduce((sum, score) => sum + score, 0) / confidenceScores.size
      : 0

    return {
      sections: Object.fromEntries(sectionResults),
      metadata: {
        sections_updated: Array.from(sectionResults.keys()),
        confidence_scores: Object.fromEntries(confidenceScores),
        total_confidence: totalConfidence,
        processing_time_ms: Date.now() - startTime,
        should_regenerate_prd: sectionsToProcess.length > 0
      },
      validation: {
        is_valid: allIssues.length === 0,
        issues: allIssues,
        warnings: allWarnings
      }
    }
  }

  private async handleEditOperation(request: SectionRoutingRequest): Promise<PRD> {
    // Detect which sections are affected by the edit
    const affectedSections = await this.detectAffectedSections(request.message, request.context?.existingPRD)
    
    const updateRequest = {
      ...request,
      targetSections: affectedSections
    }

    const sectionResponse = await this.generateSections(updateRequest)
    
    // Apply section updates to existing PRD
    const updatedPRD = this.applySectionUpdates(
      request.context?.existingPRD, 
      sectionResponse.sections
    )

    return updatedPRD
  }

  private async handleFullGeneration(request: SectionRoutingRequest): Promise<PRD | ClarificationResult> {
    const sectionResponse = await this.generateSections(request)
    
    // Check if clarification was needed
    if (!sectionResponse.validation.is_valid && sectionResponse.validation.issues.includes('Clarification needed')) {
      return {
        needsClarification: true,
        confidence: sectionResponse.metadata.total_confidence * 100,
        missingCritical: sectionResponse.validation.issues,
        questions: sectionResponse.validation.warnings
      } as ClarificationResult
    }

    // Assemble final PRD
    const prd: PRD = {
      // Legacy fields for backward compatibility
      problemStatement: sectionResponse.sections.problemStatement?.problemStatement,
      solutionOverview: sectionResponse.sections.context?.businessContext,
      targetUsers: sectionResponse.sections.problemStatement?.targetUsers?.map((u: any) => u.persona) || [],
      goals: sectionResponse.sections.context?.requirements?.epics?.map((epic: any) => epic.title) || [],
      successMetrics: sectionResponse.sections.metrics?.successMetrics?.map((m: any) => ({
        metric: m.metric,
        target: m.target,
        timeline: m.timeline
      })) || [],
      constraints: sectionResponse.sections.context?.constraints || [],
      assumptions: sectionResponse.sections.assumptions?.assumptions?.map((a: any) => a.assumption) || [],
      
      // New detailed sections
      sections: sectionResponse.sections,
      
      // Metadata
      metadata: {
        version: '2.0',
        lastUpdated: new Date().toISOString(),
        generatedBy: 'PRD Orchestrator Agent',
        sections_generated: sectionResponse.metadata.sections_updated,
        confidence_scores: sectionResponse.metadata.confidence_scores
      }
    }

    return prd
  }

  private determineSectionsToProcess(request: SectionRoutingRequest): string[] {
    // If specific sections are targeted, use those
    if (request.targetSections && request.targetSections.length > 0) {
      return request.targetSections
    }

    // If no existing PRD, generate all sections (requirements extracted from context)
    if (!request.context?.existingPRD) {
      return ['context', 'problemStatement', 'assumptions', 'metrics']
    }

    // For updates, analyze the message to determine affected sections
    const messageWords = request.message.toLowerCase().split(' ')
    const affectedSections: string[] = []

    // Simple keyword-based section detection
    if (messageWords.some(word => ['context', 'business', 'background'].includes(word))) {
      affectedSections.push('context')
    }
    if (messageWords.some(word => ['problem', 'issue', 'challenge'].includes(word))) {
      affectedSections.push('problemStatement')
    }
    if (messageWords.some(word => ['requirement', 'feature', 'function', 'scope', 'phase', 'mvp'].includes(word))) {
      affectedSections.push('context')
    }
    if (messageWords.some(word => ['assumption', 'dependency'].includes(word))) {
      affectedSections.push('assumptions')
    }
    if (messageWords.some(word => ['metric', 'kpi', 'success'].includes(word))) {
      affectedSections.push('metrics')
    }

    // Default to all sections if no specific matches
    return affectedSections.length > 0 
      ? affectedSections 
      : ['context', 'problemStatement', 'assumptions', 'metrics']
  }

  private getSectionProcessingOrder(sections: string[]): string[] {
    // Define dependency order for sections (requirements extracted from context)
    const order = ['context', 'problemStatement', 'assumptions', 'metrics']
    return order.filter(section => sections.includes(section))
  }

  private createPreviousResultsMap(sectionResults: Map<string, any>): Map<string, any> {
    const resultsMap = new Map<string, any>()
    
    for (const [sectionName, content] of Array.from(sectionResults.entries())) {
      resultsMap.set(sectionName, {
        name: sectionName,
        data: content,
        confidence: 0.8 // Default confidence for existing results
      })
    }
    
    return resultsMap
  }

  private async detectAffectedSections(message: string, existingPRD: any): Promise<string[]> {
    // Enhanced section detection logic could use an analyzer here
    // For now, use the same logic as determineSectionsToProcess
    return this.determineSectionsToProcess({
      message,
      context: { existingPRD }
    })
  }

  private applySectionUpdates(existingPRD: PRD, updatedSections: any): PRD {
    return {
      ...existingPRD,
      sections: {
        ...existingPRD.sections,
        ...updatedSections
      },
      metadata: {
        ...existingPRD.metadata,
        version: '2.0',
        generatedBy: 'PRD Orchestrator Agent',
        lastUpdated: new Date().toISOString(),
        sections_generated: Object.keys(updatedSections)
      }
    }
  }
}