import { BaseAgent } from '@product-agents/agent-core'
import { ModelCapability } from '@product-agents/model-compatibility'
import { 
  PRD, 
  ClarificationResult, 
  SectionRoutingRequest, 
  SectionRoutingResponse,
  ConfidenceAssessment 
} from './schemas'
import { combineConfidenceAssessments } from './utils/confidence-assessment'
import { 
  SECTION_NAMES,
  ALL_SECTION_NAMES
} from './constants'
import { buildPRDMetadata } from './utilities'
import { 
  ClarificationAnalyzer,
  ContextAnalyzer,
  SectionDetectionAnalyzer
} from './analyzers'
import {
  // New simplified section writers
  TargetUsersSectionWriter,
  SolutionSectionWriter,
  KeyFeaturesSectionWriter,
  SuccessMetricsSectionWriter,
  ConstraintsSectionWriter,
  type SectionWriterInput
} from './section-writers'

// Progress event types for streaming
export interface ProgressEvent {
  type: 'status' | 'worker_start' | 'worker_complete' | 'section_start' | 'section_complete' | 'final'
  timestamp: string
  message?: string
  worker?: string
  section?: string
  data?: any
  confidence?: number
  error?: string
}

export type ProgressCallback = (event: ProgressEvent) => void

export class PRDOrchestratorAgent extends BaseAgent {
  // Agent capabilities and default configuration
  static readonly requiredCapabilities: ModelCapability[] = ['structured_output' as ModelCapability]
  static readonly defaultModel = 'anthropic/claude-3-7-sonnet'
  static readonly agentName = 'PRD Orchestrator'
  static readonly agentDescription = 'Orchestrates PRD generation with modular section writers'

  private sectionWriters: Map<string, any>
  private clarificationAnalyzer: ClarificationAnalyzer
  
  // Simplified analyzers for centralized analysis
  private contextAnalyzer: ContextAnalyzer
  private sectionDetectionAnalyzer: SectionDetectionAnalyzer

  constructor(settings?: any) {
    super(settings)
    
    // Initialize simplified analyzers for centralized analysis
    this.contextAnalyzer = new ContextAnalyzer(this.settings)
    this.clarificationAnalyzer = new ClarificationAnalyzer(this.settings)
    this.sectionDetectionAnalyzer = new SectionDetectionAnalyzer(this.settings)
    
    // Initialize simplified section writers for 5-section PRD
    this.sectionWriters = new Map()
    this.sectionWriters.set('targetUsers', new TargetUsersSectionWriter(this.settings))
    this.sectionWriters.set('solution', new SolutionSectionWriter(this.settings))
    this.sectionWriters.set('keyFeatures', new KeyFeaturesSectionWriter(this.settings))
    this.sectionWriters.set('successMetrics', new SuccessMetricsSectionWriter(this.settings))
    this.sectionWriters.set('constraints', new ConstraintsSectionWriter(this.settings))
  }

  async chat(message: string, context?: any): Promise<PRD | ClarificationResult> {
    // Convert to new routing format
    const routingRequest: SectionRoutingRequest = {
      message,
      context: {
        contextPayload: context?.contextPayload,
        existingPRD: context,  // Support passing existing PRD directly as context
        conversationHistory: context?.conversationHistory
      },
      settings: this.settings,
      targetSections: context?.targetSections
    }

    // Handle edit operations - detect automatically if PRD already exists
    const existingPRD = context?.existingPRD || (context?.sections ? context : null)
    if (existingPRD) {
      routingRequest.context!.existingPRD = existingPRD
      return this.handleEditOperation(routingRequest)
    }

    // Handle full PRD generation
    return this.handleFullGeneration(routingRequest)
  }

  async generateSections(request: SectionRoutingRequest): Promise<SectionRoutingResponse> {
    return this.generateSectionsWithProgress(request)
  }

  async generateSectionsWithProgress(request: SectionRoutingRequest, onProgress?: ProgressCallback): Promise<SectionRoutingResponse> {
    const startTime = Date.now()
    
    // Emit initial status
    this.emitProgress(onProgress, {
      type: 'status',
      timestamp: new Date().toISOString(),
      message: 'Starting PRD generation...'
    })
    
    // Check if clarification is needed first
    this.emitProgress(onProgress, {
      type: 'worker_start',
      timestamp: new Date().toISOString(),
      worker: 'ClarificationAnalyzer',
      message: 'Checking if more information is needed...'
    })

    const clarificationCheck = await this.checkClarificationNeeded(request, startTime)
    if (clarificationCheck) {
      this.emitProgress(onProgress, {
        type: 'worker_complete',
        timestamp: new Date().toISOString(),
        worker: 'ClarificationAnalyzer',
        message: 'Additional information required'
      })
      return clarificationCheck
    }

    this.emitProgress(onProgress, {
      type: 'worker_complete',
      timestamp: new Date().toISOString(),
      worker: 'ClarificationAnalyzer',
      message: 'Requirements analysis complete'
    })

    // Determine which sections to generate/update
    const sectionsToProcess = this.determineSectionsToProcess(request)
    
    this.emitProgress(onProgress, {
      type: 'status',
      timestamp: new Date().toISOString(),
      message: `Processing sections: ${sectionsToProcess.join(', ')}`
    })
    
    // PHASE 1: Run simplified centralized analysis once
    this.emitProgress(onProgress, {
      type: 'worker_start',
      timestamp: new Date().toISOString(),
      worker: 'ContextAnalyzer',
      message: 'Analyzing themes and requirements...'
    })

    const sharedAnalysisResults = await this.runCentralizedAnalysis(request)
    
    this.emitProgress(onProgress, {
      type: 'worker_complete',
      timestamp: new Date().toISOString(),
      worker: 'ContextAnalyzer',
      message: 'Requirements analysis complete',
      confidence: 0.85
    })
    
    // PHASE 2: Process sections in parallel with progress tracking
    const { sectionResults, confidenceAssessments, allIssues, allWarnings } = 
      await this.processSectionsInParallelWithProgress(request, sectionsToProcess, sharedAnalysisResults, onProgress)

    const response = this.buildSectionResponse(
      sectionResults, confidenceAssessments, allIssues, allWarnings, sectionsToProcess, startTime
    )

    // Emit final completion
    this.emitProgress(onProgress, {
      type: 'final',
      timestamp: new Date().toISOString(),
      message: 'PRD generation complete',
      data: response
    })

    return response
  }

  private emitProgress(onProgress: ProgressCallback | undefined, event: ProgressEvent): void {
    if (onProgress) {
      try {
        onProgress(event)
      } catch (error) {
        console.warn('Progress callback failed:', error)
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
        confidence: sectionResponse.metadata.overall_confidence,
        missingCritical: sectionResponse.validation.issues,
        questions: sectionResponse.validation.warnings
      } as ClarificationResult
    }

    // Assemble final PRD
    const prd: PRD = {
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
        processingTimeMs: sectionResponse.metadata.processing_time_ms
      }),

      // Validation
      validation: sectionResponse.validation
    }

    return prd
  }

  private determineSectionsToProcess(request: SectionRoutingRequest): string[] {
    // If specific sections are targeted, use those
    if (request.targetSections && request.targetSections.length > 0) {
      return request.targetSections
    }

    // If no existing PRD, generate all sections
    if (!request.context?.existingPRD) {
      return ALL_SECTION_NAMES
    }

    // For updates, analyze the message to determine affected sections
    const messageWords = request.message.toLowerCase().split(' ')
    const affectedSections: string[] = []

    // Simple keyword-based section detection for new structure
    if (messageWords.some(word => ['user', 'persona', 'audience', 'customer', 'who'].includes(word))) {
      affectedSections.push(SECTION_NAMES.TARGET_USERS)
    }
    if (messageWords.some(word => ['solution', 'approach', 'how', 'what', 'build'].includes(word))) {
      affectedSections.push(SECTION_NAMES.SOLUTION)
    }
    if (messageWords.some(word => ['feature', 'function', 'capability', 'requirement'].includes(word))) {
      affectedSections.push(SECTION_NAMES.KEY_FEATURES)
    }
    if (messageWords.some(word => ['metric', 'kpi', 'success', 'measure', 'goal'].includes(word))) {
      affectedSections.push(SECTION_NAMES.SUCCESS_METRICS)
    }
    if (messageWords.some(word => ['constraint', 'limitation', 'assumption', 'dependency'].includes(word))) {
      affectedSections.push(SECTION_NAMES.CONSTRAINTS)
    }

    // Default to all sections if no specific matches
    return affectedSections.length > 0 
      ? affectedSections 
      : ALL_SECTION_NAMES
  }

  private getSectionProcessingOrder(sections: string[]): string[] {
    // All sections are independent and can run in parallel (all use shared context analysis)
    return ALL_SECTION_NAMES.filter(section => sections.includes(section))
  }

  private async detectAffectedSections(message: string, existingPRD: any): Promise<string[]> {
    try {
      // Use LLM-powered section detection for accurate results
      const detectionResult = await this.sectionDetectionAnalyzer.analyze({
        message,
        existingPRD,
        context: { existingPRD }
      })
      
      console.log(`SectionDetection: ${detectionResult.data.affectedSections.join(', ')} (confidence: ${detectionResult.data.confidence})`)
      
      return detectionResult.data.affectedSections
    } catch (error) {
      console.warn('Section detection analyzer failed, using fallback logic:', error)
      // Fallback to conservative keyword-based detection
      return this.determineSectionsToProcess({
        message,
        context: { existingPRD }
      })
    }
  }

  private applySectionUpdates(existingPRD: PRD, updatedSections: any): PRD {
    return {
      ...existingPRD,
      sections: {
        ...existingPRD.sections,
        ...updatedSections
      },
      metadata: buildPRDMetadata({
        sectionsGenerated: Object.keys(updatedSections),
        confidenceAssessments: {},
        overallConfidence: { level: 'medium', reasons: [], factors: {} },
        existingMetadata: existingPRD.metadata
      })
    }
  }

  // Helper methods extracted from generateSections for better readability
  private async checkClarificationNeeded(request: SectionRoutingRequest, startTime: number): Promise<SectionRoutingResponse | null> {
    const clarificationResult = await this.clarificationAnalyzer.analyze({
      message: request.message,
      context: request.context
    })

    if (clarificationResult.data.needsClarification) {
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
          should_regenerate_prd: false
        },
        validation: {
          is_valid: false,
          issues: ['Clarification needed'],
          warnings: clarificationResult.data.questions || []
        }
      }
    }
    return null
  }

  private async runCentralizedAnalysis(request: SectionRoutingRequest): Promise<Map<string, any>> {
    console.log('Running simplified analysis phase...')
    const sharedAnalysisResults = new Map<string, any>()
    
    const analyzerInput = {
      message: request.message,
      context: {
        contextPayload: request.context?.contextPayload,
        existingPRD: request.context?.existingPRD
      }
    }
    
    try {
      const contextResult = await this.contextAnalyzer.analyze(analyzerInput)
      sharedAnalysisResults.set('contextAnalysis', contextResult)
      console.log('✓ Context analysis completed')
    } catch (error) {
      console.warn('Context analysis failed:', error)
    }
    
    return sharedAnalysisResults
  }

  private async processSectionsInParallelWithProgress(
    request: SectionRoutingRequest, 
    sectionsToProcess: string[], 
    sharedAnalysisResults: Map<string, any>,
    onProgress?: ProgressCallback
  ): Promise<{
    sectionResults: Map<string, any>
    confidenceAssessments: Map<string, ConfidenceAssessment>
    allIssues: string[]
    allWarnings: string[]
  }> {
    const sectionResults = new Map<string, any>()
    const confidenceAssessments = new Map<string, ConfidenceAssessment>()
    const allIssues: string[] = []
    const allWarnings: string[] = []

    const sectionsToGenerate = this.getSectionProcessingOrder(sectionsToProcess)
    console.log(`Processing ${sectionsToGenerate.length} sections with progress tracking:`, sectionsToGenerate)
    
    const sectionPromises = sectionsToGenerate.map(async (sectionName) => {
      const writer = this.sectionWriters.get(sectionName)
      if (!writer) {
        return { sectionName, error: 'Writer not found' }
      }

      try {
        // Emit section start
        this.emitProgress(onProgress, {
          type: 'section_start',
          timestamp: new Date().toISOString(),
          section: sectionName,
          message: `Generating ${sectionName} section...`
        })

        const sectionInput: SectionWriterInput = {
          message: request.message,
          context: {
            contextPayload: request.context?.contextPayload,
            existingPRD: request.context?.existingPRD,
            existingSection: request.context?.existingPRD?.sections?.[sectionName],
            targetSection: request.targetSections?.includes(sectionName) ? sectionName : undefined,
            sharedAnalysisResults: sharedAnalysisResults
          }
        }

        console.log(`Starting parallel processing for section: ${sectionName}`)
        const result = await writer.writeSection(sectionInput)
        console.log(`✓ Completed section: ${sectionName}`)
        
        // Emit section completion
        this.emitProgress(onProgress, {
          type: 'section_complete',
          timestamp: new Date().toISOString(),
          section: sectionName,
          message: `${sectionName} section generated successfully`,
          data: result.content,
          confidence: this.extractConfidenceScore(result.confidence)
        })
        
        return {
          sectionName,
          result,
          content: result.content,
          confidenceAssessment: result.confidence,
          validationIssues: result.metadata?.validation_issues || []
        }
      } catch (error) {
        console.error(`✗ Error processing section ${sectionName}:`, error)
        
        // Emit section error
        this.emitProgress(onProgress, {
          type: 'section_complete',
          timestamp: new Date().toISOString(),
          section: sectionName,
          message: `Failed to generate ${sectionName} section`,
          error: String(error)
        })
        
        return {
          sectionName,
          error: `Failed to generate ${sectionName} section: ${error}`
        }
      }
    })

    const sectionOutcomes = await Promise.all(sectionPromises)
    
    for (const outcome of sectionOutcomes) {
      if (outcome.error) {
        allIssues.push(outcome.error)
      } else {
        sectionResults.set(outcome.sectionName, outcome.content)
        if (outcome.confidenceAssessment) {
          confidenceAssessments.set(outcome.sectionName, outcome.confidenceAssessment)
        }
        if (outcome.validationIssues && outcome.validationIssues.length > 0) {
          allIssues.push(...outcome.validationIssues)
        }
      }
    }

    return { sectionResults, confidenceAssessments, allIssues, allWarnings }
  }

  private async processSectionsInParallel(
    request: SectionRoutingRequest, 
    sectionsToProcess: string[], 
    sharedAnalysisResults: Map<string, any>
  ): Promise<{
    sectionResults: Map<string, any>
    confidenceAssessments: Map<string, ConfidenceAssessment>
    allIssues: string[]
    allWarnings: string[]
  }> {
    return this.processSectionsInParallelWithProgress(request, sectionsToProcess, sharedAnalysisResults)
  }

  private extractConfidenceScore(confidence: ConfidenceAssessment | undefined): number | undefined {
    if (!confidence) return undefined
    
    // Convert confidence level to numeric score
    switch (confidence.level) {
      case 'high': return 0.9
      case 'medium': return 0.7
      case 'low': return 0.4
      default: return 0.5
    }
  }

  private buildSectionResponse(
    sectionResults: Map<string, any>,
    confidenceAssessments: Map<string, ConfidenceAssessment>,
    allIssues: string[],
    allWarnings: string[],
    sectionsToProcess: string[],
    startTime: number
  ): SectionRoutingResponse {
    const overallConfidence = confidenceAssessments.size > 0 
      ? combineConfidenceAssessments(Object.fromEntries(confidenceAssessments))
      : {
          level: 'medium' as const,
          reasons: ['No confidence assessments available'],
          factors: {}
        }

    return {
      sections: Object.fromEntries(sectionResults),
      metadata: {
        sections_updated: Array.from(sectionResults.keys()),
        confidence_assessments: Object.fromEntries(confidenceAssessments),
        overall_confidence: overallConfidence,
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
}