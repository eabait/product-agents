/**
 * Prompt Tracing Test
 * 
 * Tests the flow of prompts through the PRD agent pipeline
 * with mocked LLM responses to trace execution flow.
 */

import { PRDGeneratorAgent } from '../prd-generator-agent'
import { MockOpenRouterClient } from './mock-openrouter-client'

// Mock the OpenRouter client at the module level
jest.mock('@product-agents/openrouter-client', () => {
  return {
    OpenRouterClient: jest.fn().mockImplementation(() => mockClient)
  }
})

// Create a global mock client instance
const mockClient = new MockOpenRouterClient()

describe('PRD Agent Prompt Tracing', () => {
  let agent: PRDGeneratorAgent

  beforeEach(() => {
    // Clear traces before each test
    mockClient.clearTraces()
    
    // Set up mock responses for each worker
    mockClient.setMockResponses({
      contextAnalysis: {
        themes: ['User authentication', 'Data security', 'Performance'],
        requirements: {
          functional: ['User login', 'Password reset', 'Profile management'],
          technical: ['HTTPS encryption', 'Database optimization'],
          user_experience: ['Responsive design', 'Fast loading']
        },
        constraints: ['Budget limitations', 'Timeline constraints']
      },
      requirementsExtraction: {
        functional: [
          'Users can register with email and password',
          'Users can log in and log out',
          'Users can reset forgotten passwords',
          'Users can update their profile information'
        ],
        nonFunctional: [
          'System must handle 1000 concurrent users',
          'Page load times must be under 2 seconds',
          'System must be available 99.9% of the time',
          'Data must be encrypted in transit and at rest'
        ]
      },
      problemStatement: 'Current user authentication systems are fragmented and difficult to manage, leading to poor user experience and security vulnerabilities. Users struggle with password management across multiple platforms, resulting in decreased engagement and increased support costs.',
      solutionFramework: {
        approach: 'Build a centralized authentication service with SSO capabilities',
        components: ['Authentication API', 'User Management Dashboard', 'Security Monitoring'],
        technologies: ['Node.js', 'PostgreSQL', 'Redis', 'JWT']
      },
      prdSynthesis: {
        problemStatement: 'Current user authentication systems are fragmented and difficult to manage, leading to poor user experience and security vulnerabilities.',
        solutionOverview: 'Build a centralized authentication service with single sign-on capabilities, comprehensive user management, and enterprise-grade security features.',
        targetUsers: [
          'End users seeking seamless authentication experience',
          'System administrators managing user accounts',
          'Security teams monitoring access patterns'
        ],
        goals: [
          'Reduce authentication-related support tickets by 60%',
          'Improve user login success rate to 99.5%',
          'Implement enterprise SSO for all company applications'
        ],
        successMetrics: [
          {
            metric: 'User login success rate',
            target: '99.5%',
            timeline: '3 months post-launch'
          },
          {
            metric: 'Support ticket reduction',
            target: '60% decrease',
            timeline: '6 months post-launch'
          },
          {
            metric: 'SSO adoption rate',
            target: '90% of applications',
            timeline: '12 months post-launch'
          }
        ],
        constraints: [
          'Must comply with SOC 2 Type II requirements',
          'Budget limit of $500K for development',
          'Must integrate with existing LDAP directory'
        ],
        assumptions: [
          'Users will adopt SSO if it simplifies their workflow',
          'Current authentication pain points are accurately identified',
          'Engineering team has sufficient expertise in security protocols'
        ]
      }
    })

    // Create agent with test settings
    agent = new PRDGeneratorAgent({
      model: 'anthropic/claude-3-5-sonnet',
      temperature: 0.3,
      maxTokens: 4000,
      apiKey: 'test-key'
    })
  })

  describe('Full PRD Generation Flow', () => {
    it('should trace prompts through all workers in sequence', async () => {
      const userMessage = 'I need a user authentication system that provides single sign-on capabilities and improves security across our organization.'

      // Execute the full agent pipeline
      const result = await agent.chat(userMessage)

      // Verify we got a valid PRD result
      expect(result).toBeDefined()
      expect(typeof result).toBe('object')
      expect((result as any).problemStatement).toBeDefined()
      expect((result as any).solutionOverview).toBeDefined()

      // Verify all workers were called in the correct sequence
      const traces = mockClient.traces
      expect(traces).toHaveLength(5) // Should have 5 worker calls

      // Check the sequence of worker execution
      const workerSequence = traces.map(trace => trace.workerName)
      expect(workerSequence).toEqual([
        'contextAnalysis',
        'requirementsExtraction', 
        'problemStatement',
        'solutionFramework',
        'prdSynthesis'
      ])

      // Verify each trace contains the expected data
      traces.forEach((trace, index) => {
        expect(trace.timestamp).toBeDefined()
        expect(trace.workerName).toBeDefined()
        expect(trace.settings.model).toBe('anthropic/claude-3-5-sonnet')
        expect(trace.settings.temperature).toBe(0.3)
        
        // Only some workers include the original user message directly
        if (trace.workerName === 'contextAnalysis' || 
            trace.workerName === 'requirementsExtraction' || 
            trace.workerName === 'problemStatement') {
          expect(trace.prompt).toContain(userMessage)
        }
      })

      // Print detailed trace for inspection
      console.log('\n=== DETAILED PROMPT TRACES ===')
      traces.forEach((trace, index) => {
        console.log(`\n--- ${index + 1}. ${trace.workerName.toUpperCase()} ---`)
        console.log(`Timestamp: ${new Date(trace.timestamp).toISOString()}`)
        console.log(`Model: ${trace.settings.model}`)
        console.log(`Temperature: ${trace.settings.temperature}`)
        console.log(`Prompt:\n${trace.prompt}`)
        console.log(`Response:`, JSON.stringify(trace.response, null, 2))
      })
    })

    it('should pass context between workers correctly', async () => {
      const userMessage = 'Build a task management application for remote teams.'

      await agent.chat(userMessage)

      const traces = mockClient.traces

      // Context Analysis should only have the original message
      const contextTrace = traces.find(t => t.workerName === 'contextAnalysis')
      expect(contextTrace?.prompt).toContain(userMessage)
      expect(contextTrace?.prompt).not.toContain('Context analysis:')

      // Requirements Extraction should have context analysis results
      const reqTrace = traces.find(t => t.workerName === 'requirementsExtraction')
      expect(reqTrace?.prompt).toContain(userMessage)
      expect(reqTrace?.prompt).toContain('Context analysis:')

      // Problem Statement should have both context and requirements
      const problemTrace = traces.find(t => t.workerName === 'problemStatement')
      expect(problemTrace?.prompt).toContain(userMessage)
      expect(problemTrace?.prompt).toContain('Context:')
      expect(problemTrace?.prompt).toContain('Requirements:')

      // Solution Framework should have problem statement
      const solutionTrace = traces.find(t => t.workerName === 'solutionFramework')
      expect(solutionTrace?.prompt).toContain('Problem:')

      // PRD Synthesis should have all results
      const synthesisTrace = traces.find(t => t.workerName === 'prdSynthesis')
      expect(synthesisTrace?.prompt).toContain('Synthesize a complete Product Requirements Document')
    })
  })

  describe('PRD Edit Flow', () => {
    it('should trace change worker prompt for PRD edits', async () => {
      const existingPRD = {
        problemStatement: 'Original problem statement',
        solutionOverview: 'Original solution',
        targetUsers: ['User 1', 'User 2'],
        goals: ['Goal 1', 'Goal 2'],
        successMetrics: [],
        constraints: ['Constraint 1'],
        assumptions: ['Assumption 1']
      }

      // Set up mock response for change worker
      mockClient.setMockResponse('changeWorker', {
        mode: 'patch',
        patch: {
          goals: ['Updated Goal 1', 'Updated Goal 2', 'New Goal 3']
        }
      })

      const editMessage = 'Add a third goal about improving user retention by 25%'

      // Execute edit operation
      const result = await agent.chat(editMessage, {
        operation: 'edit',
        existingPRD: existingPRD
      })

      // Verify we got a patch result
      expect(result).toBeDefined()
      expect((result as any).prd).toBeDefined()
      expect((result as any).patch).toBeDefined()

      // Verify change worker was called
      const traces = mockClient.traces
      expect(traces).toHaveLength(1)

      const changeTrace = traces[0]
      expect(changeTrace.workerName).toBe('changeWorker')
      expect(changeTrace.prompt).toContain('You are editing an existing Product Requirements Document')
      expect(changeTrace.prompt).toContain(editMessage)
      expect(changeTrace.prompt).toContain(JSON.stringify(existingPRD, null, 2))

      console.log('\n=== CHANGE WORKER TRACE ===')
      console.log(`Prompt:\n${changeTrace.prompt}`)
      console.log(`Response:`, JSON.stringify(changeTrace.response, null, 2))
    })
  })

  describe('Worker-Specific Prompt Analysis', () => {
    it('should generate context-specific prompts for each worker', async () => {
      const userMessage = 'Create a mobile app for food delivery with real-time tracking.'

      await agent.chat(userMessage)

      const traces = mockClient.traces

      // Analyze each worker's prompt characteristics
      const contextTrace = traces.find(t => t.workerName === 'contextAnalysis')
      expect(contextTrace?.prompt).toMatch(/Analyze this product request and extract key themes/)

      const reqTrace = traces.find(t => t.workerName === 'requirementsExtraction')
      expect(reqTrace?.prompt).toMatch(/Extract functional and non-functional requirements/)

      const problemTrace = traces.find(t => t.workerName === 'problemStatement')
      expect(problemTrace?.prompt).toMatch(/Create a clear, concise problem statement/)
      expect(problemTrace?.prompt).toMatch(/2-3 sentences/)

      const solutionTrace = traces.find(t => t.workerName === 'solutionFramework')
      expect(solutionTrace?.prompt).toMatch(/Design a minimal, PRD-friendly solution framework/)
      expect(solutionTrace?.prompt).toContain('approach')
      expect(solutionTrace?.prompt).toContain('components')
      expect(solutionTrace?.prompt).toContain('technologies')

      const synthesisTrace = traces.find(t => t.workerName === 'prdSynthesis')
      expect(synthesisTrace?.prompt).toMatch(/Synthesize a complete Product Requirements Document/)
      expect(synthesisTrace?.prompt).toContain('Target users')
      expect(synthesisTrace?.prompt).toContain('Success metrics')
      expect(synthesisTrace?.prompt).toContain('Constraints')
      expect(synthesisTrace?.prompt).toContain('Assumptions')

      // Print prompt analysis
      console.log('\n=== PROMPT ANALYSIS ===')
      traces.forEach(trace => {
        console.log(`\n${trace.workerName.toUpperCase()} Prompt Characteristics:`)
        console.log(`- Length: ${trace.prompt.length} characters`)
        console.log(`- Contains user message: ${trace.prompt.includes(userMessage)}`)
        console.log(`- Schema type: ${trace.schema || 'text'}`)
      })
    })
  })

  afterEach(() => {
    // Print summary after each test
    mockClient.printTraceSummary()
  })
})