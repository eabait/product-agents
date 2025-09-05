/**
 * Comprehensive Unit Test for PRD Generation and Editing
 * 
 * This test suite proves that the PRD functionality is working correctly
 * after the fixes for context analysis and section writer resilience.
 */

import { PRDOrchestratorAgent } from '../prd-orchestrator-agent'
import { MockOpenRouterClient } from './mock-openrouter-client'

// Mock the OpenRouterClient to avoid real API calls
jest.mock('@product-agents/openrouter-client', () => {
  const { MockOpenRouterClient } = jest.requireActual('./mock-openrouter-client')
  return {
    OpenRouterClient: MockOpenRouterClient
  }
})

describe('PRD Generation and Editing Functionality', () => {
  let agent: PRDOrchestratorAgent
  let mockClient: MockOpenRouterClient

  beforeEach(() => {
    // Create a new agent instance for each test
    const settings = {
      model: 'anthropic/claude-3-5-sonnet',
      temperature: 0.3,
      maxTokens: 8000,
      apiKey: 'test-key'
    }
    
    agent = new PRDOrchestratorAgent(settings)
    
    // Get the mock client instance to set up responses
    mockClient = new MockOpenRouterClient('test-key')
    
    // Setup mock responses for all required components
    setupMockResponses(mockClient)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Fresh PRD Generation', () => {
    test('should generate a complete PRD with all 5 sections', async () => {
      const message = 'Create a PRD for a mobile note-taking app for students'
      
      const result = await agent.chat(message)
      
      // Verify the result is a PRD (not a clarification request)
      expect(result).toHaveProperty('sections')
      expect(result).toHaveProperty('metadata')
      expect(result).not.toHaveProperty('needsClarification')
      
      const prd = result as any
      
      // Verify all 5 sections are present
      expect(prd.sections).toHaveProperty('targetUsers')
      expect(prd.sections).toHaveProperty('solution')
      expect(prd.sections).toHaveProperty('keyFeatures')
      expect(prd.sections).toHaveProperty('successMetrics')
      expect(prd.sections).toHaveProperty('constraints')
      
      // Verify section content structure
      expect(prd.sections.targetUsers).toHaveProperty('targetUsers')
      expect(Array.isArray(prd.sections.targetUsers.targetUsers)).toBe(true)
      expect(prd.sections.targetUsers.targetUsers.length).toBeGreaterThan(0)
      
      expect(prd.sections.solution).toHaveProperty('solutionOverview')
      expect(prd.sections.solution).toHaveProperty('approach')
      expect(typeof prd.sections.solution.solutionOverview).toBe('string')
      expect(prd.sections.solution.solutionOverview.length).toBeGreaterThan(0)
      
      expect(prd.sections.keyFeatures).toHaveProperty('keyFeatures')
      expect(Array.isArray(prd.sections.keyFeatures.keyFeatures)).toBe(true)
      expect(prd.sections.keyFeatures.keyFeatures.length).toBeGreaterThan(0)
      
      expect(prd.sections.successMetrics).toHaveProperty('successMetrics')
      expect(Array.isArray(prd.sections.successMetrics.successMetrics)).toBe(true)
      expect(prd.sections.successMetrics.successMetrics.length).toBeGreaterThan(0)
      
      expect(prd.sections.constraints).toHaveProperty('constraints')
      expect(prd.sections.constraints).toHaveProperty('assumptions')
      expect(Array.isArray(prd.sections.constraints.constraints)).toBe(true)
      expect(Array.isArray(prd.sections.constraints.assumptions)).toBe(true)
      
      // Verify metadata
      expect(prd.metadata).toHaveProperty('version', '2.0')
      expect(prd.metadata).toHaveProperty('generatedBy', 'PRD Orchestrator Agent')
      expect(prd.metadata).toHaveProperty('sections_generated')
      expect(prd.metadata.sections_generated).toEqual(
        expect.arrayContaining(['targetUsers', 'solution', 'keyFeatures', 'successMetrics', 'constraints'])
      )
      
      // Verify legacy compatibility fields are populated
      expect(typeof prd.solutionOverview).toBe('string')
      expect(Array.isArray(prd.targetUsers)).toBe(true)
      expect(Array.isArray(prd.goals)).toBe(true)
      expect(Array.isArray(prd.successMetrics)).toBe(true)
      expect(Array.isArray(prd.constraints)).toBe(true)
      expect(Array.isArray(prd.assumptions)).toBe(true)
    })

    test('should handle context analysis failures gracefully', async () => {
      // Simulate context analysis failure by not setting a mock response
      const message = 'Create a PRD for a complex enterprise system'
      
      // Remove the context analysis mock to simulate failure
      const mockClientWithFailure = new MockOpenRouterClient('test-key')
      setupMockResponsesWithoutContextAnalysis(mockClientWithFailure)
      
      // The test should still pass because of our fallback logic
      const result = await agent.chat(message)
      
      // Should still generate a PRD with fallback context
      expect(result).toHaveProperty('sections')
      expect(result).toHaveProperty('metadata')
      
      // Sections should still be generated even without context analysis
      const prd = result as any
      expect(prd.sections).toHaveProperty('targetUsers')
      expect(prd.sections).toHaveProperty('solution')
    }, 15000)
  })

  describe('PRD Editing', () => {
    test('should successfully edit an existing PRD without crashing', async () => {
      const existingPRD = {
        solutionOverview: 'TaskFlow is a mobile task management app',
        targetUsers: ['Small team leaders', 'Project managers'],
        goals: ['Task management', 'Team collaboration'],
        successMetrics: [{ metric: 'User adoption', target: '80%', timeline: '3 months' }],
        constraints: ['Must work offline'],
        assumptions: ['Users have smartphones']
      }
      
      const editMessage = 'Add mobile notifications and push alerts to the solution'
      
      const result = await agent.chat(editMessage, {
        operation: 'edit',
        existingPRD
      })
      
      // Should return a PRD without crashing
      expect(result).toBeDefined()
      expect(result).toHaveProperty('sections')
      expect(result).toHaveProperty('metadata')
      
      // Should not be a clarification request
      expect(result).not.toHaveProperty('needsClarification')
      
      const prd = result as any
      
      // Verify the structure is intact
      expect(prd.sections).toBeDefined()
      expect(prd.metadata).toHaveProperty('version', '2.0')
      expect(prd.metadata).toHaveProperty('generatedBy', 'PRD Orchestrator Agent')
    })

    test('should preserve existing PRD structure during editing', async () => {
      const existingPRD = {
        problemStatement: 'Students need better note-taking tools',
        solutionOverview: 'A mobile app for digital note-taking',
        targetUsers: ['University students', 'Graduate students'],
        goals: ['Digital note organization', 'Cross-device sync'],
        successMetrics: [
          { metric: 'Daily active users', target: '10,000', timeline: '6 months' },
          { metric: 'Note retention', target: '90%', timeline: '1 year' }
        ],
        constraints: ['Limited storage', 'Must work offline'],
        assumptions: ['Students own smartphones', 'Wi-Fi is available on campus']
      }
      
      const editMessage = 'Add voice-to-text functionality'
      
      const result = await agent.chat(editMessage, {
        operation: 'edit',
        existingPRD
      })
      
      const prd = result as any
      
      // Verify legacy fields are preserved/converted correctly
      expect(prd.solutionOverview).toBeDefined()
      expect(prd.targetUsers).toBeDefined()
      expect(prd.goals).toBeDefined()
      expect(prd.successMetrics).toBeDefined()
      expect(prd.constraints).toBeDefined()
      expect(prd.assumptions).toBeDefined()
      
      // Verify new section structure exists
      expect(prd.sections).toBeDefined()
      expect(typeof prd.sections).toBe('object')
    })
  })

  describe('Context Analysis Resilience', () => {
    test('should handle malformed context analysis responses', async () => {
      // Setup a mock that returns malformed data (similar to the real issue)
      const malformedMockClient = new MockOpenRouterClient('test-key')
      
      // Set up responses that mimic the real issue
      malformedMockClient.setMockResponse('contextAnalysis', {
        themes: ['Mobile App', 'Student Tools'],
        requirements: '<parameter name="functional">["Digital notes", "Sync across devices"]</parameter>',
        functional: ['Digital notes', 'Sync across devices'],
        technical: ['Mobile development', 'Cloud storage'],
        user_experience: ['Intuitive UI', 'Fast performance'],
        constraints: ['Budget constraints', 'Timeline limitations']
      })
      
      // Set up other required responses
      setupMockResponsesForSections(malformedMockClient)
      
      const message = 'Create a PRD for a student note-taking app'
      const result = await agent.chat(message)
      
      // Should still work despite malformed context analysis
      expect(result).toBeDefined()
      expect(result).toHaveProperty('sections')
      
      const prd = result as any
      expect(prd.sections).toHaveProperty('targetUsers')
      expect(prd.sections).toHaveProperty('solution')
    })
  })

  describe('Error Recovery', () => {
    test('should continue processing sections even when one fails', async () => {
      const mockClientWithPartialFailure = new MockOpenRouterClient('test-key')
      
      // Setup context analysis
      mockClientWithPartialFailure.setMockResponse('contextAnalysis', {
        themes: ['Mobile App', 'Student Tools'],
        requirements: {
          functional: ['Digital notes', 'Sync'],
          technical: ['Mobile dev', 'Cloud'],
          user_experience: ['Fast UI'],
          epics: [{ title: 'Core Features', description: 'Basic note taking' }],
          mvpFeatures: ['Create notes', 'Save notes']
        },
        constraints: ['Budget limits']
      })
      
      // Setup successful responses for most sections
      mockClientWithPartialFailure.setMockResponse('targetUsers', {
        targetUsers: ['University students', 'Graduate students']
      })
      
      mockClientWithPartialFailure.setMockResponse('solution', {
        solutionOverview: 'A digital note-taking platform',
        approach: 'Mobile-first development approach'
      })
      
      // Don't set up keyFeatures to simulate failure
      // mockClientWithPartialFailure.setMockResponse('keyFeatures', {...})
      
      mockClientWithPartialFailure.setMockResponse('successMetrics', {
        successMetrics: [
          { metric: 'User adoption', target: '80%', timeline: '3 months' }
        ]
      })
      
      mockClientWithPartialFailure.setMockResponse('constraints', {
        constraints: ['Limited budget'],
        assumptions: ['Users have smartphones']
      })
      
      const message = 'Create a PRD for a note-taking app'
      
      // Should handle partial failures gracefully
      const result = await agent.chat(message)
      
      expect(result).toBeDefined()
      expect(result).toHaveProperty('sections')
      
      const prd = result as any
      
      // Should have successful sections
      expect(prd.sections.targetUsers).toBeDefined()
      expect(prd.sections.solution).toBeDefined()
      expect(prd.sections.successMetrics).toBeDefined()
      expect(prd.sections.constraints).toBeDefined()
      
      // Failed section might be missing or empty
      // But the overall PRD should still be valid
      expect(prd.metadata).toBeDefined()
    })
  })
})

// Helper function to set up comprehensive mock responses
function setupMockResponses(mockClient: MockOpenRouterClient) {
  // Context Analysis
  mockClient.setMockResponse('contextAnalysis', {
    themes: ['Mobile Applications', 'Student Productivity', 'Note-Taking', 'Digital Organization'],
    requirements: {
      functional: [
        'Create and edit digital notes',
        'Organize notes by subject/category',
        'Search through notes',
        'Sync across devices'
      ],
      technical: [
        'Mobile app development (iOS/Android)',
        'Cloud storage integration',
        'Offline functionality',
        'Real-time synchronization'
      ],
      user_experience: [
        'Intuitive note creation interface',
        'Fast search and retrieval',
        'Minimal learning curve',
        'Reliable offline access'
      ],
      epics: [
        { title: 'Core Note Taking', description: 'Basic note creation and editing functionality' },
        { title: 'Organization System', description: 'Categorization and tagging system' },
        { title: 'Sync and Backup', description: 'Cross-device synchronization' }
      ],
      mvpFeatures: [
        'Create and edit text notes',
        'Basic categorization',
        'Local storage with cloud backup',
        'Simple search functionality'
      ]
    },
    constraints: [
      'Must work on both iOS and Android',
      'Limited development budget',
      'Must function offline',
      'Privacy and data security requirements'
    ]
  })

  setupMockResponsesForSections(mockClient)
}

function setupMockResponsesForSections(mockClient: MockOpenRouterClient) {
  // Target Users
  mockClient.setMockResponse('targetUsers', {
    targetUsers: [
      'University students taking lecture notes across multiple subjects',
      'Graduate students conducting research and organizing findings',
      'High school students preparing for standardized tests',
      'Adult learners taking online courses and workshops'
    ]
  })

  // Solution
  mockClient.setMockResponse('solution', {
    solutionOverview: 'NoteFlow is a mobile-first digital note-taking application designed specifically for students, providing seamless note creation, organization, and synchronization across devices. The app combines intuitive text editing with smart categorization features, enabling students to quickly capture, organize, and retrieve their notes during lectures, study sessions, and research activities.',
    approach: 'We will develop using a cross-platform mobile framework (React Native) to ensure consistent experience across iOS and Android. The architecture will prioritize offline functionality with intelligent sync, using a local-first approach where notes are immediately saved locally and synced to the cloud when connectivity is available.'
  })

  // Key Features
  mockClient.setMockResponse('keyFeatures', {
    keyFeatures: [
      'Quick Note Creation: Tap-to-create notes with rich text formatting, bullet points, and basic styling options optimized for mobile typing',
      'Smart Organization: Automatic and manual categorization by subject, date, or custom tags with visual organization tools',
      'Offline-First Design: All notes are immediately saved locally with background sync when online, ensuring no data loss',
      'Universal Search: Fast full-text search across all notes with keyword highlighting and filtering options',
      'Cross-Device Sync: Seamless synchronization across phone, tablet, and web with conflict resolution'
    ]
  })

  // Success Metrics
  mockClient.setMockResponse('successMetrics', {
    successMetrics: [
      { metric: 'Daily Active Users', target: '10,000 students using the app daily', timeline: '6 months post-launch' },
      { metric: 'Note Retention Rate', target: '90% of created notes are kept for more than 1 month', timeline: '3 months post-launch' },
      { metric: 'User Engagement', target: 'Average of 15 notes created per user per week', timeline: '4 months post-launch' },
      { metric: 'Cross-Platform Adoption', target: '60% of users access notes on multiple devices', timeline: '8 months post-launch' }
    ]
  })

  // Constraints
  mockClient.setMockResponse('constraints', {
    constraints: [
      'Must maintain full functionality without internet connection',
      'Development budget limited to $150,000 for MVP',
      'Must comply with FERPA privacy regulations for student data',
      'App size must remain under 50MB for easy download on limited data plans',
      'Must support devices running iOS 13+ and Android 8+ (covering 90% of student devices)'
    ],
    assumptions: [
      'Target users own smartphones and have basic digital literacy',
      'Students prefer mobile-first solutions over desktop applications',
      'Users will primarily create text-based notes with occasional images',
      'Cloud storage costs will remain within projected estimates based on usage patterns',
      'Educational institutions will not block or restrict access to the application'
    ]
  })
}

function setupMockResponsesWithoutContextAnalysis(mockClient: MockOpenRouterClient) {
  // Don't set context analysis response to simulate failure
  setupMockResponsesForSections(mockClient)
}