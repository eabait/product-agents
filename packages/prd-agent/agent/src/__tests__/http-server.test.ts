/**
 * HTTP Server REST API Tests
 * 
 * This test suite validates the REST API server functionality, HTTP protocol compliance,
 * and proper handling of edge cases for all endpoints.
 */

import * as http from 'http'
import { PassThrough } from 'stream'
import { PRDOrchestratorAgent } from '../prd-orchestrator-agent'
import {
  HTTP_STATUS,
  ERROR_MESSAGES,
  ALL_SECTION_NAMES
} from '../constants'

// Mock the PRDOrchestratorAgent to avoid real AI calls
const mockGenerateSections = jest.fn()
const mockChat = jest.fn()

const mockPRDOrchestratorAgent = jest.fn().mockImplementation(() => ({
  generateSections: mockGenerateSections,
  chat: mockChat
}))

// Add static properties for the mocked class
mockPRDOrchestratorAgent.agentName = 'PRD Generator Agent'
mockPRDOrchestratorAgent.agentDescription = 'Generates Product Requirements Documents'
mockPRDOrchestratorAgent.requiredCapabilities = ['structured_output']
mockPRDOrchestratorAgent.defaultModel = 'anthropic/claude-3-5-sonnet'
mockPRDOrchestratorAgent.getMetadata = jest.fn(() => ({
  id: 'prd-orchestrator',
  name: 'PRD Orchestrator Agent',
  description: 'Generates PRDs',
  version: 'test',
  requiredCapabilities: ['structured_output'],
  defaultSettings: {
    model: 'anthropic/claude-3-5-sonnet',
    temperature: 0.3,
    maxTokens: 8000
  },
  subAgents: [
    {
      id: 'context-analyzer',
      name: 'Context Analyzer',
      description: 'Context analyzer',
      kind: 'analyzer',
      requiredCapabilities: ['structured_output'],
      defaultSettings: {
        model: 'anthropic/claude-3-5-sonnet',
        temperature: 0.3,
        maxTokens: 8000
      },
      configurableParameters: []
    }
  ]
}))

jest.mock('../prd-orchestrator-agent', () => ({
  PRDOrchestratorAgent: mockPRDOrchestratorAgent
}))

let activeServer: http.Server | undefined

// Mock the OpenRouterClient
jest.mock('@product-agents/openrouter-client', () => ({
  OpenRouterClient: jest.fn().mockImplementation(() => ({}))
}))

// Mock utilities to avoid validation issues in tests
jest.mock('../utilities', () => ({
  ...jest.requireActual('../utilities'),
  validateAgentSettings: jest.fn((settings, defaults) => ({
    ...defaults,
    ...settings,
    model: (settings?.model || defaults?.model || 'anthropic/claude-3-5-sonnet'),
    apiKey: (settings?.apiKey || defaults?.apiKey || 'test-key'),
    subAgentSettings: settings?.subAgentSettings || defaults?.subAgentSettings
  }))
}))

// Helper to make HTTP requests to the server
const makeRequest = (
  method: string,
  path: string,
  data?: any,
  headers: Record<string, string> = {}
): Promise<{
  statusCode: number
  headers: Record<string, string>
  body: string
}> => {
  return new Promise((resolve, reject) => {
    if (!activeServer) {
      reject(new Error('Test server not initialized'))
      return
    }

    const handler = activeServer.listeners('request')[0] as ((req: http.IncomingMessage, res: http.ServerResponse) => void) | undefined
    if (!handler) {
      reject(new Error('No request handler registered'))
      return
    }

    let bodyBuffer: Buffer
    if (data === undefined || data === null) {
      bodyBuffer = Buffer.alloc(0)
    } else if (Buffer.isBuffer(data)) {
      bodyBuffer = data
    } else if (typeof data === 'string') {
      bodyBuffer = Buffer.from(data)
    } else {
      bodyBuffer = Buffer.from(JSON.stringify(data))
    }
    const requestStream = new PassThrough()
    const req = Object.assign(requestStream, {
      method,
      url: path,
      headers: {
        'content-type': 'application/json',
        ...headers
      }
    }) as unknown as http.IncomingMessage

    const responseHeaders: Record<string, string> = {}
    let statusCode = 200
    const chunks: Buffer[] = []

    const res = {
      get statusCode() {
        return statusCode
      },
      set statusCode(value: number) {
        statusCode = value
      },
      setHeader(name: string, value: string) {
        responseHeaders[name.toLowerCase()] = value
      },
      getHeader(name: string) {
        return responseHeaders[name.toLowerCase()]
      },
      write(chunk: any) {
        if (chunk) {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
          chunks.push(buffer)
        }
        return true
      },
      end(chunk?: any) {
        if (chunk) {
          this.write(chunk)
        }
        resolve({
          statusCode,
          headers: responseHeaders,
          body: Buffer.concat(chunks).toString('utf8')
        })
      },
      writeHead(code: number, head?: Record<string, string>) {
        statusCode = code
        if (head) {
          for (const [key, value] of Object.entries(head)) {
            responseHeaders[key.toLowerCase()] = value
          }
        }
      }
    } as unknown as http.ServerResponse

    requestStream.on('error', reject)

    try {
      const handlerResult = handler(req, res)
      if (handlerResult && typeof (handlerResult as Promise<unknown>).catch === 'function') {
        ;(handlerResult as Promise<unknown>).catch(reject)
      }
      process.nextTick(() => {
        if (bodyBuffer.length > 0) {
          requestStream.write(bodyBuffer)
        }
        requestStream.end()
      })
    } catch (error) {
      reject(error)
    }
  })
}

describe('HTTP Server REST API', () => {
  let server: http.Server

  beforeAll(async () => {
    // Set up environment for testing
    process.env.PRD_AGENT_HTTP_PORT = '3001'
    process.env.PRD_AGENT_HTTP_HOST = '127.0.0.1'
    process.env.OPENROUTER_API_KEY = 'test-key'
    process.env.PRD_AGENT_MODEL = 'anthropic/claude-3-5-sonnet'
    
    // Import and create server without starting it automatically
    jest.resetModules()
    
    // Create a simple test server that mimics the real server behavior
    const { createTestServer } = await import('./test-server-factory.helper')
    server = createTestServer()
    activeServer = server
    
  })

  afterAll(() => {
    if (server) {
      server.removeAllListeners()
    }
    activeServer = undefined
  })

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Setup default mock responses
    mockGenerateSections.mockResolvedValue({
      sections: {
        solution: { solutionOverview: 'Test solution' },
        targetUsers: { targetUsers: ['Test users'] },
        keyFeatures: { keyFeatures: ['Feature 1'] },
        successMetrics: { successMetrics: ['Metric 1'] },
        constraints: { constraints: ['Constraint 1'], assumptions: ['Assumption 1'] }
      },
      metadata: {
        sections_updated: ['solution', 'targetUsers'],
        confidence_assessments: {},
        overall_confidence: { level: 'medium', reasons: [], factors: {} }
      },
      validation: {
        is_valid: true,
        issues: [],
        warnings: []
      }
    })

    mockChat.mockResolvedValue({
      content: JSON.stringify({ updated: true })
    })
  })

  describe('Health Check Endpoint', () => {
    test('GET /health should return server info and agent defaults', async () => {
      const response = await makeRequest('GET', '/health')
      
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      expect(response.headers['content-type']).toBe('application/json')
      
      const data = JSON.parse(response.body)
      expect(data.status).toBe('ok')
      expect(data.defaultSettings).toHaveProperty('model')
      expect(data.defaultSettings).toHaveProperty('temperature')
      expect(data.defaultSettings).toHaveProperty('maxTokens')
      expect(data.defaultSettings).toHaveProperty('subAgentSettings')
      expect(data.agentInfo).toHaveProperty('name')
      expect(data.agentInfo).toHaveProperty('description')
      expect(data.agentInfo).toHaveProperty('requiredCapabilities')
      expect(data.agentInfo).toHaveProperty('defaultModel')
      expect(data.metadata).toBeDefined()
      expect(Array.isArray(data.metadata.subAgents)).toBe(true)
    })
  })

  describe('CORS and Preflight Handling', () => {
    test('should handle OPTIONS preflight requests', async () => {
      const response = await makeRequest('OPTIONS', '/prd')
      
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      expect(response.headers['access-control-allow-origin']).toBe('*')
      expect(response.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS')
      expect(response.headers['access-control-allow-headers']).toBe('Content-Type')
    })

    test('should include CORS headers in all responses', async () => {
      const response = await makeRequest('GET', '/health')
      
      expect(response.headers['access-control-allow-origin']).toBe('*')
      expect(response.headers['access-control-allow-methods']).toBe('GET, POST, OPTIONS')
      expect(response.headers['access-control-allow-headers']).toBe('Content-Type')
    })
  })

  describe('PRD Creation Endpoint', () => {
    test('POST /prd should create new PRD with valid request', async () => {
      const requestBody = {
        message: 'Create a mobile app for students',
        settings: {
          apiKey: 'test-key',
          model: 'anthropic/claude-3-5-sonnet',
          temperature: 0.3,
          maxTokens: 8000
        }
      }

      const response = await makeRequest('POST', '/prd', requestBody)

      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      expect(response.headers['content-type']).toBe('application/json')

      const data = JSON.parse(response.body)
      expect(data.prd).toHaveProperty('solutionOverview')
      expect(data.prd).toHaveProperty('targetUsers')
      expect(data.prd).toHaveProperty('metadata')
      expect(data.prd.metadata).toHaveProperty('version')
      expect(data.prd.metadata).toHaveProperty('lastUpdated')

      expect(mockGenerateSections).toHaveBeenCalledWith(
        expect.objectContaining({
          message: requestBody.message,
          context: expect.any(Object),
          settings: requestBody.settings
        })
      )
    })

    test('POST /prd should forward sub-agent overrides to orchestrator', async () => {
      const requestBody = {
        message: 'Draft a PRD',
        settings: {
          apiKey: 'test-key',
          model: 'anthropic/claude-3-5-sonnet',
          temperature: 0.3,
          maxTokens: 8000,
          subAgentSettings: {
            'target-users-writer': {
              model: 'openai/gpt-4o-mini',
              temperature: 0.6,
              maxTokens: 6000
            }
          }
        }
      }

      await makeRequest('POST', '/prd', requestBody)

      expect(mockPRDOrchestratorAgent).toHaveBeenCalledTimes(1)
      const constructorArgs = mockPRDOrchestratorAgent.mock.calls[0]?.[0]
      expect(constructorArgs?.subAgentSettings?.['target-users-writer']).toMatchObject({
        model: 'openai/gpt-4o-mini',
        temperature: 0.6,
        maxTokens: 6000
      })
    })

    test('POST /prd should return 400 for missing message', async () => {
      const requestBody = {
        settings: { apiKey: 'test-key', model: 'test-model' }
      }

      const response = await makeRequest('POST', '/prd', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
      
      const data = JSON.parse(response.body)
      expect(data.error).toBe(ERROR_MESSAGES.MISSING_MESSAGE)
    })

    test('POST /prd should handle clarification needed scenario', async () => {
      mockGenerateSections.mockResolvedValue({
        sections: {},
        metadata: {
          overall_confidence: { level: 'low', reasons: ['needs more info'], factors: {} }
        },
        validation: {
          is_valid: false,
          issues: ['Clarification needed'],
          warnings: ['What is the target platform?', 'What is the budget?']
        }
      })

      const requestBody = {
        message: 'Create an app',
        settings: { apiKey: 'test-key', model: 'test-model' }
      }

      const response = await makeRequest('POST', '/prd', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      
      const data = JSON.parse(response.body)
      expect(data.needsClarification).toBe(true)
      expect(data.questions).toEqual(['What is the target platform?', 'What is the budget?'])
      expect(data.confidence).toHaveProperty('level', 'low')
    })

    test('POST /prd should handle server errors gracefully', async () => {
      mockGenerateSections.mockRejectedValue(new Error('AI service unavailable'))

      const requestBody = {
        message: 'Create an app',
        settings: { apiKey: 'test-key', model: 'test-model' }
      }

      const response = await makeRequest('POST', '/prd', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.INTERNAL_SERVER_ERROR)
      
      const data = JSON.parse(response.body)
      expect(data.error).toBe('AI service unavailable')
    })
  })

  describe('PRD Edit Endpoint', () => {
    test('POST /prd/edit should edit existing PRD', async () => {
      const requestBody = {
        message: 'Add social features',
        existingPRD: { solution: 'Original solution' },
        settings: { apiKey: 'test-key', model: 'test-model' }
      }

      const response = await makeRequest('POST', '/prd/edit', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      
      expect(mockChat).toHaveBeenCalledWith(
        requestBody.message,
        expect.objectContaining({
          operation: 'edit',
          existingPRD: requestBody.existingPRD
        })
      )
    })

    test('POST /prd/edit should return 400 for missing existingPRD', async () => {
      const requestBody = {
        message: 'Edit this',
        settings: { apiKey: 'test-key', model: 'test-model' }
      }

      const response = await makeRequest('POST', '/prd/edit', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
      
      const data = JSON.parse(response.body)
      expect(data.error).toBe(ERROR_MESSAGES.INVALID_EXISTING_PRD)
    })

    test('POST /prd/edit should return 400 for missing message', async () => {
      const requestBody = {
        existingPRD: { solution: 'Original' },
        settings: { apiKey: 'test-key', model: 'test-model' }
      }

      const response = await makeRequest('POST', '/prd/edit', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
      
      const data = JSON.parse(response.body)
      expect(data.error).toBe(ERROR_MESSAGES.INVALID_EXISTING_PRD)
    })
  })

  describe('Section Generation Endpoint', () => {
    test('POST /prd/sections should generate specific sections', async () => {
      const requestBody = {
        message: 'Focus on user personas',
        targetSections: ['targetUsers'],
        settings: { apiKey: 'test-key', model: 'test-model' }
      }

      const response = await makeRequest('POST', '/prd/sections', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      
      expect(mockGenerateSections).toHaveBeenCalledWith(
        expect.objectContaining({
          message: requestBody.message,
          targetSections: ['targetUsers']
        })
      )
    })

    test('POST /prd/sections should return 400 for missing message', async () => {
      const requestBody = {
        targetSections: ['solution'],
        settings: { apiKey: 'test-key', model: 'test-model' }
      }

      const response = await makeRequest('POST', '/prd/sections', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
      
      const data = JSON.parse(response.body)
      expect(data.error).toBe(ERROR_MESSAGES.MISSING_MESSAGE)
    })
  })

  describe('Individual Section Update Endpoint', () => {
    test('POST /prd/section/{sectionName} should update specific section', async () => {
      const sectionName = 'targetUsers'
      const requestBody = {
        message: 'Update target users',
        settings: { apiKey: 'test-key', model: 'test-model' }
      }

      const response = await makeRequest('POST', `/prd/section/${sectionName}`, requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      
      const data = JSON.parse(response.body)
      expect(data.section).toBe(sectionName)
      expect(data.content).toBeDefined()
      expect(data.metadata).toBeDefined()
      expect(data.validation).toBeDefined()
      
      expect(mockGenerateSections).toHaveBeenCalledWith(
        expect.objectContaining({
          targetSections: [sectionName]
        })
      )
    })

    test('POST /prd/section/invalid should return 400 for invalid section name', async () => {
      const requestBody = {
        message: 'Update section',
        settings: { apiKey: 'test-key', model: 'test-model' }
      }

      const response = await makeRequest('POST', '/prd/section/invalidSection', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
      
      const data = JSON.parse(response.body)
      expect(data.error).toContain('Invalid section name')
      expect(data.error).toContain(ALL_SECTION_NAMES.join(', '))
    })

    test('POST /prd/section/solution should return 400 for missing message', async () => {
      const requestBody = {
        settings: { apiKey: 'test-key', model: 'test-model' }
      }

      const response = await makeRequest('POST', '/prd/section/solution', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
      
      const data = JSON.parse(response.body)
      expect(data.error).toBe(ERROR_MESSAGES.MISSING_MESSAGE)
    })
  })

  describe('Error Handling and Edge Cases', () => {
    test('should return 404 for unhandled routes', async () => {
      const response = await makeRequest('GET', '/nonexistent')
      
      expect(response.statusCode).toBe(HTTP_STATUS.NOT_FOUND)
      
      const data = JSON.parse(response.body)
      expect(data.error).toBe('Not found')
    })

    test('should handle malformed JSON requests', async () => {
      const response = await makeRequest('POST', '/prd', '{"invalid": json}')
      
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
      
      const data = JSON.parse(response.body)
      expect(data.error).toBe(ERROR_MESSAGES.MISSING_MESSAGE)
    })

    test('should handle empty request body', async () => {
      const response = await makeRequest('POST', '/prd', null)
      
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
      
      const data = JSON.parse(response.body)
      expect(data.error).toBe(ERROR_MESSAGES.MISSING_MESSAGE)
    })

    test('should handle very large payloads gracefully', async () => {
      const largeMessage = 'x'.repeat(100000) // 100KB message
      const requestBody = {
        message: largeMessage,
        settings: { apiKey: 'test-key', model: 'test-model' }
      }

      const response = await makeRequest('POST', '/prd', requestBody)
      
      // Should still process the request (assuming no size limit configured)
      expect([HTTP_STATUS.OK, HTTP_STATUS.INTERNAL_SERVER_ERROR]).toContain(response.statusCode)
    })
  })

  describe('Request Validation and Settings Handling', () => {
    test('should merge request settings with defaults', async () => {
      const requestBody = {
        message: 'Create an app',
        settings: {
          temperature: 0.7, // Override default
          customField: 'custom-value'
        }
      }

      const response = await makeRequest('POST', '/prd', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      expect(mockPRDOrchestratorAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.7
        })
      )
    })

    test('should handle requests without settings', async () => {
      const requestBody = {
        message: 'Create an app'
      }

      const response = await makeRequest('POST', '/prd', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      expect(mockPRDOrchestratorAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'test-key' // From environment
        })
      )
    })

    test('should pass context payload through to agent', async () => {
      const requestBody = {
        message: 'Create an app',
        contextPayload: { userType: 'premium', industry: 'fintech' },
        existingPRD: { solution: 'existing' },
        conversationHistory: [{ role: 'user', content: 'previous message' }]
      }

      const response = await makeRequest('POST', '/prd', requestBody)
      
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      expect(mockGenerateSections).toHaveBeenCalledWith(
        expect.objectContaining({
          context: {
            contextPayload: requestBody.contextPayload,
            existingPRD: requestBody.existingPRD,
            conversationHistory: requestBody.conversationHistory
          }
        })
      )
    })
  })

  describe('Content-Type and Response Format', () => {
    test('all JSON endpoints should return application/json content type', async () => {
      const endpoints = [
        { method: 'GET', path: '/health' },
        { method: 'POST', path: '/prd', data: { message: 'test' } }
      ]

      for (const endpoint of endpoints) {
        const response = await makeRequest(endpoint.method, endpoint.path, endpoint.data)
        expect(response.headers['content-type']).toBe('application/json')
      }
    })

    test('should return valid JSON for all successful responses', async () => {
      const response = await makeRequest('GET', '/health')
      
      expect(response.statusCode).toBe(HTTP_STATUS.OK)
      expect(() => JSON.parse(response.body)).not.toThrow()
    })

    test('should return valid JSON for all error responses', async () => {
      const response = await makeRequest('POST', '/prd', {}) // Missing message
      
      expect(response.statusCode).toBe(HTTP_STATUS.BAD_REQUEST)
      expect(() => JSON.parse(response.body)).not.toThrow()
      
      const data = JSON.parse(response.body)
      expect(data).toHaveProperty('error')
    })
  })
})
