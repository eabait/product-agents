// Lightweight HTTP API to expose PRD generation/edit via backend (no frontend LLMS prompts)
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { PRDOrchestratorAgent } from './index'

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
  temperature: parseFloat(process.env.PRD_AGENT_TEMPERATURE || '0.3'),
  maxTokens: parseInt(process.env.PRD_AGENT_MAX_TOKENS || '8000')
}

// Helper function to create agent with merged settings
const createAgent = async (requestSettings?: any) => {
  const effectiveSettings = {
    ...defaultSettings,
    ...(requestSettings || {}),
    // Use request API key if provided, otherwise fall back to environment
    apiKey: requestSettings?.apiKey || defaultSettings.apiKey
  }
  
  // Validate critical settings
  if (!effectiveSettings.apiKey) {
    throw new Error('No API key configured. Please set OPENROUTER_API_KEY environment variable or provide apiKey in settings.')
  }
  
  if (!effectiveSettings.model) {
    throw new Error('No model specified. Please provide a valid model in settings.')
  }
  
  // Validate numeric settings
  if (typeof effectiveSettings.temperature !== 'number' || effectiveSettings.temperature < 0 || effectiveSettings.temperature > 2) {
    console.warn(`Invalid temperature ${effectiveSettings.temperature}, using default 0.3`)
    effectiveSettings.temperature = 0.3
  }
  
  if (typeof effectiveSettings.maxTokens !== 'number' || effectiveSettings.maxTokens < 1) {
    console.warn(`Invalid maxTokens ${effectiveSettings.maxTokens}, using default 4000`)
    effectiveSettings.maxTokens = 4000
  }
  
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
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        resolve({})
      }
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
    res.statusCode = 200
    res.end()
    return
  }
  
  console.log(`${method} ${url} - Request received`)

  // Health check
  if (method === 'GET' && url === '/health') {
    res.statusCode = 200
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
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Missing message' }))
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
      
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      
      // Check if clarification is needed
      if (!result.validation.is_valid && result.validation.issues.includes('Clarification needed')) {
        res.end(JSON.stringify({
          needsClarification: true,
          confidence: result.metadata.total_confidence * 100,
          questions: result.validation.warnings
        }))
      } else {
        // Return assembled PRD
        const prd = {
          // Legacy format for compatibility
          problemStatement: result.sections.problemStatement?.problemStatement,
          solutionOverview: result.sections.context?.businessContext,
          targetUsers: result.sections.problemStatement?.targetUsers?.map((u: any) => u.persona) || [],
          goals: result.sections.context?.requirements?.epics?.map((epic: any) => epic.title) || [],
          successMetrics: result.sections.metrics?.successMetrics?.map((m: any) => ({
            metric: m.metric,
            target: m.target,
            timeline: m.timeline
          })) || [],
          constraints: result.sections.context?.constraints || [],
          assumptions: result.sections.assumptions?.assumptions?.map((a: any) => a.assumption) || [],
          // New detailed sections
          sections: result.sections,
          metadata: {
            version: '2.0',
            lastUpdated: new Date().toISOString(),
            generatedBy: 'PRD Orchestrator Agent',
            sections_generated: result.metadata.sections_updated,
            confidence_scores: result.metadata.confidence_scores
          }
        }
        
        res.end(JSON.stringify({ prd }))
      }
    } catch (e: any) {
      console.error('PRD creation error:', e)
      res.statusCode = 500
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
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Missing message or existingPRD' }))
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
      
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (e: any) {
      console.error('PRD edit error:', e)
      res.statusCode = 500
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
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Missing message' }))
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
      
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (e: any) {
      console.error('Section generation error:', e)
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(e?.message || e) }))
    }
    return
  }

  // Update specific section
  if (method === 'POST' && url.startsWith('/prd/section/')) {
    const sectionName = url.split('/prd/section/')[1]
    const validSections = ['context', 'problemStatement', 'assumptions', 'metrics']
    
    if (!validSections.includes(sectionName)) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: `Invalid section name. Valid sections: ${validSections.join(', ')}` }))
      return
    }
    
    const body = await parseJsonBody(req)
    const message = body?.message
    const settings = body?.settings
    const contextPayload = body?.contextPayload
    const existingPRD = body?.existingPRD
    
    if (!message) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Missing message' }))
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
      
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        section: sectionName,
        content: result.sections[sectionName],
        metadata: result.metadata,
        validation: result.validation
      }))
    } catch (e: any) {
      console.error(`Section ${sectionName} generation error:`, e)
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(e?.message || e) }))
    }
    return
  }

  console.log(`404 - Unhandled request: ${method} ${url}`)
  res.statusCode = 404
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(port, host, () => {
  console.log(`PRD HTTP API listening at http://${host}:${port}`)
})

export {}
