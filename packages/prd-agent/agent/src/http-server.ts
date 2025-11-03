// Lightweight HTTP API to expose PRD generation/edit via backend (no frontend LLMS prompts)
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { PRDOrchestratorAgent, type ProgressEvent } from './index'
import {
  DEFAULT_TEMPERATURE,
  DEFAULT_MAX_TOKENS,
  FALLBACK_MAX_TOKENS,
  CURRENT_PRD_VERSION,
  ALL_SECTION_NAMES,
  HTTP_STATUS,
  ERROR_MESSAGES
} from '@product-agents/prd-shared'
import {
  validateAgentSettings,
  buildPRDMetadata,
  createErrorResponse,
  createSuccessResponse,
  safeParseJSON
} from './utilities'
import { getDefaultSubAgentSettings } from './agent-metadata'

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
const baseDefaultSettings = {
  apiKey: defaultApiKey,
  model: process.env.PRD_AGENT_MODEL || PRDOrchestratorAgent.defaultModel,
  temperature: parseFloat(process.env.PRD_AGENT_TEMPERATURE || DEFAULT_TEMPERATURE.toString()),
  maxTokens: parseInt(process.env.PRD_AGENT_MAX_TOKENS || DEFAULT_MAX_TOKENS.toString()),
  subAgentSettings: getDefaultSubAgentSettings()
}

const cloneDefaultSettings = () => ({
  ...baseDefaultSettings,
  subAgentSettings: Object.entries(baseDefaultSettings.subAgentSettings || {}).reduce<Record<string, any>>(
    (acc, [key, value]) => {
      acc[key] = { ...value }
      return acc
    },
    {}
  )
})

// Helper function to create agent with merged settings
const createAgent = async (requestSettings?: any) => {
  const effectiveSettings = validateAgentSettings(requestSettings, cloneDefaultSettings())
  
  const subAgentEntries = Object.entries(effectiveSettings.subAgentSettings || {}) as Array<[
    string,
    {
      model?: string
      temperature?: number
      maxTokens?: number
    }
  ]>

  console.log('Creating orchestrator agent with validated settings:', {
    model: effectiveSettings.model,
    temperature: effectiveSettings.temperature,
    maxTokens: effectiveSettings.maxTokens,
    subAgentOverrides: subAgentEntries.reduce<string[]>((acc, [key, value]) => {
      const hasOverride = (value.model && value.model !== effectiveSettings.model) ||
        (typeof value.temperature === 'number' && value.temperature !== effectiveSettings.temperature) ||
        (typeof value.maxTokens === 'number' && value.maxTokens !== effectiveSettings.maxTokens)

      if (hasOverride) {
        acc.push(key)
      }
      return acc
    }, [])
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

const logEditedPrd = (label: string, payload: any) => {
  try {
    const snapshot = JSON.stringify(payload, null, 2)
    console.log(`\n===== ${label} =====\n${snapshot}\n======================\n`)
  } catch (error) {
    console.warn(`Failed to serialize PRD payload for ${label}:`, error)
  }
}

const logSectionUpdates = (label: string, payload: any) => {
  if (!payload || typeof payload !== 'object') {
    console.log(`\n===== ${label}: No section data =====`)
    return
  }

  const sections = payload.sections || {}
  const metadata = payload.metadata || {}
  let affectedSections: string[] = Array.isArray(metadata.sections_updated)
    ? metadata.sections_updated
    : Array.isArray(payload.affectedSections)
      ? payload.affectedSections
      : []

  if ((!affectedSections || affectedSections.length === 0) && sections && typeof sections === 'object') {
    affectedSections = Object.keys(sections)
  }

  if (affectedSections.length === 0) {
    console.log(`\n===== ${label}: No sections reported as updated =====`)
    return
  }

  console.log(`\n===== ${label} (Sections: ${affectedSections.join(', ')}) =====`)

  for (const sectionName of affectedSections) {
    const sectionContent = sections[sectionName]
    try {
      const snapshot = JSON.stringify(sectionContent ?? null, null, 2)
      console.log(`\n--- Section: ${sectionName} ---\n${snapshot}`)
    } catch (error) {
      console.warn(`Failed to serialize section "${sectionName}" for ${label}:`, error)
    }
  }

  console.log('\n======================\n')
}

// SSE (Server-Sent Events) helper functions for streaming
const setupSSEHeaders = (res: http.ServerResponse): void => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Cache-Control')
}

const sendSSEEvent = (res: http.ServerResponse, eventType: string, data: any): void => {
  const jsonData = typeof data === 'string' ? data : JSON.stringify(data)
  res.write(`event: ${eventType}\n`)
  res.write(`data: ${jsonData}\n\n`)
}

const sendSSEClose = (res: http.ServerResponse): void => {
  res.write(`event: close\n`)
  res.write(`data: {}\n\n`)
  res.end()
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
    const defaults = cloneDefaultSettings()
    res.end(JSON.stringify({ 
      status: 'ok',
      defaultSettings: {
        model: defaults.model,
        temperature: defaults.temperature,
        maxTokens: defaults.maxTokens,
        subAgentSettings: defaults.subAgentSettings
      },
      agentInfo: {
        name: PRDOrchestratorAgent.agentName,
        description: PRDOrchestratorAgent.agentDescription,
        requiredCapabilities: PRDOrchestratorAgent.requiredCapabilities,
        defaultModel: PRDOrchestratorAgent.defaultModel
      },
      metadata: PRDOrchestratorAgent.getMetadata()
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

      logEditedPrd('PRD_EDIT_RESULT', result)
      
      res.statusCode = HTTP_STATUS.OK
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(result))
      logSectionUpdates('PRD_SECTION_RESULT', result)
      logSectionUpdates('PRD_SECTION_RESULT', result)
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
      
      const payload = {
        section: sectionName,
        content: result.sections[sectionName],
        metadata: result.metadata,
        validation: result.validation
      }

      res.statusCode = HTTP_STATUS.OK
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(payload))

      logSectionUpdates('PRD_SINGLE_SECTION_RESULT', {
        sections: { [sectionName]: result.sections[sectionName] },
        metadata: result.metadata
      })
    } catch (e: any) {
      console.error(`Section ${sectionName} generation error:`, e)
      res.statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR
      res.end(JSON.stringify({ error: String(e?.message || e) }))
    }
    return
  }

  // STREAMING ENDPOINTS

  // Stream PRD creation
  if (method === 'POST' && url === '/prd/stream') {
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
      setupSSEHeaders(res)
      res.statusCode = HTTP_STATUS.OK

      const agent = await createAgent(settings)
      
      // Create progress callback to stream events
      const progressCallback = (event: ProgressEvent) => {
        sendSSEEvent(res, 'progress', event)
      }
      
      // Use orchestrator's streaming method
      const result = await (agent as any).generateSectionsWithProgress({
        message,
        context: {
          contextPayload,
          existingPRD,
          conversationHistory: body?.conversationHistory
        },
        settings
      }, progressCallback)
      
      // Send final result
      if (!result.validation.is_valid && result.validation.issues.includes('Clarification needed')) {
        sendSSEEvent(res, 'clarification', {
          needsClarification: true,
          confidence: result.metadata.overall_confidence,
          questions: result.validation.warnings
        })
      } else {
        // Send completed PRD
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
        
        sendSSEEvent(res, 'complete', { prd })
      }
      
      sendSSEClose(res)
    } catch (e: any) {
      console.error('Streaming PRD creation error:', e)
      sendSSEEvent(res, 'error', { error: String(e?.message || e) })
      sendSSEClose(res)
    }
    return
  }

  // Stream PRD editing
  if (method === 'POST' && url === '/prd/edit/stream') {
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
      setupSSEHeaders(res)
      res.statusCode = HTTP_STATUS.OK

      const agent = await createAgent(settings)
      
      // Create progress callback to stream events
      const progressCallback = (event: ProgressEvent) => {
        sendSSEEvent(res, 'progress', event)
      }
      
      // Use orchestrator's streaming edit method
      const result = await (agent as any).chat(message, {
        operation: 'edit',
        existingPRD,
        contextPayload
      })

      logEditedPrd('PRD_EDIT_STREAM_RESULT', result)
      
      sendSSEEvent(res, 'complete', result)
      logSectionUpdates('PRD_EDIT_STREAM_SECTION_UPDATES', result)
      sendSSEClose(res)
    } catch (e: any) {
      console.error('Streaming PRD edit error:', e)
      sendSSEEvent(res, 'error', { error: String(e?.message || e) })
      sendSSEClose(res)
    }
    return
  }

  // Stream section generation
  if (method === 'POST' && url === '/prd/sections/stream') {
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
      setupSSEHeaders(res)
      res.statusCode = HTTP_STATUS.OK

      const agent = await createAgent(settings)
      
      // Create progress callback to stream events
      const progressCallback = (event: ProgressEvent) => {
        sendSSEEvent(res, 'progress', event)
      }
      
      // Use orchestrator's streaming method
      const result = await (agent as any).generateSectionsWithProgress({
        message,
        context: {
          contextPayload,
          existingPRD,
          conversationHistory: body?.conversationHistory
        },
        settings,
        targetSections
      }, progressCallback)
      
      sendSSEEvent(res, 'complete', result)
      sendSSEClose(res)
    } catch (e: any) {
      console.error('Streaming section generation error:', e)
      sendSSEEvent(res, 'error', { error: String(e?.message || e) })
      sendSSEClose(res)
    }
    return
  }

  // Stream individual section update
  if (method === 'POST' && url.startsWith('/prd/section/') && url.endsWith('/stream')) {
    const sectionName = url.split('/prd/section/')[1].replace('/stream', '')
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
      setupSSEHeaders(res)
      res.statusCode = HTTP_STATUS.OK

      const agent = await createAgent(settings)
      
      // Create progress callback to stream events
      const progressCallback = (event: ProgressEvent) => {
        sendSSEEvent(res, 'progress', event)
      }
      
      // Generate only the specified section with streaming
      const result = await (agent as any).generateSectionsWithProgress({
        message,
        context: {
          contextPayload,
          existingPRD,
          conversationHistory: body?.conversationHistory
        },
        settings,
        targetSections: [sectionName]
      }, progressCallback)
      
      const payload = {
        section: sectionName,
        content: result.sections[sectionName],
        metadata: result.metadata,
        validation: result.validation
      }
      sendSSEEvent(res, 'complete', payload)
      logSectionUpdates('PRD_SINGLE_SECTION_STREAM_RESULT', {
        sections: { [sectionName]: result.sections[sectionName] },
        metadata: result.metadata
      })
      
      sendSSEClose(res)
    } catch (e: any) {
      console.error(`Streaming section ${sectionName} generation error:`, e)
      sendSSEEvent(res, 'error', { error: String(e?.message || e) })
      sendSSEClose(res)
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
