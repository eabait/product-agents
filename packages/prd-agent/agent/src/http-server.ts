// Lightweight HTTP API to expose PRD generation/edit via backend (no frontend LLMS prompts)
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { PRDOrchestratorAgent } from './index'
import {
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  FALLBACK_MAX_TOKENS,
  CURRENT_PRD_VERSION,
  ALL_SECTION_NAMES,
  HTTP_STATUS,
  ERROR_MESSAGES
} from './constants'
import {
  validateAgentSettings,
  buildPRDMetadata,
  createErrorResponse,
  createSuccessResponse,
  safeParseJSON
} from './utilities'

// Simple .env file loader
try {
  const envPath = path.join(process.cwd(), '.env')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim()
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = value
        }
      }
    })
  }
} catch (err) {
  console.log('No .env file found or error reading it')
}

const defaultApiKey = process.env.OPENROUTER_API_KEY
console.log('Default OpenRouter API Key configured:', defaultApiKey ? `${defaultApiKey.substring(0, 8)}...` : 'NOT SET')

// Default settings from environment variables
const defaultSettings = {
  apiKey: defaultApiKey,
  model: process.env.PRD_AGENT_MODEL || PRDOrchestratorAgent.defaultModel,
  temperature: parseFloat(process.env.PRD_AGENT_TEMPERATURE || DEFAULT_TEMPERATURE.toString()),
  maxTokens: parseInt(process.env.PRD_AGENT_MAX_TOKENS || DEFAULT_MAX_TOKENS.toString())
}

// Helper function to create agent with merged settings
const createAgent = async (requestSettings?: any) => {
  const effectiveSettings = validateAgentSettings(requestSettings, defaultSettings)
  
  console.log('Creating orchestrator agent with validated settings:', {
    model: effectiveSettings.model,
    temperature: effectiveSettings.temperature,
    maxTokens: effectiveSettings.maxTokens
  })
  
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

const host = process.env.PRD_AGENT_HTTP_HOST || '0.0.0.0'
const port = process.env.PRD_AGENT_HTTP_PORT ? parseInt(process.env.PRD_AGENT_HTTP_PORT) : 3001

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
  
  console.log(`${method} ${url} - Request received`)

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

  // Create PRD (Using orchestrator architecture)
  if (method === 'POST' && url === '/prd') {
    const body = await parseJsonBody(req)
    const message = body?.message
    const settings = body?.settings
    const contextPayload = body?.contextPayload
    const existingPRD = body?.existingPRD
    
    if (!message) {
      res.statusCode = HTTP_STATUS.BAD_REQUEST
      res.end(JSON.stringify({ error: ERROR_MESSAGES.MISSING_MESSAGE }))
      return
    }
    
    try {
      const agent = await createAgent(settings)
      
      // Use orchestrator's generateSections method
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
        // Return assembled PRD with simplified structure
        const prd = {
          // Flattened format for frontend compatibility (simplified 5-section structure)
          problemStatement: '', // Will be derived from solution section if needed
          solutionOverview: result.sections.solution?.solutionOverview || '',
          targetUsers: result.sections.targetUsers?.targetUsers || [],
          goals: result.sections.keyFeatures?.keyFeatures || [],
          successMetrics: result.sections.successMetrics?.successMetrics || [],
          constraints: result.sections.constraints?.constraints || [],
          assumptions: result.sections.constraints?.assumptions || [],
          // New simplified sections
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
      console.error('PRD creation error:', e)
      res.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
      res.end(JSON.stringify({ error: String(e?.message || e) }))
    }
    return
  }

  // Edit PRD (Using orchestrator architecture)
  if (method === 'POST' && url === '/prd/edit') {
    const body = await parseJsonBody(req)
    const message = body?.message
    const existingPRD = body?.existingPRD
    const settings = body?.settings
    const contextPayload = body?.contextPayload
    
    if (!message || !existingPRD) {
      res.statusCode = HTTP_STATUS.BAD_REQUEST
      res.end(JSON.stringify({ error: ERROR_MESSAGES.INVALID_EXISTING_PRD }))
      return
    }
    
    try {
      const agent = await createAgent(settings)
      
      // Use orchestrator's edit handling
      const result = await (agent as any).chat(message, {
        operation: 'edit',
        existingPRD,
        contextPayload
      })
      
      res.statusCode = HTTP_STATUS.OK
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (e: any) {
      console.error('PRD edit error:', e)
      res.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
      res.end(JSON.stringify({ error: String(e?.message || e) }))
    }
    return
  }

  // Generate sections (New orchestrator endpoint)
  if (method === 'POST' && url === '/prd/sections') {
    const body = await parseJsonBody(req)
    const message = body?.message
    const settings = body?.settings
    const contextPayload = body?.contextPayload
    const existingPRD = body?.existingPRD
    const targetSections = body?.targetSections
    
    if (!message) {
      res.statusCode = HTTP_STATUS.BAD_REQUEST
      res.end(JSON.stringify({ error: ERROR_MESSAGES.MISSING_MESSAGE }))
      return
    }
    
    try {
      const agent = await createAgent(settings)
      
      // Use the new section routing method
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
      console.error('Section generation error:', e)
      res.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
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
      res.end(JSON.stringify({ error: ERROR_MESSAGES.MISSING_MESSAGE }))
      return
    }
    
    try {
      const agent = await createAgent(settings)
      
      // Generate only the specified section
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
      console.error(`Section ${sectionName} generation error:`, e)
      res.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
      res.end(JSON.stringify({ error: String(e?.message || e) }))
    }
    return
  }

  console.log(`404 - Unhandled request: ${method} ${url}`)
  res.statusCode = HTTP_STATUS.NOT_FOUND
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(port, host, () => {
  console.log(`PRD HTTP API listening at http://${host}:${port}`)
})

export {}
