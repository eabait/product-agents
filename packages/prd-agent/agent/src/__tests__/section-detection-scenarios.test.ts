/**
 * Test scenarios for Section Detection Analyzer
 * 
 * This test suite validates that the section detection logic correctly identifies
 * which sections need updates for different types of edit requests.
 */

import { PRDOrchestratorAgent } from '../prd-orchestrator-agent'
import { MockOpenRouterClient } from './mock-openrouter-client'

// Mock the OpenRouterClient
jest.mock('@product-agents/openrouter-client', () => {
  return {
    OpenRouterClient: jest.fn().mockImplementation(() => globalMockClient)
  }
})

// Create a shared mock client instance
let globalMockClient: MockOpenRouterClient

describe('Section Detection Scenarios', () => {
  let agent: PRDOrchestratorAgent
  let mockClient: MockOpenRouterClient

  beforeEach(() => {
    // Create the mock client instance
    mockClient = new MockOpenRouterClient('test-key')
    globalMockClient = mockClient
    
    // Setup basic mock responses
    setupBasicMockResponses(mockClient)
    
    // Create agent
    const settings = {
      model: 'anthropic/claude-3-5-sonnet',
      temperature: 0.3,
      maxTokens: 8000,
      apiKey: 'test-key'
    }
    
    agent = new PRDOrchestratorAgent(settings)
  })

  describe('Feature Addition Scenarios', () => {
    test('should only update keyFeatures when adding telegram/whatsapp integration', async () => {
      // Mock section detection to return only keyFeatures
      mockClient.setMockResponse('sectionDetection', {
        affectedSections: ['keyFeatures'],
        reasoning: {
          keyFeatures: 'Adding new messaging platform integrations to existing functionality'
        },
        confidence: 'high'
      })

      const existingPRD = {
        sections: {
          targetUsers: {
            targetUsers: ['Restaurant managers', 'Busy professionals']
          },
          solution: {
            solutionOverview: 'AI-powered restaurant chatbot',
            approach: 'Microservices architecture'
          },
          keyFeatures: {
            keyFeatures: ['Table reservations', 'Order management']
          }
        }
      }

      const result = await agent.chat('add a feature to integrate with telegram and whatsapp', existingPRD)
      
      // Should be a PRD (not clarification)
      expect(result).toHaveProperty('sections')
      expect(result).not.toHaveProperty('needsClarification')
      
      const prd = result as any
      
      // Only keyFeatures section should be in the updated sections
      expect(prd.metadata.sections_generated).toEqual(['keyFeatures'])
      
      // Target users should remain unchanged from original
      expect(prd.sections.targetUsers.targetUsers).toEqual(['Restaurant managers', 'Busy professionals'])
      
      // Key features should be updated with new messaging platform integration
      expect(prd.sections.keyFeatures.keyFeatures.some((feature: string) => 
        feature.includes('Messaging Platform Integration')
      )).toBe(true)
    })

    test('should update targetUsers when changing target audience', async () => {
      // Mock section detection for audience change
      mockClient.setMockResponse('sectionDetection', {
        affectedSections: ['targetUsers', 'solution'],
        reasoning: {
          targetUsers: 'Changing the primary target audience',
          solution: 'Solution approach may need adjustment for new audience'
        },
        confidence: 'high'
      })

      const existingPRD = {
        sections: {
          targetUsers: {
            targetUsers: ['Restaurant managers', 'Busy professionals']
          }
        }
      }

      const result = await agent.chat('target small businesses instead of restaurants', existingPRD)
      const prd = result as any
      
      // Should update targetUsers and solution
      expect(prd.metadata.sections_generated).toEqual(['targetUsers', 'solution'])
    })

    test('should only update constraints when adding technical requirements', async () => {
      // Mock section detection for constraint addition
      mockClient.setMockResponse('sectionDetection', {
        affectedSections: ['constraints'],
        reasoning: {
          constraints: 'Adding new technical compliance requirement'
        },
        confidence: 'high'
      })

      const existingPRD = {
        sections: {
          constraints: {
            constraints: ['Must work on mobile devices'],
            assumptions: ['Users have smartphones']
          }
        }
      }

      const result = await agent.chat('must be GDPR compliant', existingPRD)
      const prd = result as any
      
      // Should only update constraints
      expect(prd.metadata.sections_generated).toEqual(['constraints'])
    })

    test('should only update successMetrics when adding measurements', async () => {
      // Mock section detection for metrics addition  
      mockClient.setMockResponse('sectionDetection', {
        affectedSections: ['successMetrics'],
        reasoning: {
          successMetrics: 'Adding new success measurement criteria'
        },
        confidence: 'high'
      })

      const existingPRD = {
        sections: {
          successMetrics: {
            successMetrics: [
              { metric: 'User Adoption', target: '1000 users', timeline: '3 months' }
            ]
          }
        }
      }

      const result = await agent.chat('measure user engagement and retention rates', existingPRD)
      const prd = result as any
      
      // Should only update success metrics
      expect(prd.metadata.sections_generated).toEqual(['successMetrics'])
    })
  })

  describe('Conservative Section Detection', () => {
    test('should not update unrelated sections for specific feature requests', async () => {
      // Mock conservative section detection
      mockClient.setMockResponse('sectionDetection', {
        affectedSections: ['keyFeatures'], // Only features, not users or solution
        reasoning: {
          keyFeatures: 'Adding new payment processing feature'
        },
        confidence: 'high'
      })

      const existingPRD = {
        sections: {
          keyFeatures: {
            keyFeatures: ['User authentication', 'Data storage']
          }
        }
      }

      const result = await agent.chat('add stripe payment integration', existingPRD)
      const prd = result as any
      
      // Should be conservative and only update keyFeatures
      expect(prd.metadata.sections_generated).toEqual(['keyFeatures'])
      expect(prd.metadata.sections_generated).not.toContain('targetUsers')
      expect(prd.metadata.sections_generated).not.toContain('solution')
    })
  })
})

function setupBasicMockResponses(mockClient: MockOpenRouterClient) {
  // Clarification
  mockClient.setMockResponse('clarification', {
    needsClarification: false,
    confidence: 85,
    missingCritical: [],
    questions: []
  })

  // Context Analysis
  mockClient.setMockResponse('contextAnalysis', {
    themes: ['Restaurant Technology', 'Customer Service', 'Digital Integration'],
    requirements: {
      functional: ['Table booking', 'Order management', 'Customer communication'],
      technical: ['API integration', 'Real-time messaging', 'Cross-platform support'],
      user_experience: ['Intuitive interface', 'Quick responses', 'Reliable service'],
      epics: [
        { title: 'Messaging Integration', description: 'Connect with popular messaging platforms' }
      ],
      mvpFeatures: ['Basic messaging', 'Platform connectivity', 'Message routing']
    },
    constraints: ['Platform API limitations', 'Message rate limits', 'Authentication requirements']
  })

  // Section Writers
  mockClient.setMockResponse('targetUsers', {
    targetUsers: [
      'Restaurant managers seeking to reduce staffing costs',
      'Tech-savvy customers who prefer messaging apps'
    ]
  })

  mockClient.setMockResponse('solution', {
    solutionOverview: 'Omnichannel AI-powered restaurant chatbot with messaging platform integration',
    approach: 'Platform-agnostic core service with dedicated messaging adapters'
  })

  mockClient.setMockResponse('keyFeatures', {
    keyFeatures: [
      '**Table Reservation System**: Book, modify, cancel reservations through chatbot',
      '**Takeaway Order Management**: Browse menu, create orders, complete payments',
      '**Messaging Platform Integration**: Seamlessly connects with Telegram and WhatsApp',
      '**Order Status Tracking**: Real-time updates on order preparation and delivery',
      '**Intelligent Conversation Flow**: Natural language processing for seamless interactions'
    ]
  })

  mockClient.setMockResponse('successMetrics', {
    successMetrics: [
      { metric: 'Platform Adoption Rate', target: '70% of users engage via messaging platforms', timeline: '6 months post-launch' },
      { metric: 'Response Time', target: 'Average response time under 2 seconds across all platforms', timeline: '3 months post-launch' }
    ]
  })

  mockClient.setMockResponse('constraints', {
    constraints: [
      'Must integrate with Telegram Bot API and WhatsApp Business API',
      'Message rate limits enforced by platform providers',
      'End-to-end encryption requirements for messaging platforms'
    ],
    assumptions: [
      'Users prefer messaging over phone calls for routine transactions',
      'Messaging platforms will maintain stable API compatibility'
    ]
  })
}