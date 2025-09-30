/**
 * Test Server Factory
 * 
 * Creates a test HTTP server that mimics the behavior of the actual server
 * but with controlled mocking for testing purposes.
 */

import * as http from 'http'
import { PRDOrchestratorAgent } from '../prd-orchestrator-agent'
import { 
  HTTP_STATUS, 
  ERROR_MESSAGES, 
  ALL_SECTION_NAMES,
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  CURRENT_PRD_VERSION
} from '../constants'
import { validateAgentSettings, safeParseJSON } from '../utilities'

export const createTestServer = (): http.Server => {
  // Default settings for testing
  const defaultSettings = {
    apiKey: process.env.OPENROUTER_API_KEY || 'test-key',
    model: process.env.PRD_AGENT_MODEL || 'anthropic/claude-3-5-sonnet',
    temperature: parseFloat(process.env.PRD_AGENT_TEMPERATURE || DEFAULT_TEMPERATURE.toString()),
    maxTokens: parseInt(process.env.PRD_AGENT_MAX_TOKENS || DEFAULT_MAX_TOKENS.toString())
  }

  const createAgent = async (requestSettings?: any) => {
    const effectiveSettings = validateAgentSettings(requestSettings, defaultSettings)
    return new PRDOrchestratorAgent(effectiveSettings)
  }

  const parseJsonBody = (req: http.IncomingMessage): Promise<any> => {
    return new Promise((resolve) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        resolve(safeParseJSON(body, {}))
      })
    })
  }

  const server = http.createServer(async (req, res) => {
    const url = req.url || ''
    const method = req.method || 'GET'
    
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    
    // Handle preflight requests
    if (method === 'OPTIONS') {
      res.statusCode = HTTP_STATUS.OK
      res.end()
      return
    }

    // Health check
    if (method === 'GET' && url === '/health') {
      res.statusCode = HTTP_STATUS.OK
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ 
        status: 'ok',
        defaultSettings: {
          model: defaultSettings.model,
          temperature: defaultSettings.temperature,
          maxTokens: defaultSettings.maxTokens
        },
        agentInfo: {
          name: PRDOrchestratorAgent.agentName,
          description: PRDOrchestratorAgent.agentDescription,
          requiredCapabilities: PRDOrchestratorAgent.requiredCapabilities,
          defaultModel: PRDOrchestratorAgent.defaultModel
        }
      }))
      return
    }

    // Create PRD
    if (method === 'POST' && url === '/prd') {
      const body = await parseJsonBody(req)
      const message = body?.message
      const settings = body?.settings
      const contextPayload = body?.contextPayload
      const existingPRD = body?.existingPRD
      
      if (!message) {
        res.statusCode = HTTP_STATUS.BAD_REQUEST
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: ERROR_MESSAGES.MISSING_MESSAGE }))
        return
      }
      
      try {
        const agent = await createAgent(settings)
        
        const result = await (agent as any).generateSections({
          message,
          context: {
            contextPayload,
            existingPRD,
            conversationHistory: body?.conversationHistory
          },
          settings
        })
        
        res.statusCode = HTTP_STATUS.OK
        res.setHeader('Content-Type', 'application/json')
        
        // Check if clarification is needed
        if (!result.validation.is_valid && result.validation.issues.includes('Clarification needed')) {
          res.end(JSON.stringify({
            needsClarification: true,
            confidence: result.metadata.overall_confidence,
            questions: result.validation.warnings
          }))
        } else {
          // Return assembled PRD
          const prd = {
            problemStatement: '',
            solutionOverview: result.sections.solution?.solutionOverview || '',
            targetUsers: result.sections.targetUsers?.targetUsers || [],
            goals: result.sections.keyFeatures?.keyFeatures || [],
            successMetrics: result.sections.successMetrics?.successMetrics || [],
            constraints: result.sections.constraints?.constraints || [],
            assumptions: result.sections.constraints?.assumptions || [],
            sections: result.sections,
            metadata: {
              version: CURRENT_PRD_VERSION,
              lastUpdated: new Date().toISOString(),
              generatedBy: 'PRD Orchestrator Agent',
              sections_generated: result.metadata.sections_updated,
              confidence_assessments: result.metadata.confidence_assessments,
              overall_confidence: result.metadata.overall_confidence
            }
          }
          
          res.end(JSON.stringify({ prd }))
        }
      } catch (e: any) {
        res.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: String(e?.message || e) }))
      }
      return
    }

    // Edit PRD
    if (method === 'POST' && url === '/prd/edit') {
      const body = await parseJsonBody(req)
      const message = body?.message
      const existingPRD = body?.existingPRD
      const settings = body?.settings
      const contextPayload = body?.contextPayload
      
      if (!message || !existingPRD) {
        res.statusCode = HTTP_STATUS.BAD_REQUEST
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: ERROR_MESSAGES.INVALID_EXISTING_PRD }))
        return
      }
      
      try {
        const agent = await createAgent(settings)
        
        const result = await (agent as any).chat(message, {
          operation: 'edit',
          existingPRD,
          contextPayload
        })
        
        res.statusCode = HTTP_STATUS.OK
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result))
      } catch (e: any) {
        res.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: String(e?.message || e) }))
      }
      return
    }

    // Generate sections
    if (method === 'POST' && url === '/prd/sections') {
      const body = await parseJsonBody(req)
      const message = body?.message
      const settings = body?.settings
      const contextPayload = body?.contextPayload
      const existingPRD = body?.existingPRD
      const targetSections = body?.targetSections
      
      if (!message) {
        res.statusCode = HTTP_STATUS.BAD_REQUEST
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: ERROR_MESSAGES.MISSING_MESSAGE }))
        return
      }
      
      try {
        const agent = await createAgent(settings)
        
        const result = await (agent as any).generateSections({
          message,
          context: {
            contextPayload,
            existingPRD,
            conversationHistory: body?.conversationHistory
          },
          settings,
          targetSections
        })
        
        res.statusCode = HTTP_STATUS.OK
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(result))
      } catch (e: any) {
        res.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: String(e?.message || e) }))
      }
      return
    }

    // Update specific section
    if (method === 'POST' && url.startsWith('/prd/section/')) {
      const sectionName = url.split('/prd/section/')[1]
      const validSections = ALL_SECTION_NAMES
      
      if (!validSections.includes(sectionName as any)) {
        res.statusCode = HTTP_STATUS.BAD_REQUEST
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: `Invalid section name. Valid sections: ${validSections.join(', ')}` }))
        return
      }
      
      const body = await parseJsonBody(req)
      const message = body?.message
      const settings = body?.settings
      const contextPayload = body?.contextPayload
      const existingPRD = body?.existingPRD
      
      if (!message) {
        res.statusCode = HTTP_STATUS.BAD_REQUEST
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: ERROR_MESSAGES.MISSING_MESSAGE }))
        return
      }
      
      try {
        const agent = await createAgent(settings)
        
        const result = await (agent as any).generateSections({
          message,
          context: {
            contextPayload,
            existingPRD,
            conversationHistory: body?.conversationHistory
          },
          settings,
          targetSections: [sectionName]
        })
        
        res.statusCode = HTTP_STATUS.OK
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({
          section: sectionName,
          content: result.sections[sectionName],
          metadata: result.metadata,
          validation: result.validation
        }))
      } catch (e: any) {
        res.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: String(e?.message || e) }))
      }
      return
    }

    // 404 for unhandled routes
    res.statusCode = HTTP_STATUS.NOT_FOUND
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Not found' }))
  })

  return server
}