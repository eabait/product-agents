// Lightweight HTTP API to expose PRD generation/edit via backend (no frontend LLMS prompts)
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import { PRDSchema, PRDPatchSchema, applyPatch, PRDPatch, PRDGeneratorAgent } from './index'

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

const apiKey = process.env.OPENROUTER_API_KEY
console.log('OpenRouter API Key configured:', apiKey ? `${apiKey.substring(0, 8)}...` : 'NOT SET')

const agent = new PRDGeneratorAgent({
  apiKey: apiKey,
  model: process.env.PRD_AGENT_MODEL || 'anthropic/claude-3-5-sonnet',
  temperature: parseFloat(process.env.PRD_AGENT_TEMPERATURE || '0.3'),
  maxTokens: parseInt(process.env.PRD_AGENT_MAX_TOKENS || '4000')
})

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

  // Health check
  if (method === 'GET' && url === '/health') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ status: 'ok' }))
    return
  }

  // Create PRD
  if (method === 'POST' && url === '/prd') {
    const body = await parseJsonBody(req)
    const message = body?.message
    if (!message) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Missing message' }))
      return
    }
    try {
      const result = await (agent as any).chat(message)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ prd: result }))
    } catch (e: any) {
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
    if (!message || !existingPRD) {
      res.statusCode = 400
      res.end(JSON.stringify({ error: 'Missing message or existingPRD' }))
      return
    }
    try {
      const result = await (agent as any).chat(message, { operation: 'edit', existingPRD })
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(result))
    } catch (e: any) {
      res.statusCode = 500
      res.end(JSON.stringify({ error: String(e?.message || e) }))
    }
    return
  }

  res.statusCode = 404
  res.end(JSON.stringify({ error: 'Not found' }))
})

server.listen(port, host, () => {
  console.log(`PRD HTTP API listening at http://${host}:${port}`)
})

export {}
