## Complete Agent Implementation Plan with Independent Frontends

### Progress Tracker
**Current Phase:** Phase 2 - Agent Implementation  
**Overall Progress:** 35% Complete  
**Last Updated:** 8/8/2025

### 🎉 MILESTONE ACHIEVED: First Agent Complete!
The PRD Generator Agent is now fully functional with:
- ✅ Complete Orchestrator-Workers pattern implementation
- ✅ Working Next.js frontend with chat interface
- ✅ Mock agent for demonstration (ready for real OpenRouter integration)
- ✅ Settings panel with model selection and temperature control
- ✅ Comprehensive PRD generation with all required sections
- ✅ Running successfully at http://localhost:3000

**Demo Features Verified:**
- Chat interface with user/assistant message bubbles
- Processing indicators and loading states
- Suggestion prompts for quick testing
- Settings modal with agent configuration
- Formatted PRD output with markdown structure
- Metadata display (model, confidence scores)

#### Phase 0 - Preparation ✅ COMPLETED
- [x] Choose package manager: npm workspaces with Turborepo
- [x] Initialize package.json at monorepo root with workspaces configuration
- [x] Create turbo.json with build/test pipeline defaults
- [x] Setup .gitignore, and root tsconfig.json

#### Phase 1 - Foundation Setup ✅ COMPLETED
- [x] Create /packages/shared/{ui-components,agent-core,openrouter-client}
- [x] Create /packages/{prd-agent,research-agent,persona-agent,story-mapper-agent,story-generator-agent,story-refiner-agent}
- [x] Inside each agent: create {agent,frontend,mcp-server} workspaces structure
- [x] Setup package.json for each workspace
- [x] Implement UI Components (ChatUI, SettingsPanel)
- [x] Implement agent-core library with abstract Agent base class
- [x] Implement openrouter-client with OpenRouterClient class
- [x] Setup absolute imports with TS path aliases

#### Phase 2 - Agent Implementation (IN PROGRESS)
- [x] PRD Generator Agent - Core logic with Orchestrator-Workers pattern
- [x] PRD Generator Agent - Frontend implementation ✅ COMPLETED
- [ ] Research Agent implementation
- [ ] Persona Agent implementation
- [ ] Story Mapper Agent implementation
- [ ] Story Generator Agent implementation
- [ ] Story Refiner Agent implementation


### Architecture Overview

```
product-agents/                    # Monorepo root
├── packages/
│   ├── shared/
│   │   ├── ui-components/          # Shared React components
│   │   ├── agent-core/             # Base agent classes
│   │   └── openrouter-client/      # OpenRouter AI SDK setup
│   │
│   ├── prd-agent/
│   │   ├── agent/                  # Core agent logic
│   │   ├── frontend/               # Next.js test frontend
│   │   ├── mcp-server/             # MCP server wrapper
│   │   └── package.json
│   │
│   ├── research-agent/
│   │   ├── agent/
│   │   ├── frontend/
│   │   ├── mcp-server/
│   │   └── package.json
│   │
│   ├── persona-agent/
│   │   ├── agent/
│   │   ├── frontend/
│   │   ├── mcp-server/
│   │   └── package.json
│   │
│   ├── story-mapper-agent/
│   │   ├── agent/
│   │   ├── frontend/
│   │   ├── mcp-server/
│   │   └── package.json
│   │
│   ├── story-generator-agent/
│   │   ├── agent/
│   │   ├── frontend/
│   │   ├── mcp-server/
│   │   └── package.json
│   │
│   └── story-refiner-agent/
│       ├── agent/
│       ├── frontend/
│       ├── mcp-server/
│       └── package.json
├── turbo.json                      # Turborepo config
└── package.json
```

## 1. Shared Components Package

### UI Components Library
```typescript
// packages/shared/ui-components/src/ChatUI.tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Settings, Loader } from 'lucide-react'

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  metadata?: {
    model?: string
    tokens?: number
    duration?: number
    confidence?: number
  }
}

export interface ChatUIProps {
  agentName: string
  agentDescription: string
  onSendMessage: (message: string) => Promise<void>
  messages: Message[]
  isProcessing: boolean
  capabilities?: string[]
  suggestions?: string[]
  onSettingsClick?: () => void
}

export function ChatUI({
  agentName,
  agentDescription,
  onSendMessage,
  messages,
  isProcessing,
  capabilities = [],
  suggestions = [],
  onSettingsClick
}: ChatUIProps) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  
  useEffect(() => {
    scrollToBottom()
  }, [messages])
  
  const handleSend = async () => {
    if (!input.trim() || isProcessing) return
    
    const message = input
    setInput('')
    await onSendMessage(message)
  }
  
  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Bot className="w-6 h-6 text-blue-600" />
              {agentName}
            </h1>
            <p className="text-sm text-gray-600">{agentDescription}</p>
          </div>
          <button
            onClick={onSettingsClick}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <Settings className="w-5 h-5 text-gray-600" />
          </button>
        </div>
        
        {/* Capabilities */}
        {capabilities.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {capabilities.map((cap, i) => (
              <span
                key={i}
                className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full"
              >
                {cap}
              </span>
            ))}
          </div>
        )}
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        
        {isProcessing && (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader className="w-4 h-4 animate-spin" />
            <span className="text-sm">Processing...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Suggestions */}
      {suggestions.length > 0 && messages.length === 0 && (
        <div className="px-6 py-3 border-t bg-white">
          <p className="text-xs text-gray-500 mb-2">Try asking:</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                onClick={() => setInput(suggestion)}
                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-sm transition"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Input */}
      <div className="border-t bg-white px-6 py-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Type your message..."
            disabled={isProcessing}
            className="flex-1 px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user'
  
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex gap-3 max-w-[80%] ${isUser ? 'flex-row-reverse' : ''}`}>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-blue-600' : 'bg-gray-200'
        }`}>
          {isUser ? (
            <User className="w-4 h-4 text-white" />
          ) : (
            <Bot className="w-4 h-4 text-gray-600" />
          )}
        </div>
        
        <div>
          <div className={`px-4 py-2 rounded-lg ${
            isUser ? 'bg-blue-600 text-white' : 'bg-white border'
          }`}>
            <div className="whitespace-pre-wrap">{message.content}</div>
          </div>
          
          {message.metadata && (
            <div className="mt-1 text-xs text-gray-500 flex gap-3">
              {message.metadata.model && (
                <span>Model: {message.metadata.model}</span>
              )}
              {message.metadata.tokens && (
                <span>Tokens: {message.metadata.tokens}</span>
              )}
              {message.metadata.confidence && (
                <span>Confidence: {Math.round(message.metadata.confidence * 100)}%</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

### Settings Component
```typescript
// packages/shared/ui-components/src/SettingsPanel.tsx
'use client'

import { useState } from 'react'
import { Save, X } from 'lucide-react'

export interface AgentSettings {
  model: string
  temperature: number
  maxTokens: number
  apiKey?: string
  advanced?: Record<string, any>
}

export interface SettingsPanelProps {
  settings: AgentSettings
  onSave: (settings: AgentSettings) => void
  onClose: () => void
  availableModels?: string[]
  agentSpecificSettings?: React.ReactNode
}

export function SettingsPanel({
  settings,
  onSave,
  onClose,
  availableModels = [
    'anthropic/claude-3-5-sonnet',
    'anthropic/claude-3-haiku',
    'openai/gpt-4-turbo',
    'openai/gpt-3.5-turbo',
    'meta-llama/llama-3.1-70b-instruct'
  ],
  agentSpecificSettings
}: SettingsPanelProps) {
  const [localSettings, setLocalSettings] = useState(settings)
  
  const handleSave = () => {
    onSave(localSettings)
    onClose()
  }
  
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[80vh] overflow-hidden">
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold">Agent Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="px-6 py-4 overflow-y-auto max-h-[60vh]">
          {/* Model Selection */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Model
            </label>
            <select
              value={localSettings.model}
              onChange={(e) => setLocalSettings({
                ...localSettings,
                model: e.target.value
              })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableModels.map(model => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
          
          {/* Temperature */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Temperature: {localSettings.temperature}
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={localSettings.temperature}
              onChange={(e) => setLocalSettings({
                ...localSettings,
                temperature: parseFloat(e.target.value)
              })}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>Precise</span>
              <span>Balanced</span>
              <span>Creative</span>
            </div>
          </div>
          
          {/* Max Tokens */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              Max Tokens
            </label>
            <input
              type="number"
              value={localSettings.maxTokens}
              onChange={(e) => setLocalSettings({
                ...localSettings,
                maxTokens: parseInt(e.target.value)
              })}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {/* OpenRouter API Key */}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-2">
              OpenRouter API Key (Optional)
            </label>
            <input
              type="password"
              value={localSettings.apiKey || ''}
              onChange={(e) => setLocalSettings({
                ...localSettings,
                apiKey: e.target.value
              })}
              placeholder="sk-or-..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">
              Leave empty to use environment variable
            </p>
          </div>
          
          {/* Agent-specific settings */}
          {agentSpecificSettings && (
            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3">Advanced Settings</h3>
              {agentSpecificSettings}
            </div>
          )}
        </div>
        
        <div className="px-6 py-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}
```

## 2. OpenRouter Client Package

```typescript
// packages/shared/openrouter-client/src/index.ts
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateObject, generateText, streamText } from 'ai'
import { z } from 'zod'

export class OpenRouterClient {
  private provider: any
  
  constructor(apiKey?: string) {
    this.provider = createOpenRouter({
      apiKey: apiKey || process.env.OPENROUTER_API_KEY || '',
      baseURL: 'https://openrouter.ai/api/v1'
    })
  }
  
  getModel(modelName: string = 'anthropic/claude-3-5-sonnet') {
    return this.provider(modelName)
  }
  
  async generateStructured<T>(params: {
    model: string
    schema: z.ZodSchema<T>
    prompt: string
    temperature?: number
    maxTokens?: number
  }): Promise<T> {
    const { object } = await generateObject({
      model: this.getModel(params.model),
      schema: params.schema,
      prompt: params.prompt,
      temperature: params.temperature || 0.3,
      maxTokens: params.maxTokens || 4000
    })
    
    return object
  }
  
  async generateText(params: {
    model: string
    prompt: string
    temperature?: number
    maxTokens?: number
  }): Promise<string> {
    const { text } = await generateText({
      model: this.getModel(params.model),
      prompt: params.prompt,
      temperature: params.temperature || 0.7,
      maxTokens: params.maxTokens || 2000
    })
    
    return text
  }
  
  async *streamText(params: {
    model: string
    prompt: string
    temperature?: number
  }) {
    const { textStream } = await streamText({
      model: this.getModel(params.model),
      prompt: params.prompt,
      temperature: params.temperature || 0.7
    })
    
    for await (const chunk of textStream) {
      yield chunk
    }
  }
}
```

## 3. PRD Agent Implementation

### Agent Core
```typescript
// packages/prd-agent/agent/src/index.ts
import { z } from 'zod'
import { OpenRouterClient } from '@product-agents/openrouter-client'

const PRDSchema = z.object({
  problemStatement: z.string(),
  solutionOverview: z.string(),
  targetUsers: z.array(z.string()),
  goals: z.array(z.string()),
  successMetrics: z.array(z.object({
    metric: z.string(),
    target: z.string(),
    timeline: z.string()
  })),
  constraints: z.array(z.string()),
  assumptions: z.array(z.string())
})

export class PRDGeneratorAgent {
  private client: OpenRouterClient
  private settings: {
    model: string
    temperature: number
    maxTokens: number
  }
  
  constructor(settings?: any) {
    this.client = new OpenRouterClient(settings?.apiKey)
    this.settings = {
      model: settings?.model || 'openai/gpt-4-turbo',
      temperature: settings?.temperature || 0.3,
      maxTokens: settings?.maxTokens || 4000
    }
  }
  
  async chat(message: string, context?: any) {
    // Orchestrator-Workers Pattern Implementation
    const workflow = [
      this.analyzeContext,
      this.extractRequirements,
      this.generateProblemStatement,
      this.createSolutionFramework,
      this.synthesizePRD
    ]
    
    const results = new Map()
    
    for (const step of workflow) {
      const stepResult = await step.call(this, message, results)
      results.set(step.name, stepResult)
    }
    
    return results.get('synthesizePRD')
  }
  
  private async analyzeContext(message: string, previousResults: Map<string, any>) {
    const analysis = await this.client.generateStructured({
      model: this.settings.model,
      schema: z.object({
        themes: z.array(z.string()),
        requirements: z.array(z.string()),
        constraints: z.array(z.string())
      }),
      prompt: `Analyze this product request: ${message}`,
      temperature: this.settings.temperature
    })
    
    return analysis
  }
  
  private async extractRequirements(message: string, previousResults: Map<string, any>) {
    const context = previousResults.get('analyzeContext')
    
    const requirements = await this.client.generateStructured({
      model: this.settings.model,
      schema: z.object({
        functional: z.array(z.string()),
        nonFunctional: z.array(z.string())
      }),
      prompt: `Extract requirements from: ${JSON.stringify(context)}`,
      temperature: this.settings.temperature
    })
    
    return requirements
  }
  
  private async generateProblemStatement(message: string, previousResults: Map<string, any>) {
    const context = previousResults.get('analyzeContext')
    const requirements = previousResults.get('extractRequirements')
    
    const statement = await this.client.generateText({
      model: this.settings.model,
      prompt: `Create a problem statement for: ${message}
               Context: ${JSON.stringify(context)}
               Requirements: ${JSON.stringify(requirements)}`,
      temperature: this.settings.temperature
    })
    
    return statement
  }
  
  private async createSolutionFramework(message: string, previousResults: Map<string, any>) {
    const problemStatement = previousResults.get('generateProblemStatement')
    
    const framework = await this.client.generateStructured({
      model: this.settings.model,
      schema: z.object({
        approach: z.string(),
        components: z.array(z.string()),
        technologies: z.array(z.string())
      }),
      prompt: `Design solution for: ${problemStatement}`,
      temperature: this.settings.temperature
    })
    
    return framework
  }
  
  private async synthesizePRD(message: string, previousResults: Map<string, any>) {
    const allResults = Object.fromEntries(previousResults)
    
    const prd = await this.client.generateStructured({
      model: this.settings.model,
      schema: PRDSchema,
      prompt: `Synthesize a complete PRD from: ${JSON.stringify(allResults)}`,
      temperature: this.settings.temperature,
      maxTokens: this.settings.maxTokens
    })
    
    return prd
  }
}
```

### Frontend Implementation
```typescript
// frontend/product-agent/app/page.tsx
'use client'

import { useState } from 'react'
import { ChatUI, SettingsPanel } from '@product-agents/ui-components'
import { PRDGeneratorAgent } from '@product-agents/prd-agent'
import { v4 as uuidv4 } from 'uuid'

export default function PRDAgentPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({
    model: 'openai/gpt-4-turbo',
    temperature: 0.3,
    maxTokens: 4000,
    apiKey: ''
  })
  
  const [agent] = useState(() => new PRDGeneratorAgent(settings))
  
  const handleSendMessage = async (message: string) => {
    // Add user message
    const userMessage = {
      id: uuidv4(),
      role: 'user' as const,
      content: message,
      timestamp: new Date()
    }
    
    setMessages(prev => [...prev, userMessage])
    setIsProcessing(true)
    
    try {
      // Process with agent
      const response = await agent.chat(message)
      
      // Add assistant response
      const assistantMessage = {
        id: uuidv4(),
        role: 'assistant' as const,
        content: formatPRDResponse(response),
        timestamp: new Date(),
        metadata: {
          model: settings.model,
          confidence: 0.85
        }
      }
      
      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Agent error:', error)
      
      const errorMessage = {
        id: uuidv4(),
        role: 'assistant' as const,
        content: 'Sorry, I encountered an error processing your request.',
        timestamp: new Date()
      }
      
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsProcessing(false)
    }
  }
  
  const formatPRDResponse = (prd: any) => {
    return `# Product Requirements Document

## Problem Statement
${prd.problemStatement}

## Solution Overview
${prd.solutionOverview}

## Target Users
${prd.targetUsers.map(u => `- ${u}`).join('\n')}

## Goals
${prd.goals.map(g => `- ${g}`).join('\n')}

## Success Metrics
${prd.successMetrics.map(m => 
  `- ${m.metric}: ${m.target} (${m.timeline})`
).join('\n')}

## Constraints
${prd.constraints.map(c => `- ${c}`).join('\n')}

## Assumptions
${prd.assumptions.map(a => `- ${a}`).join('\n')}`
  }
  
  return (
    <>
      <ChatUI
        agentName="PRD Generator"
        agentDescription="Creates comprehensive Product Requirements Documents"
        onSendMessage={handleSendMessage}
        messages={messages}
        isProcessing={isProcessing}
        capabilities={[
          'Context Analysis',
          'Requirements Extraction',
          'Problem Synthesis',
          'Solution Framework',
          'PRD Generation'
        ]}
        suggestions={[
          'Create a PRD for a mobile banking app',
          'Generate requirements for an e-commerce platform',
          'Design a PRD for a team collaboration tool'
        ]}
        onSettingsClick={() => setShowSettings(true)}
      />
      
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={(newSettings) => {
            setSettings(newSettings)
            // Recreate agent with new settings
          }}
          onClose={() => setShowSettings(false)}
          agentSpecificSettings={
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  PRD Format
                </label>
                <select className="w-full px-3 py-2 border rounded-lg">
                  <option value="standard">Standard</option>
                  <option value="lean">Lean</option>
                  <option value="detailed">Detailed</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">
                  Include Sections
                </label>
                <div className="space-y-2">
                  {['Technical Requirements', 'User Stories', 'Risks', 'Timeline'].map(section => (
                    <label key={section} className="flex items-center">
                      <input type="checkbox" className="mr-2" defaultChecked />
                      <span className="text-sm">{section}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          }
        />
      )}
    </>
  )
}
```

## 4. Implementation Plan for All 6 Agents

### Phase 1: Foundation (Week 1)
- [ ] Setup monorepo with Turborepo
- [ ] Create shared packages (ui-components, agent-core, openrouter-client)
- [ ] Implement base ChatUI and SettingsPanel components
- [ ] Setup OpenRouter integration with AI SDK

### Phase 2: Agent Implementation (Weeks 2-4)

#### PRD Generator Agent
- [ ] Implement Orchestrator-Workers pattern
- [ ] Create 5 workers (context, requirements, problem, solution, synthesis)
- [ ] Build frontend with PRD-specific UI
- [ ] Add validation and guardrails

#### Research Agent  
- [ ] Implement Parallelization pattern
- [ ] Create 4 parallel workers (competitive, trends, insights, gaps)
- [ ] Add voting mechanism for synthesis
- [ ] Build frontend with research visualization

#### Persona Agent
- [ ] Implement Prompt Chaining pattern
- [ ] Create sequential workflow (analyze → demographics → pain points → journey)
- [ ] Build frontend with persona cards UI
- [ ] Add persona relationship mapping

#### Story Mapper Agent
- [ ] Implement Orchestrator-Workers pattern
- [ ] Create journey analysis and epic organization workers
- [ ] Build frontend with story map visualization
- [ ] Add dependency tracking

#### Story Generator Agent
- [ ] Implement True Agent with dynamic control
- [ ] Add self-evaluation and refinement loop
- [ ] Build frontend with story preview
- [ ] Add acceptance criteria generation

#### Story Refiner Agent
- [ ] Implement Routing pattern
- [ ] Create quality analysis and routing logic
- [ ] Build frontend with before/after comparison
- [ ] Add edge case identification

### Phase 3: Testing & Polish (Week 5)
- [ ] Unit tests for each agent
- [ ] Integration tests for workflows
- [ ] Performance optimization
- [ ] Documentation

### Running Each Agent Independently

```bash
# Development mode for PRD Agent
cd frontend/product-agent
npm run dev
# Opens at http://localhost:3000

# Build and run as standalone
cd packages/prd-agent
npm run build
npm start
# Serves complete agent with frontend

# Run as MCP server
npx @product-agents/prd-agent mcp

# Use in code
import { PRDGeneratorAgent } from '@product-agents/prd-agent'
const agent = new PRDGeneratorAgent({ apiKey: 'sk-or-...' })
```

### Package.json Structure

```json
{
  "name": "@product-agents/prd-agent",
  "version": "1.0.0",
  "exports": {
    ".": "./dist/agent/index.js",
    "./mcp": "./dist/mcp-server/index.js"
  },
  "bin": {
    "prd-agent": "./bin/cli.js",
    "prd-agent-mcp": "./bin/mcp-server.js"
  },
  "scripts": {
    "dev": "npm run dev --workspace=frontend",
    "build": "turbo run build",
    "test": "vitest",
    "start": "npm run start --workspace=frontend"
  },
  "workspaces": [
    "agent",
    "frontend",
    "mcp-server"
  ]
}
```

This architecture ensures:
1. **Complete independence** - Each agent runs standalone
2. **Consistent UX** - Shared UI components
3. **Easy testing** - Individual frontends for each agent
4. **OpenRouter integration** - All agents use OpenRouter via AI SDK
5. **MCP compatibility** - Can be integrated into larger systems
6. **Production ready** - Each agent can be deployed independently
