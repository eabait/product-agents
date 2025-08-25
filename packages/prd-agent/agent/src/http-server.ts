// Lightweight HTTP API to expose PRD generation/edit via backend (no frontend LLMS prompts)
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { PRDGeneratorAgent } from './index'

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
  model: process.env.PRD_AGENT_MODEL || PRDGeneratorAgent.defaultModel,
  temperature: parseFloat(process.env.PRD_AGENT_TEMPERATURE || '0.3'),
  maxTokens: parseInt(process.env.PRD_AGENT_MAX_TOKENS || '8000')
}

// Fixed temperature for ChangeWorker (for consistent patch generation)
const changeWorkerTemperature = parseFloat(process.env.PRD_AGENT_CHANGE_WORKER_TEMPERATURE || '0.2')

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
  
  console.log('Creating agent with validated settings:', {
    model: effectiveSettings.model,
    temperature: effectiveSettings.temperature,
    maxTokens: effectiveSettings.maxTokens,
    changeWorkerTemperature: changeWorkerTemperature
  })
  
  // Add changeWorkerTemperature to settings
  const agentSettings = {
    ...effectiveSettings,
    changeWorkerTemperature
  }
  
  return new PRDGeneratorAgent(agentSettings)
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
        name: PRDGeneratorAgent.agentName,
        description: PRDGeneratorAgent.agentDescription,
        requiredCapabilities: PRDGeneratorAgent.requiredCapabilities,
        defaultModel: PRDGeneratorAgent.defaultModel
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
    
    if (!message) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Missing message' }))
      return
    }
    
    try {
      // Create agent with request-specific settings
      const agent = await createAgent(settings)
      
      // Build context object with contextPayload if provided
      const context = contextPayload ? { contextPayload } : undefined
      
      const result = await (agent as any).chat(message, context)
      
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      
      // Check if result is clarification questions
      if (result && typeof result === 'object' && 'needsClarification' in result) {
        res.end(JSON.stringify(result))
      } else {
        res.end(JSON.stringify({ prd: result }))
      }
    } catch (e: any) {
      console.error('PRD creation error:', e)
      res.statusCode = 500
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
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Missing message or existingPRD' }))
      return
    }
    
    try {
      // Create agent with request-specific settings
      const agent = await createAgent(settings)
      
      // Build context object with both edit operation and contextPayload
      const context = { 
        operation: 'edit', 
        existingPRD,
        ...(contextPayload && { contextPayload })
      }
      
      const result = await (agent as any).chat(message, context)
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

  console.log(`404 - Unhandled request: ${method} ${url}`)
  res.statusCode = 404
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(port, host, () => {
  console.log(`PRD HTTP API listening at http://${host}:${port}`)
})

export {}
