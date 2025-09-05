/**
 * Clarification Integration Test
 * 
 * Tests the full agent pipeline with clarification flow
 * to ensure proper integration between clarification worker
 * and the overall PRD generation process.
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

describe('PRDOrchestratorAgent Clarification Integration', () => {
  const testSettings = {
    model: 'anthropic/claude-3-5-sonnet',
    temperature: 0.3,
    maxTokens: 2000,
    apiKey: 'test-key'
  }

  beforeEach(() => {
    mockClient.clearTraces()
  })

  it('should request clarification for vague user input', async () => {
    const agent = new PRDOrchestratorAgent(testSettings)
    
    // Mock clarification worker to return questions
    mockClient.setMockResponse('clarification', {
      needsClarification: true,
      confidence: 25,
      missingCritical: ['target users unclear', 'business model not specified', 'platform requirements missing'],
      questions: [
        'Who are the primary users of this social media platform?',
        'What is the revenue model for this platform?',
        'What platforms should this support (web, mobile, desktop)?'
      ]
    })

    const vagueMesage = 'Build a social media platform'
    const result = await agent.chat(vagueMesage)
    
    // Should return clarification questions, not a PRD
    expect(result).toHaveProperty('needsClarification', true)
    expect(result).toHaveProperty('questions')
    expect((result as any).questions).toHaveLength(3)
    expect(result).not.toHaveProperty('problemStatement')

    // Verify clarification worker was called
    const traces = mockClient.getTracesForWorker('clarification')
    expect(traces).toHaveLength(1)
    expect(traces[0].prompt).toContain(vagueMesage)

    // Verify other workers were NOT called
    expect(mockClient.getTracesForWorker('contextAnalysis')).toHaveLength(0)
    expect(mockClient.getTracesForWorker('requirementsExtraction')).toHaveLength(0)
  })

  it('should bypass clarification and generate PRD for detailed input', async () => {
    const agent = new PRDOrchestratorAgent(testSettings)
    
    // Mock clarification worker to indicate sufficient context
    mockClient.setMockResponse('clarification', {
      needsClarification: false,
      confidence: 85,
      missingCritical: [],
      questions: []
    })

    // Mock all other workers for PRD generation
    mockClient.setMockResponse('contextAnalysis', {
      themes: ['Social networking', 'Photography', 'Content sharing'],
      requirements: {
        functional: ['Photo upload', 'Social feeds', 'User profiles'],
        technical: ['Mobile-first', 'Real-time updates', 'Cloud storage'],
        user_experience: ['Intuitive UI', 'Fast loading', 'Offline support']
      },
      constraints: ['Budget: $500K', 'Timeline: 12 months']
    })

    mockClient.setMockResponse('requirementsExtraction', {
      functional: ['Users can upload and share photos', 'Users can follow other users'],
      nonFunctional: ['Platform supports 100k concurrent users', 'Photos load within 2 seconds']
    })

    mockClient.setMockResponse('problemStatement', 
      'Photography enthusiasts lack a platform to share high-quality images with like-minded creators while maintaining creative control and building meaningful connections.'
    )

    mockClient.setMockResponse('solutionFramework', {
      approach: 'Mobile-first social platform with advanced photo editing',
      components: ['Photo editor', 'Social feed', 'Discovery engine'],
      technologies: ['React Native', 'Node.js', 'AWS S3', 'Redis']
    })

    mockClient.setMockResponse('prdSynthesis', {
      problemStatement: 'Photography enthusiasts need better sharing platform',
      solutionOverview: 'Mobile-first photo sharing with advanced editing',
      targetUsers: ['Amateur photographers', 'Photography students', 'Creative professionals'],
      goals: ['Build community of 50k users', 'Achieve 70% monthly retention'],
      successMetrics: [
        { metric: 'Monthly active users', target: '50,000', timeline: '12 months' },
        { metric: 'User retention', target: '70%', timeline: '6 months' }
      ],
      constraints: ['$500K budget', '12-month timeline'],
      assumptions: ['Users want better photo editing tools', 'Community features drive engagement']
    })

    const detailedMessage = `Build a social media platform for photography enthusiasts. 

Target users: Amateur photographers, photography students, and creative professionals aged 18-45 who want to share high-quality images and connect with like-minded creators.

Key features: Advanced photo editing tools, curated discovery feeds, portfolio creation, photography challenges and contests, educational content.

Business model: Freemium with premium subscriptions ($9.99/month) for advanced editing tools and unlimited storage.

Technical requirements: Mobile-first design (iOS/Android), web companion, real-time notifications, cloud storage integration, advanced image processing.

Success metrics: 50k monthly active users within 12 months, 70% user retention rate, $100k monthly revenue by month 18.

Constraints: $500K development budget, 12-month initial launch timeline, team of 8 developers.`

    const result = await agent.chat(detailedMessage)
    
    // Should return a complete PRD, not clarification questions
    expect(result).toHaveProperty('problemStatement')
    expect(result).toHaveProperty('solutionOverview')
    expect(result).toHaveProperty('targetUsers')
    expect(result).not.toHaveProperty('needsClarification')

    // Verify all workers were called in sequence
    expect(mockClient.getTracesForWorker('clarification')).toHaveLength(1)
    expect(mockClient.getTracesForWorker('contextAnalysis')).toHaveLength(1)
    expect(mockClient.getTracesForWorker('requirementsExtraction')).toHaveLength(1)
    expect(mockClient.getTracesForWorker('problemStatement')).toHaveLength(1)
    expect(mockClient.getTracesForWorker('solutionFramework')).toHaveLength(1)
    expect(mockClient.getTracesForWorker('prdSynthesis')).toHaveLength(1)
  })

  it('should handle context in clarification appropriately', async () => {
    const agent = new PRDOrchestratorAgent(testSettings)
    
    // Mock clarification to not need clarification
    mockClient.setMockResponse('clarification', {
      needsClarification: false,
      confidence: 75,
      missingCritical: [],
      questions: []
    })
    
    // Mock all workers for PRD generation
    mockClient.setMockResponse('contextAnalysis', { themes: ['Task management'] })
    mockClient.setMockResponse('requirementsExtraction', { 
      functional: ['Create tasks'],
      nonFunctional: ['Support 50 users']
    })
    mockClient.setMockResponse('problemStatement', 'Teams need better task coordination')
    mockClient.setMockResponse('solutionFramework', { approach: 'Web-based task manager' })
    mockClient.setMockResponse('prdSynthesis', {
      problemStatement: 'Teams need task coordination',
      solutionOverview: 'Web-based task manager',
      targetUsers: ['Team leads'],
      goals: ['Improve productivity'],
      successMetrics: [],
      constraints: [],
      assumptions: []
    })

    const message = 'Build a task management tool'
    
    const result = await agent.chat(message)
    
    // Should return PRD since clarification determined no questions needed
    expect(result).toHaveProperty('problemStatement')
    expect(result).not.toHaveProperty('needsClarification')

    // Verify all workers were called including clarification
    expect(mockClient.getTracesForWorker('clarification')).toHaveLength(1)
    expect(mockClient.getTracesForWorker('contextAnalysis')).toHaveLength(1)
    expect(mockClient.getTracesForWorker('requirementsExtraction')).toHaveLength(1)
  })

  describe('Enhanced Clarification Logic', () => {
    it('should proceed with reasonable assumptions for common app types', async () => {
      const agent = new PRDOrchestratorAgent(testSettings)
      
      // Mock clarification to proceed with reasonable assumptions
      mockClient.setMockResponse('clarification', {
        needsClarification: false,
        confidence: 75,
        missingCritical: [],
        questions: []
      })

      // Mock all other workers
      mockClient.setMockResponse('contextAnalysis', {
        themes: ['E-commerce', 'Mobile shopping'],
        requirements: {
          functional: ['Product catalog', 'Shopping cart', 'Payment processing'],
          technical: ['Mobile-first', 'Secure payments', 'Real-time inventory'],
          user_experience: ['Intuitive navigation', 'Fast checkout', 'Search functionality']
        },
        constraints: []
      })

      mockClient.setMockResponse('requirementsExtraction', {
        functional: ['Users can browse products', 'Users can add items to cart', 'Users can complete purchases'],
        nonFunctional: ['Platform handles 1000 concurrent users', 'Payments are secure and PCI compliant']
      })

      mockClient.setMockResponse('problemStatement', 
        'Consumers need a convenient mobile shopping experience with fast product discovery and secure checkout.'
      )

      mockClient.setMockResponse('solutionFramework', {
        approach: 'Mobile-first e-commerce platform with streamlined user experience',
        components: ['Product catalog', 'Shopping cart', 'Payment gateway', 'User accounts'],
        technologies: ['React Native', 'Node.js', 'Stripe', 'MongoDB']
      })

      mockClient.setMockResponse('prdSynthesis', {
        problemStatement: 'Consumers need convenient mobile shopping',
        solutionOverview: 'Mobile-first e-commerce platform',
        targetUsers: ['Mobile shoppers', 'Busy consumers', 'Tech-savvy buyers'],
        goals: ['Increase mobile conversion rate', 'Reduce cart abandonment'],
        successMetrics: [
          { metric: 'Mobile conversion rate', target: '3.5%', timeline: '6 months' }
        ],
        constraints: ['PCI compliance required'],
        assumptions: ['Users prefer mobile shopping', 'Fast checkout reduces abandonment']
      })

      // Test with a somewhat detailed but not exhaustive request
      const message = 'Build a mobile shopping app for fashion items with secure payment processing'
      const result = await agent.chat(message)
      
      // Should generate PRD, not ask for clarification
      expect(result).toHaveProperty('problemStatement')
      expect(result).toHaveProperty('solutionOverview')
      expect(result).not.toHaveProperty('needsClarification')

      // Verify clarification worker determined it could proceed
      const traces = mockClient.getTracesForWorker('clarification')
      expect(traces).toHaveLength(1)
    })

    it('should ask targeted questions only for critical gaps', async () => {
      const agent = new PRDOrchestratorAgent(testSettings)
      
      // Mock clarification to identify only critical gaps
      mockClient.setMockResponse('clarification', {
        needsClarification: true,
        confidence: 45,
        missingCritical: ['core functionality unclear'],
        questions: [
          'What specific problem should this platform solve for users?'
        ]
      })

      const vagueMesage = 'Build a platform for businesses'
      const result = await agent.chat(vagueMesage)
      
      // Should return clarification with only essential questions
      expect(result).toHaveProperty('needsClarification', true)
      expect(result).toHaveProperty('questions')
      expect((result as any).questions).toHaveLength(1)
      expect((result as any).confidence).toBe(45)
      expect((result as any).missingCritical).toContain('core functionality unclear')

      // Verify only clarification worker was called
      expect(mockClient.getTracesForWorker('clarification')).toHaveLength(1)
      expect(mockClient.getTracesForWorker('contextAnalysis')).toHaveLength(0)
    })

    it('should demonstrate confidence-based decision making', async () => {
      const agent = new PRDOrchestratorAgent(testSettings)
      
      // Test medium confidence scenario - should proceed but with lower confidence
      mockClient.setMockResponse('clarification', {
        needsClarification: false,
        confidence: 65,
        missingCritical: [],
        questions: []
      })

      // Mock remaining workers
      mockClient.setMockResponse('contextAnalysis', { themes: ['Project management'] })
      mockClient.setMockResponse('requirementsExtraction', { 
        functional: ['Create tasks'], 
        nonFunctional: ['Handle 100 users'] 
      })
      mockClient.setMockResponse('problemStatement', 'Teams need better task coordination')
      mockClient.setMockResponse('solutionFramework', { approach: 'Web-based task manager' })
      mockClient.setMockResponse('prdSynthesis', {
        problemStatement: 'Teams need task coordination',
        solutionOverview: 'Web-based task manager',
        targetUsers: ['Project managers'],
        goals: ['Improve team productivity'],
        successMetrics: [],
        constraints: [],
        assumptions: []
      })

      const message = 'Build a project management tool for teams'
      const result = await agent.chat(message)
      
      // Should generate PRD with medium confidence
      expect(result).toHaveProperty('problemStatement')
      expect(result).not.toHaveProperty('needsClarification')

      // Check that clarification worker had medium confidence
      const clarificationTrace = mockClient.getTracesForWorker('clarification')[0]
      expect(clarificationTrace.response.confidence).toBe(65)
    })
  })
})