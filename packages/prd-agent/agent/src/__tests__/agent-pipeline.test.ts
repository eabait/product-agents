/**
 * Agent Pipeline Test
 * 
 * Tests individual workers and their prompt generation
 * in isolation to ensure proper prompt flow.
 */

import { 
  ContextAnalysisWorker,
  RequirementsExtractionWorker,
  ProblemStatementWorker,
  SolutionFrameworkWorker,
  PRDSynthesisWorker,
  ChangeWorker
} from '../workers'
import { MockOpenRouterClient } from './mock-openrouter-client'

// Mock the OpenRouter client at the module level
jest.mock('@product-agents/openrouter-client', () => {
  return {
    OpenRouterClient: jest.fn().mockImplementation(() => mockClient)
  }
})

// Create a global mock client instance
const mockClient = new MockOpenRouterClient()

describe('Individual Worker Prompt Generation', () => {
  const testSettings = {
    model: 'anthropic/claude-3-5-sonnet',
    temperature: 0.3,
    maxTokens: 2000,
    apiKey: 'test-key'
  }

  beforeEach(() => {
    mockClient.clearTraces()
  })

  describe('ContextAnalysisWorker', () => {
    it('should generate context analysis prompt correctly', async () => {
      const worker = new ContextAnalysisWorker(testSettings)
      
      mockClient.setMockResponse('contextAnalysis', {
        themes: ['Theme 1', 'Theme 2'],
        requirements: {
          functional: ['Func 1'],
          technical: ['Tech 1'],
          user_experience: ['UX 1']
        },
        constraints: ['Constraint 1']
      })

      const userMessage = 'Build a social media platform for photographers'
      await worker.execute({ message: userMessage })

      const traces = mockClient.getTracesForWorker('contextAnalysis')
      expect(traces).toHaveLength(1)

      const trace = traces[0]
      expect(trace.prompt).toBe(`Analyze this product request and extract key themes, requirements, and constraints: ${userMessage}`)
      expect(trace.settings.model).toBe(testSettings.model)
      expect(trace.settings.temperature).toBe(testSettings.temperature)

      console.log('\n=== CONTEXT ANALYSIS PROMPT ===')
      console.log(trace.prompt)
    })
  })

  describe('RequirementsExtractionWorker', () => {
    it('should generate requirements extraction prompt with context', async () => {
      const worker = new RequirementsExtractionWorker(testSettings)
      
      mockClient.setMockResponse('requirementsExtraction', {
        functional: ['Feature 1', 'Feature 2'],
        nonFunctional: ['Performance req', 'Security req']
      })

      const userMessage = 'Create an e-commerce platform'
      const contextAnalysis = {
        themes: ['Shopping', 'Payments'],
        requirements: { functional: ['Cart'], technical: ['API'], user_experience: ['Mobile'] }
      }

      const context = new Map()
      context.set('contextAnalysis', { data: contextAnalysis })

      await worker.execute({ message: userMessage }, context)

      const traces = mockClient.getTracesForWorker('requirementsExtraction')
      expect(traces).toHaveLength(1)

      const trace = traces[0]
      expect(trace.prompt).toContain('Extract functional and non-functional requirements from:')
      expect(trace.prompt).toContain(`Original request: ${userMessage}`)
      expect(trace.prompt).toContain(`Context analysis: ${JSON.stringify(contextAnalysis)}`)

      console.log('\n=== REQUIREMENTS EXTRACTION PROMPT ===')
      console.log(trace.prompt)
    })
  })

  describe('ProblemStatementWorker', () => {
    it('should generate problem statement prompt with full context', async () => {
      const worker = new ProblemStatementWorker(testSettings)
      
      mockClient.setMockResponse('problemStatement', 'Users struggle with managing their digital photo collections efficiently.')

      const userMessage = 'Build a photo management app'
      const contextAnalysis = { themes: ['Photography', 'Organization'] }
      const requirements = { functional: ['Upload photos'], nonFunctional: ['Fast search'] }

      const context = new Map()
      context.set('contextAnalysis', { data: contextAnalysis })
      context.set('requirementsExtraction', { data: requirements })

      await worker.execute({ message: userMessage }, context)

      const traces = mockClient.getTracesForWorker('problemStatement')
      expect(traces).toHaveLength(1)

      const trace = traces[0]
      expect(trace.prompt).toContain('Create a clear, concise problem statement for this product:')
      expect(trace.prompt).toContain(`Original request: ${userMessage}`)
      expect(trace.prompt).toContain(`Context: ${JSON.stringify(contextAnalysis)}`)
      expect(trace.prompt).toContain(`Requirements: ${JSON.stringify(requirements)}`)
      expect(trace.prompt).toContain('2-3 sentences')

      console.log('\n=== PROBLEM STATEMENT PROMPT ===')
      console.log(trace.prompt)
    })
  })

  describe('SolutionFrameworkWorker', () => {
    it('should generate solution framework prompt with problem statement', async () => {
      const worker = new SolutionFrameworkWorker(testSettings)
      
      mockClient.setMockResponse('solutionFramework', {
        approach: 'Cloud-based microservices architecture',
        components: ['API Gateway', 'Photo Service', 'Search Engine'],
        technologies: ['Node.js', 'MongoDB', 'AWS S3']
      })

      const problemStatement = 'Users need a better way to organize and find their photos quickly.'

      const context = new Map()
      context.set('problemStatement', { data: problemStatement })

      await worker.execute({ message: 'test' }, context)

      const traces = mockClient.getTracesForWorker('solutionFramework')
      expect(traces).toHaveLength(1)

      const trace = traces[0]
      expect(trace.prompt).toContain('Design a minimal, PRD-friendly solution framework for this problem:')
      expect(trace.prompt).toContain(`Problem: ${problemStatement}`)
      expect(trace.prompt).toContain('approach')
      expect(trace.prompt).toContain('components')
      expect(trace.prompt).toContain('technologies')
      expect(trace.prompt).toContain('JSON object')

      console.log('\n=== SOLUTION FRAMEWORK PROMPT ===')
      console.log(trace.prompt)
    })
  })

  describe('PRDSynthesisWorker', () => {
    it('should generate PRD synthesis prompt with all worker results', async () => {
      const worker = new PRDSynthesisWorker(testSettings)
      
      mockClient.setMockResponse('prdSynthesis', {
        problemStatement: 'Test problem',
        solutionOverview: 'Test solution',
        targetUsers: ['User 1'],
        goals: ['Goal 1'],
        successMetrics: [],
        constraints: [],
        assumptions: []
      })

      const allResults = {
        contextAnalysis: { data: { themes: ['Theme 1'] } },
        requirementsExtraction: { data: { functional: ['Func 1'] } },
        problemStatement: { data: 'Problem text' },
        solutionFramework: { data: { approach: 'Approach 1' } }
      }

      const context = new Map(Object.entries(allResults))

      await worker.execute({ message: 'test' }, context)

      const traces = mockClient.getTracesForWorker('prdSynthesis')
      expect(traces).toHaveLength(1)

      const trace = traces[0]
      expect(trace.prompt).toContain('Synthesize a complete Product Requirements Document from this analysis:')
      expect(trace.prompt).toContain(JSON.stringify(allResults))
      expect(trace.prompt).toContain('Target users')
      expect(trace.prompt).toContain('Success metrics')
      expect(trace.prompt).toContain('Constraints')
      expect(trace.prompt).toContain('Assumptions')

      console.log('\n=== PRD SYNTHESIS PROMPT ===')
      console.log(trace.prompt)
    })
  })

  describe('ChangeWorker', () => {
    it('should generate change worker prompt with existing PRD and edit request', async () => {
      const worker = new ChangeWorker(testSettings)
      
      mockClient.setMockResponse('changeWorker', {
        mode: 'patch',
        patch: {
          goals: ['Updated goal 1', 'Updated goal 2']
        }
      })

      const existingPRD = {
        problemStatement: 'Original problem',
        solutionOverview: 'Original solution',
        targetUsers: ['User 1'],
        goals: ['Original goal'],
        successMetrics: [],
        constraints: [],
        assumptions: []
      }

      const editMessage = 'Add more ambitious goals for user growth'

      await worker.execute({ message: editMessage, existingPRD })

      const traces = mockClient.getTracesForWorker('changeWorker')
      expect(traces).toHaveLength(1)

      const trace = traces[0]
      expect(trace.prompt).toContain('You are editing an existing Product Requirements Document')
      expect(trace.prompt).toContain('Return ONLY a JSON patch object')
      expect(trace.prompt).toContain(JSON.stringify(existingPRD, null, 2))
      expect(trace.prompt).toContain(`User change request:\n               "${editMessage}"`)
      expect(trace.prompt).toContain('CRITICAL RULES')
      expect(trace.prompt).toContain('Examples:')

      console.log('\n=== CHANGE WORKER PROMPT ===')
      console.log(trace.prompt)
    })
  })

  describe('Prompt Flow Validation', () => {
    it('should demonstrate data flow between workers', async () => {
      // Simulate the sequential execution with realistic data
      const userMessage = 'Build a task management tool for remote teams'
      
      // Step 1: Context Analysis
      const contextWorker = new ContextAnalysisWorker(testSettings)
      mockClient.setMockResponse('contextAnalysis', {
        themes: ['Remote work', 'Team collaboration', 'Task tracking'],
        requirements: {
          functional: ['Create tasks', 'Assign to team members', 'Track progress'],
          technical: ['Real-time updates', 'Cloud storage', 'Mobile access'],
          user_experience: ['Intuitive interface', 'Fast loading', 'Notifications']
        },
        constraints: ['Budget: $100K', 'Timeline: 6 months', 'Team size: 5 developers']
      })

      const contextResult = await contextWorker.execute({ message: userMessage })
      
      // Step 2: Requirements Extraction
      const reqWorker = new RequirementsExtractionWorker(testSettings)
      mockClient.setMockResponse('requirementsExtraction', {
        functional: [
          'Users can create and edit tasks',
          'Users can assign tasks to team members',
          'Users can track task status and progress',
          'Users can set deadlines and priorities'
        ],
        nonFunctional: [
          'System supports 50 concurrent users',
          'Task updates sync in real-time',
          'Application loads within 3 seconds',
          'Data is backed up daily'
        ]
      })

      const context1 = new Map()
      context1.set('contextAnalysis', contextResult)
      const reqResult = await reqWorker.execute({ message: userMessage }, context1)

      // Step 3: Problem Statement
      const problemWorker = new ProblemStatementWorker(testSettings)
      mockClient.setMockResponse('problemStatement', 'Remote teams struggle with task coordination and visibility, leading to missed deadlines and duplicated work. Current tools are either too complex or lack real-time collaboration features.')

      const context2 = new Map()
      context2.set('contextAnalysis', contextResult)
      context2.set('requirementsExtraction', reqResult)
      const problemResult = await problemWorker.execute({ message: userMessage }, context2)

      // Verify data flow in prompts
      const traces = mockClient.traces
      
      // Context analysis should only have user message
      const contextTrace = traces.find(t => t.workerName === 'contextAnalysis')
      expect(contextTrace?.prompt).toContain(userMessage)
      expect(contextTrace?.prompt).not.toContain('Context analysis:')

      // Requirements should have context
      const reqTrace = traces.find(t => t.workerName === 'requirementsExtraction')
      expect(reqTrace?.prompt).toContain(userMessage)
      expect(reqTrace?.prompt).toContain('Context analysis:')
      expect(reqTrace?.prompt).toContain('Remote work')

      // Problem statement should have both
      const problemTrace = traces.find(t => t.workerName === 'problemStatement')
      expect(problemTrace?.prompt).toContain(userMessage)
      expect(problemTrace?.prompt).toContain('Context:')
      expect(problemTrace?.prompt).toContain('Requirements:')

      console.log('\n=== DATA FLOW VALIDATION ===')
      console.log('✅ Context Analysis: User message only')
      console.log('✅ Requirements Extraction: User message + context analysis')
      console.log('✅ Problem Statement: User message + context + requirements')
      
      // Print cumulative data growth
      traces.forEach((trace, index) => {
        console.log(`\nStep ${index + 1} (${trace.workerName}): ${trace.prompt.length} characters`)
      })
    })
  })
})