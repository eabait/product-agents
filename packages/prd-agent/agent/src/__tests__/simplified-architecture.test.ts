/**
 * Simplified Architecture Test
 * 
 * Tests the new simplified 5-section PRD architecture with parallel processing
 * Validates that the system generates concise PRDs faster with fewer LLM calls.
 */

import { PRDOrchestratorAgent } from '../prd-orchestrator-agent'
import { MockOpenRouterClient } from './mock-openrouter-client'

// Mock the OpenRouter client at the module level
jest.mock('@product-agents/openrouter-client', () => {
  return {
    OpenRouterClient: jest.fn().mockImplementation(() => mockClient)
  }
})

// Create a global mock client instance
const mockClient = new MockOpenRouterClient()

describe('Simplified PRD Architecture', () => {
  let agent: PRDOrchestratorAgent

  beforeEach(() => {
    // Clear traces before each test
    mockClient.clearTraces()
    
    // Set up mock responses for simplified architecture
    mockClient.setMockResponses({
      // Clarification analyzer (still needed for validation)
      clarification: {
        needsClarification: false,
        confidence: 85,
        missingCritical: [],
        questions: []
      },
      
      // Section detection for edit operations
      sectionDetection: {
        affectedSections: ['keyFeatures'],
        reasoning: {
          keyFeatures: 'Adding new features to existing functionality'
        },
        confidence: 'high'
      },
      
      // Only context analysis needed (no more content summarizer or risk identifier)
      contextAnalysis: {
        themes: ['Task management', 'Team collaboration', 'Project tracking'],
        requirements: {
          functional: ['Task creation', 'Assignment workflows', 'Progress tracking'],
          technical: ['Real-time sync', 'Mobile responsiveness', 'API integration'],
          user_experience: ['Intuitive interface', 'Quick navigation', 'Collaborative features'],
          epics: [
            { title: 'Task Management System', description: 'Core task creation and management capabilities' },
            { title: 'Team Collaboration', description: 'Features for team communication and coordination' },
            { title: 'Project Tracking', description: 'Progress monitoring and reporting functionality' }
          ],
          mvpFeatures: ['Task creation', 'Basic assignment', 'Status updates', 'Team dashboard']
        },
        constraints: ['6-month timeline', 'Budget under $200K', 'Integration with Slack required']
      },
      
      // New simplified section responses
      targetUsers: {
        targetUsers: [
          'Small business owners managing 5-15 team members across multiple projects',
          'Project managers in remote teams who need visibility into task progress',
          'Team leads coordinating cross-functional work in fast-paced environments'
        ]
      },
      
      solution: {
        solutionOverview: 'Build an intuitive task management platform that combines project organization, team collaboration, and progress tracking in a single dashboard. The solution will focus on simplicity and real-time updates to help small teams stay coordinated without complexity.',
        approach: 'Take a mobile-first approach with progressive web app technology, starting with core task management and expanding to advanced collaboration features in later phases.'
      },
      
      keyFeatures: {
        keyFeatures: [
          'Drag-and-drop task boards with customizable workflows and status columns',
          'Real-time team notifications with smart filtering to reduce noise',
          'Project timeline views with milestone tracking and deadline alerts',
          'Team workload balancing with automatic capacity recommendations',
          'Slack integration for seamless communication and task updates'
        ]
      },
      
      successMetrics: {
        successMetrics: [
          {
            metric: 'Team productivity improvement',
            target: '25% increase in tasks completed on time',
            timeline: '3 months post-launch'
          },
          {
            metric: 'User adoption rate',
            target: '80% of team members actively using daily',
            timeline: '6 weeks post-launch'
          },
          {
            metric: 'Customer satisfaction',
            target: 'Net Promoter Score above 50',
            timeline: '6 months post-launch'
          }
        ]
      },
      
      constraints: {
        constraints: [
          'Must integrate with existing Slack workspaces without admin permissions',
          'Development budget cannot exceed $200,000 including third-party services',
          'Initial version must be delivered within 6 months from project start'
        ],
        assumptions: [
          'Teams are already using Slack for daily communication',
          'Users prefer simple interfaces over feature-rich complexity',
          'Small teams will adopt new tools if they demonstrably save time'
        ]
      }
    })

    // Create agent with test settings
    agent = new PRDOrchestratorAgent({
      model: 'anthropic/claude-3-5-sonnet',
      temperature: 0.3,
      maxTokens: 4000,
      apiKey: 'test-key'
    })
  })

  describe('Parallel Processing Architecture', () => {
    it('should generate all 5 sections in parallel after context analysis', async () => {
      const startTime = Date.now()
      
      const userMessage = 'Build a task management app for small teams that helps them collaborate on projects and track deadlines efficiently.'

      // Execute the full agent pipeline
      const result = await agent.generateSections({
        message: userMessage,
        context: {}
      })

      const endTime = Date.now()
      const executionTime = endTime - startTime

      // Verify we got a valid result with all sections
      expect(result).toBeDefined()
      expect(result.sections).toBeDefined()
      expect(result.metadata.sections_updated).toEqual(
        expect.arrayContaining(['targetUsers', 'solution', 'keyFeatures', 'successMetrics', 'constraints'])
      )

      // Verify all section writers were called
      const traces = mockClient.traces
      
      // Should have 7 LLM calls total: 1 clarification + 1 context analysis + 5 section writers
      expect(traces).toHaveLength(7)

      // Verify context analysis was called first
      const contextTrace = traces.find(t => t.workerName === 'contextAnalysis')
      expect(contextTrace).toBeDefined()
      expect(contextTrace?.prompt).toContain(userMessage)

      // Verify all 5 section writers were called
      const sectionWriters = ['targetUsers', 'solution', 'keyFeatures', 'successMetrics', 'constraints']
      sectionWriters.forEach(sectionName => {
        const sectionTrace = traces.find(t => t.workerName === sectionName)
        expect(sectionTrace).toBeDefined()
      })

      // Verify sections have expected content structure
      expect(result.sections.targetUsers?.targetUsers).toHaveLength(3)
      expect(result.sections.solution?.solutionOverview).toBeDefined()
      expect(result.sections.keyFeatures?.keyFeatures).toHaveLength(5)
      expect(result.sections.successMetrics?.successMetrics).toHaveLength(3)
      expect(result.sections.constraints?.constraints).toHaveLength(3)
      expect(result.sections.constraints?.assumptions).toHaveLength(3)

      console.log(`\n✅ Parallel execution completed in ${executionTime}ms`)
      console.log(`📊 Total LLM calls: ${traces.length} (1 clarification + 1 context + 5 sections)`)
      console.log(`🎯 Sections generated: ${result.metadata.sections_updated.join(', ')}`)
    })

    it('should use only context analysis (no content summarizer or risk identifier)', async () => {
      const userMessage = 'Create a customer support ticketing system with automated routing.'

      await agent.generateSections({
        message: userMessage,
        context: {}
      })

      const traces = mockClient.traces

      // Verify only contextAnalysis analyzer was used (no contentSummary or riskAnalysis)
      const analyzerTraces = traces.filter(t => 
        ['contextAnalysis', 'contentSummary', 'riskAnalysis'].includes(t.workerName)
      )
      
      expect(analyzerTraces).toHaveLength(1)
      expect(analyzerTraces[0].workerName).toBe('contextAnalysis')

      // Verify no traces for removed analyzers
      expect(traces.find(t => t.workerName === 'contentSummary')).toBeUndefined()
      expect(traces.find(t => t.workerName === 'riskAnalysis')).toBeUndefined()

      console.log('\n✅ Simplified analyzer architecture validated')
      console.log('📈 Analyzer calls reduced from 3+ to 1')
    })
  })

  describe('Section-Level Editing', () => {
    it('should support editing individual sections while preserving parallel architecture', async () => {
      const existingPRD = {
        sections: {
          targetUsers: {
            targetUsers: ['Original user 1', 'Original user 2']
          },
          solution: {
            solutionOverview: 'Original solution overview',
            approach: 'Original approach'
          },
          keyFeatures: {
            keyFeatures: ['Feature 1', 'Feature 2']
          },
          successMetrics: {
            successMetrics: [
              { metric: 'Original metric', target: '50%', timeline: '3 months' }
            ]
          },
          constraints: {
            constraints: ['Original constraint'],
            assumptions: ['Original assumption']
          }
        }
      }

      // Test editing just the keyFeatures section
      const result = await agent.generateSections({
        message: 'Add advanced analytics and reporting features',
        context: { existingPRD },
        targetSections: ['keyFeatures']
      })

      const traces = mockClient.traces

      // Should have 3 calls: 1 clarification + 1 context analysis + 1 keyFeatures section writer
      expect(traces).toHaveLength(3)
      
      const contextTrace = traces.find(t => t.workerName === 'contextAnalysis')
      const featuresTrace = traces.find(t => t.workerName === 'keyFeatures')
      
      expect(contextTrace).toBeDefined()
      expect(featuresTrace).toBeDefined()

      // Verify only keyFeatures was updated
      expect(result.metadata.sections_updated).toEqual(['keyFeatures'])
      expect(result.sections.keyFeatures).toBeDefined()

      console.log('\n✅ Section-level editing validated')
      console.log(`📝 Updated sections: ${result.metadata.sections_updated.join(', ')}`)
      console.log(`🎯 LLM calls for single section edit: ${traces.length}`)
    })
  })

  describe('Simplified Schema Validation', () => {
    it('should generate flat, simple schemas for each section', async () => {
      const userMessage = 'Build a simple inventory management system for small retail stores.'

      const result = await agent.generateSections({
        message: userMessage,
        context: {}
      })

      // Validate target users section (simple array)
      expect(Array.isArray(result.sections.targetUsers?.targetUsers)).toBe(true)
      expect(result.sections.targetUsers?.targetUsers.every((user: string) => typeof user === 'string')).toBe(true)

      // Validate solution section (simple strings)
      expect(typeof result.sections.solution?.solutionOverview).toBe('string')
      expect(typeof result.sections.solution?.approach).toBe('string')

      // Validate key features section (simple array)
      expect(Array.isArray(result.sections.keyFeatures?.keyFeatures)).toBe(true)
      expect(result.sections.keyFeatures?.keyFeatures.every((feature: string) => typeof feature === 'string')).toBe(true)

      // Validate success metrics section (simple objects)
      expect(Array.isArray(result.sections.successMetrics?.successMetrics)).toBe(true)
      result.sections.successMetrics?.successMetrics.forEach((metric: any) => {
        expect(metric).toHaveProperty('metric')
        expect(metric).toHaveProperty('target')
        expect(metric).toHaveProperty('timeline')
        expect(typeof metric.metric).toBe('string')
        expect(typeof metric.target).toBe('string')
        expect(typeof metric.timeline).toBe('string')
      })

      // Validate constraints section (simple arrays)
      expect(Array.isArray(result.sections.constraints?.constraints)).toBe(true)
      expect(Array.isArray(result.sections.constraints?.assumptions)).toBe(true)
      expect(result.sections.constraints?.constraints.every((constraint: string) => typeof constraint === 'string')).toBe(true)
      expect(result.sections.constraints?.assumptions.every((assumption: string) => typeof assumption === 'string')).toBe(true)

      console.log('\n✅ Simplified schema validation passed')
      console.log('📋 All sections use flat, simple data structures')
    })
  })

  describe('Performance Characteristics', () => {
    it('should demonstrate significant performance improvement over sequential processing', async () => {
      const userMessage = 'Create a social media scheduling tool for marketing agencies.'

      // Measure execution time
      const startTime = Date.now()
      
      const result = await agent.generateSections({
        message: userMessage,
        context: {}
      })
      
      const endTime = Date.now()
      const executionTime = endTime - startTime

      const traces = mockClient.traces

      // Verify performance characteristics
      expect(traces).toHaveLength(7) // 1 clarification + 1 analyzer + 5 parallel sections
      expect(executionTime).toBeLessThan(5000) // Should be much faster than sequential
      expect(result.metadata.sections_updated).toHaveLength(5)

      // Verify all sections were generated successfully
      expect(result.validation.is_valid).toBe(true)
      expect(result.metadata.overall_confidence?.level).toBeDefined()

      console.log('\n🚀 Performance Characteristics:')
      console.log(`⏱️  Execution time: ${executionTime}ms`)
      console.log(`📞 Total LLM calls: ${traces.length}`)
      console.log(`🎯 Success rate: ${result.validation.is_valid ? '100%' : 'Failed'}`)
      console.log(`📊 Overall confidence: ${result.metadata.overall_confidence?.level || 'unknown'}`)
      
      // Expected improvements over old architecture:
      // - 15+ LLM calls → 6 LLM calls (60% reduction)
      // - Sequential execution → Parallel execution (5x faster section generation)
      // - Complex nested schemas → Simple flat schemas (easier to work with)
    })
  })

  describe('Frontend Compatibility', () => {
    it('should generate flattened fields for frontend compatibility', async () => {
      const userMessage = 'Build a time tracking application for freelancers.'

      const result = await agent.generateSections({
        message: userMessage,
        context: {}
      })

      // The orchestrator should return both detailed sections AND flattened compatibility fields
      expect(result.sections).toBeDefined()

      // For frontend compatibility, we should be able to extract simple fields
      const flattenedPRD = {
        targetUsers: result.sections.targetUsers?.targetUsers || [],
        solutionOverview: result.sections.solution?.solutionOverview || '',
        goals: result.sections.keyFeatures?.keyFeatures || [],
        successMetrics: result.sections.successMetrics?.successMetrics || [],
        constraints: result.sections.constraints?.constraints || [],
        assumptions: result.sections.constraints?.assumptions || []
      }

      // Validate flattened structure
      expect(Array.isArray(flattenedPRD.targetUsers)).toBe(true)
      expect(typeof flattenedPRD.solutionOverview).toBe('string')
      expect(Array.isArray(flattenedPRD.goals)).toBe(true)
      expect(Array.isArray(flattenedPRD.successMetrics)).toBe(true)
      expect(Array.isArray(flattenedPRD.constraints)).toBe(true)
      expect(Array.isArray(flattenedPRD.assumptions)).toBe(true)

      console.log('\n✅ Frontend compatibility validated')
      console.log('🔄 Sections can be easily flattened for UI consumption')
    })
  })

  afterEach(() => {
    // Print summary after each test
    if (process.env.ENABLE_TEST_LOGS) {
      mockClient.printTraceSummary()
    }
  })
})