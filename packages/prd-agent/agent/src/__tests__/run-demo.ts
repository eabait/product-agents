/**
 * Demo Script for Prompt Tracing
 * 
 * Run this to see live prompt traces without Jest overhead.
 * Demonstrates the flow of prompts through the agent pipeline.
 */

import { PRDOrchestratorAgent } from '../prd-orchestrator-agent'
import { MockOpenRouterClient } from './mock-openrouter-client'

// Create global mock instance
const mockClient = new MockOpenRouterClient()

// Mock the OpenRouter client module
jest.mock('@product-agents/openrouter-client', () => ({
  OpenRouterClient: jest.fn().mockImplementation(() => mockClient)
}))

async function runPromptTracingDemo() {
  console.log('🚀 PRD Agent Prompt Tracing Demo\n')

  // Set up mock responses
  mockClient.setMockResponses({
    contextAnalysis: {
      themes: ['E-commerce', 'Mobile-first design', 'Real-time features'],
      requirements: {
        functional: ['Product catalog', 'Shopping cart', 'Order tracking'],
        technical: ['Mobile responsive', 'Push notifications', 'Payment processing'],
        user_experience: ['Fast checkout', 'Intuitive navigation', 'Offline browsing']
      },
      constraints: ['6-month timeline', 'Limited budget', 'Small team']
    },
    requirementsExtraction: {
      functional: [
        'Users can browse product catalog',
        'Users can add items to cart',
        'Users can complete checkout process',
        'Users can track order status',
        'Users can save favorite items'
      ],
      nonFunctional: [
        'App loads within 3 seconds',
        'Supports 10,000 concurrent users',
        'Payment data must be encrypted',
        'Offline mode for browsing'
      ]
    },
    problemStatement: 'Small businesses struggle to compete with major e-commerce platforms due to lack of mobile-first shopping experiences. Current solutions are either too expensive or lack essential features like real-time order tracking.',
    solutionFramework: {
      approach: 'Build a mobile-first e-commerce platform with real-time features',
      components: ['Mobile App', 'Admin Dashboard', 'Payment Gateway', 'Notification Service'],
      technologies: ['React Native', 'Node.js', 'MongoDB', 'Stripe', 'Firebase']
    },
    prdSynthesis: {
      problemStatement: 'Small businesses struggle to compete with major e-commerce platforms due to lack of mobile-first shopping experiences.',
      solutionOverview: 'A comprehensive mobile-first e-commerce platform that enables small businesses to create engaging shopping experiences with real-time order tracking and seamless payment processing.',
      targetUsers: [
        'Small business owners seeking to expand online',
        'Mobile-first shoppers aged 25-45',
        'Business managers tracking sales and inventory'
      ],
      goals: [
        'Enable small businesses to launch mobile stores within 2 weeks',
        'Achieve 95% mobile checkout completion rate',
        'Provide real-time order tracking for all purchases'
      ],
      successMetrics: [
        {
          metric: 'Mobile conversion rate',
          target: '15% higher than industry average',
          timeline: '6 months post-launch'
        },
        {
          metric: 'Business onboarding time',
          target: 'Under 2 weeks from signup to live store',
          timeline: '3 months post-launch'
        }
      ],
      constraints: [
        'Must integrate with existing payment providers',
        'Development budget of $300K',
        'Launch timeline of 6 months'
      ],
      assumptions: [
        'Small businesses will adopt mobile-first approach',
        'Customers prefer mobile shopping experiences',
        'Real-time features drive customer satisfaction'
      ]
    }
  })

  // Create agent
  const agent = new PRDOrchestratorAgent({
    model: 'anthropic/claude-3-5-sonnet',
    temperature: 0.3,
    maxTokens: 4000,
    apiKey: 'demo-key'
  })

  const userMessage = 'I want to build a mobile e-commerce platform that helps small businesses compete with larger retailers by providing real-time order tracking and seamless mobile checkout.'

  console.log('📝 User Input:')
  console.log(`"${userMessage}"\n`)

  console.log('⚡ Starting agent pipeline...\n')

  // Execute the agent
  const result = await agent.chat(userMessage)

  console.log('✅ Agent execution complete!\n')

  // Display detailed traces
  console.log('🔍 DETAILED PROMPT TRACES')
  console.log('='.repeat(50))

  mockClient.traces.forEach((trace, index) => {
    console.log(`\n${index + 1}. ${trace.workerName.toUpperCase()}`)
    console.log(`   Timestamp: ${new Date(trace.timestamp).toISOString()}`)
    console.log(`   Model: ${trace.settings.model}`)
    console.log(`   Temperature: ${trace.settings.temperature}`)
    console.log(`   Prompt Length: ${trace.prompt.length} characters`)
    console.log('\n   📋 PROMPT:')
    console.log('   ' + '-'.repeat(40))
    console.log('   ' + trace.prompt.split('\n').join('\n   '))
    console.log('\n   📊 RESPONSE:')
    console.log('   ' + '-'.repeat(40))
    console.log('   ' + JSON.stringify(trace.response, null, 4).split('\n').join('\n   '))
    console.log('\n' + '='.repeat(60))
  })

  // Display execution summary
  console.log('\n📈 EXECUTION SUMMARY')
  console.log(`   Total Workers: ${mockClient.traces.length}`)
  console.log(`   Execution Order: ${mockClient.traces.map(t => t.workerName).join(' → ')}`)
  console.log(`   Total Prompt Characters: ${mockClient.traces.reduce((sum, t) => sum + t.prompt.length, 0)}`)
  console.log(`   Average Prompt Length: ${Math.round(mockClient.traces.reduce((sum, t) => sum + t.prompt.length, 0) / mockClient.traces.length)} characters`)

  // Display context flow analysis
  console.log('\n🔄 CONTEXT FLOW ANALYSIS')
  mockClient.traces.forEach((trace, index) => {
    const hasUserMessage = trace.prompt.includes(userMessage)
    const hasContextData = trace.prompt.includes('Context analysis:') || trace.prompt.includes('Context:')
    const hasRequirements = trace.prompt.includes('Requirements:')
    const hasProblem = trace.prompt.includes('Problem:')
    
    console.log(`   ${index + 1}. ${trace.workerName}:`)
    console.log(`      ✓ User Message: ${hasUserMessage}`)
    console.log(`      ${hasContextData ? '✓' : '✗'} Context Data: ${hasContextData}`)
    console.log(`      ${hasRequirements ? '✓' : '✗'} Requirements: ${hasRequirements}`)
    console.log(`      ${hasProblem ? '✓' : '✗'} Problem Statement: ${hasProblem}`)
  })

  console.log('\n🎯 FINAL RESULT:')
  console.log(JSON.stringify(result, null, 2))

  console.log('\n✨ Demo completed successfully!')
}

// Only run if this file is executed directly
if (require.main === module) {
  runPromptTracingDemo().catch(console.error)
}

export { runPromptTracingDemo }