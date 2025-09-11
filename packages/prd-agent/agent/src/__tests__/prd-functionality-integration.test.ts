/**
 * Integration Test for PRD Generation and Editing
 * 
 * This test proves that the PRD functionality is working correctly
 * by making actual HTTP requests to the local server.
 */

// Using built-in fetch available in Node.js 18+

// Configuration
const SERVER_URL = 'http://localhost:3001'
const TEST_TIMEOUT = 30000

describe.skip('PRD Functionality Integration Tests', () => {
  beforeAll(async () => {
    // Check if server is running
    try {
      const response = await fetch(`${SERVER_URL}/health`)
      if (!response.ok) {
        throw new Error(`Server not responding: ${response.status}`)
      }
      console.log('✓ Server is running and healthy')
    } catch (error) {
      throw new Error(`Cannot connect to server at ${SERVER_URL}. Please ensure the server is running.`)
    }
  }, TEST_TIMEOUT)

  describe('Fresh PRD Generation', () => {
    test('should generate a complete PRD with all 5 sections', async () => {
      const requestPayload = {
        message: 'Create a PRD for a mobile note-taking app for students',
        settings: {
          model: 'anthropic/claude-3-5-sonnet',
          temperature: 0.3,
          maxTokens: 8000
        }
      }

      const response = await fetch(`${SERVER_URL}/prd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      })

      expect(response.ok).toBe(true)
      
      const data = await response.json() as any
      expect(data).toHaveProperty('prd')
      
      const prd = data.prd

      // Verify the PRD has the expected structure
      expect(prd).toHaveProperty('sections')
      expect(prd).toHaveProperty('metadata')

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

      // Verify success metrics have proper structure
      prd.sections.successMetrics.successMetrics.forEach((metric: any) => {
        expect(metric).toHaveProperty('metric')
        expect(metric).toHaveProperty('target')
        expect(metric).toHaveProperty('timeline')
        expect(typeof metric.metric).toBe('string')
        expect(typeof metric.target).toBe('string')
        expect(typeof metric.timeline).toBe('string')
      })

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
      expect(prd.metadata).toHaveProperty('confidence_scores')
      expect(typeof prd.metadata.confidence_scores).toBe('object')

      // Verify legacy compatibility fields are populated
      expect(typeof prd.solutionOverview).toBe('string')
      expect(prd.solutionOverview.length).toBeGreaterThan(0)
      expect(Array.isArray(prd.targetUsers)).toBe(true)
      expect(prd.targetUsers.length).toBeGreaterThan(0)
      expect(Array.isArray(prd.goals)).toBe(true)
      expect(prd.goals.length).toBeGreaterThan(0)
      expect(Array.isArray(prd.successMetrics)).toBe(true)
      expect(prd.successMetrics.length).toBeGreaterThan(0)
      expect(Array.isArray(prd.constraints)).toBe(true)
      expect(Array.isArray(prd.assumptions)).toBe(true)

      console.log('✓ Fresh PRD generation test passed')
      console.log(`✓ Generated PRD with ${prd.metadata.sections_generated.length} sections`)
      console.log(`✓ Solution overview: "${prd.solutionOverview.substring(0, 100)}..."`)
    }, TEST_TIMEOUT)

    test('should handle different types of product requests', async () => {
      const requestPayload = {
        message: 'Create a PRD for an e-commerce platform for small businesses',
        settings: {
          model: 'anthropic/claude-3-5-sonnet',
          temperature: 0.4,
          maxTokens: 6000
        }
      }

      const response = await fetch(`${SERVER_URL}/prd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      })

      expect(response.ok).toBe(true)
      
      const data = await response.json() as any
      expect(data).toHaveProperty('prd')
      
      const prd = data.prd

      // Basic structure validation
      expect(prd).toHaveProperty('sections')
      expect(prd).toHaveProperty('metadata')
      expect(Object.keys(prd.sections)).toHaveLength(5)

      console.log('✓ Different product type test passed')
    }, TEST_TIMEOUT)
  })

  describe('PRD Editing', () => {
    test('should successfully edit an existing PRD without crashing', async () => {
      const existingPRD = {
        solutionOverview: 'TaskFlow is a mobile task management app designed for small teams',
        targetUsers: ['Small team leaders', 'Project managers', 'Remote workers'],
        goals: ['Task management', 'Team collaboration', 'Progress tracking'],
        successMetrics: [
          { metric: 'User adoption', target: '80%', timeline: '3 months' },
          { metric: 'Task completion rate', target: '90%', timeline: '2 months' }
        ],
        constraints: ['Must work offline', 'Limited budget'],
        assumptions: ['Users have smartphones', 'Teams use digital tools']
      }

      const requestPayload = {
        message: 'Add support for voice notes and audio recordings to the app',
        settings: {
          model: 'anthropic/claude-3-5-sonnet',
          temperature: 0.3,
          maxTokens: 8000
        },
        existingPRD
      }

      const response = await fetch(`${SERVER_URL}/prd/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      })

      expect(response.ok).toBe(true)
      
      const editedPRD = await response.json() as any

      // Should return a PRD structure without crashing
      expect(editedPRD).toBeDefined()
      expect(editedPRD).toHaveProperty('sections')
      expect(editedPRD).toHaveProperty('metadata')

      // Should not be a clarification request
      expect(editedPRD).not.toHaveProperty('needsClarification')

      // Verify the structure is intact
      expect(editedPRD.sections).toBeDefined()
      expect(editedPRD.metadata).toHaveProperty('version', '2.0')
      expect(editedPRD.metadata).toHaveProperty('generatedBy', 'PRD Orchestrator Agent')

      // Verify legacy fields are present
      expect(editedPRD).toHaveProperty('solutionOverview')
      expect(editedPRD).toHaveProperty('targetUsers')
      expect(editedPRD).toHaveProperty('goals')

      console.log('✓ PRD editing test passed - no crashes!')
      console.log(`✓ Edit completed with metadata: ${JSON.stringify(editedPRD.metadata.sections_generated)}`)
    }, TEST_TIMEOUT)

    test('should handle editing with minimal existing PRD data', async () => {
      const minimalPRD = {
        solutionOverview: 'A simple mobile app',
        targetUsers: ['Students'],
        goals: ['Learning']
      }

      const requestPayload = {
        message: 'Expand this into a comprehensive educational platform',
        settings: {
          model: 'anthropic/claude-3-5-sonnet',
          temperature: 0.3,
          maxTokens: 8000
        },
        existingPRD: minimalPRD
      }

      const response = await fetch(`${SERVER_URL}/prd/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload)
      })

      expect(response.ok).toBe(true)
      
      const editedPRD = await response.json() as any

      // Should handle minimal input gracefully
      expect(editedPRD).toBeDefined()
      expect(editedPRD).toHaveProperty('metadata')

      console.log('✓ Minimal PRD editing test passed')
    }, TEST_TIMEOUT)
  })

  describe('Server Health and Performance', () => {
    test('should respond to health checks', async () => {
      const response = await fetch(`${SERVER_URL}/health`)
      expect(response.ok).toBe(true)
      
      const healthData = await response.json() as any
      expect(healthData).toHaveProperty('status', 'ok')
      expect(healthData).toHaveProperty('defaultSettings')
      expect(healthData).toHaveProperty('agentInfo')

      console.log('✓ Server health check passed')
    }, 5000)

    test('should handle concurrent requests', async () => {
      const requests = Array(3).fill(null).map((_, index) => 
        fetch(`${SERVER_URL}/prd`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Create a PRD for app ${index + 1}`,
            settings: {
              model: 'anthropic/claude-3-5-sonnet',
              temperature: 0.3,
              maxTokens: 4000
            }
          })
        })
      )

      const responses = await Promise.all(requests)
      
      // All requests should succeed
      responses.forEach((response, index) => {
        expect(response.ok).toBe(true)
        console.log(`✓ Concurrent request ${index + 1} succeeded`)
      })

      console.log('✓ Concurrent request handling test passed')
    }, TEST_TIMEOUT * 2)
  })

  describe('Error Handling and Resilience', () => {
    test('should handle invalid request gracefully', async () => {
      const invalidPayload = {
        // Missing message field
        settings: {
          model: 'anthropic/claude-3-5-sonnet',
          temperature: 0.3
        }
      }

      const response = await fetch(`${SERVER_URL}/prd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidPayload)
      })

      // Should return an error but not crash the server
      expect(response.status).toBeGreaterThanOrEqual(400)
      
      // Server should still be responsive after error
      const healthResponse = await fetch(`${SERVER_URL}/health`)
      expect(healthResponse.ok).toBe(true)

      console.log('✓ Invalid request handling test passed')
    }, 10000)

    test('should handle malformed JSON gracefully', async () => {
      const response = await fetch(`${SERVER_URL}/prd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"invalid": json malformed'
      })

      // Should return an error but not crash the server
      expect(response.status).toBeGreaterThanOrEqual(400)
      
      // Server should still be responsive after error
      const healthResponse = await fetch(`${SERVER_URL}/health`)
      expect(healthResponse.ok).toBe(true)

      console.log('✓ Malformed JSON handling test passed')
    }, 10000)
  })
})

// Global setup for the test environment
declare global {
  namespace NodeJS {
    interface Global {
      fetch: typeof fetch
    }
  }
}

// Polyfill fetch for older Node versions
if (typeof globalThis.fetch === 'undefined') {
  globalThis.fetch = fetch as any
}