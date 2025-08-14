# Product Agents - Claude Memory File

## Project Overview
A monorepo containing multiple AI agent applications for various product development tasks. The project uses a turborepo structure with shared components and individual agent packages. Each agent follows a consistent tri-part architecture: frontend (Next.js), backend (HTTP server), and MCP server integration.

## System Architecture

### Overall Structure
- **Monorepo Management**: Turborepo with NPM workspaces for dependency management
- **Package Structure**: Individual agent packages + shared libraries under `packages/`
- **Tri-Part Agent Architecture**: Frontend, Backend, and MCP server for each agent
- **Shared Libraries**: Reusable components, agent abstractions, and utilities

### Key Packages Structure
```
packages/
├── prd-agent/           # Product Requirements Document agent (most complete)
├── persona-agent/       # User persona generation agent
├── research-agent/      # Research and analysis agent
├── story-generator-agent/   # Story generation
├── story-mapper-agent/      # Story mapping
├── story-refiner-agent/     # Story refinement
└── shared/             # Shared libraries
    ├── ui-components/  # ChatUI, SettingsPanel, shared React components
    ├── agent-core/     # BaseAgent, WorkerAgent, OrchestratorAgent abstractions
    ├── model-compatibility/ # Model capability system and filtering
    └── openrouter-client/   # Unified LLM API client
```

### Individual Agent Structure
Each agent package contains:
```
agent-name/
├── frontend/           # Next.js app with chat interface
│   ├── app/api/       # API routes (proxy to backend)
│   ├── components/    # Agent-specific components
│   └── lib/          # Utilities and schemas
├── agent/             # Backend HTTP server
│   └── src/          # Agent logic and HTTP endpoints
└── mcp-server/        # Model Context Protocol integration
```

## Design Decisions

### 1. Frontend-Backend Communication

**Architecture Decision**: Frontend acts as a thin client with backend handling all AI processing.

**Communication Flow**:
```
Frontend UI → Next.js API Routes → Backend HTTP Server → Agent Logic → LLM APIs
```

**Key Design Patterns**:

#### API Structure
- **Frontend API Routes**: Act as translators between AI SDK format and backend agent format
- **Backend HTTP Server**: Lightweight Express server exposing agent functionality via REST endpoints
- **Request-Response Pattern**: Complete processing server-side, no streaming currently implemented

#### Endpoint Design
```typescript
// Frontend API Routes (Next.js)
POST /api/chat           // Main agent interaction
GET  /api/agent-defaults // Agent configuration and capabilities
GET  /api/models        // Compatible models filtered by agent requirements

// Backend HTTP Server (Express)
GET  /health           // Agent info, defaults, and health check
POST /prd              // Create new PRD
POST /prd/edit         // Edit existing PRD
```

#### Request/Response Format
```typescript
// Frontend to Backend
{
  "message": "user input",
  "settings": {
    "model": "anthropic/claude-3-5-sonnet",
    "temperature": 0.3,
    "maxTokens": 8000,
    "apiKey": "optional-key"
  },
  "existingPRD": "for edits only"
}

// Backend to Frontend
{
  "content": "JSON string of structured response"
}
```

#### Error Handling Strategy
- **Frontend**: User-friendly error messages with fallback handling
- **Backend**: Structured error responses with appropriate HTTP status codes
- **Agent Level**: Graceful degradation and validation at each step

### 2. Agent Architecture and Patterns

**Architecture Decision**: Multi-tier agent system with specialized workers and orchestration.

#### Agent Class Hierarchy
```typescript
BaseAgent (Abstract)
├── WorkerAgent (Specialized tasks)
├── OrchestratorAgent (Sequential execution)
└── ParallelAgent (Concurrent execution with voting)
```

#### Agent Patterns

**Worker Pattern** - For specialized subtasks:
```typescript
abstract class WorkerAgent extends BaseAgent {
  abstract execute(input: any, context?: Map<string, any>): Promise<WorkerResult>
}
```
- Used for: Context analysis, requirements extraction, problem statement generation
- Returns structured results with confidence scores
- Can access context from previous workers

**Orchestrator Pattern** - For sequential workflows:
```typescript
class OrchestratorAgent extends BaseAgent {
  async executeWorkflow(input: any): Promise<Map<string, WorkerResult>>
}
```
- Executes workers in sequence
- Passes cumulative context between workers
- Used in PRD generation pipeline

**Parallel Pattern** - For concurrent processing:
```typescript
class ParallelAgent extends BaseAgent {
  async executeWithVoting(input: any): Promise<WorkerResult>
}
```
- Executes workers concurrently
- Includes voting mechanism for result selection
- Suitable for scenarios requiring consensus

#### PRD Agent Implementation
The PRD agent uses an Orchestrator-Workers pattern with 6 specialized workers:

1. **ContextAnalysisWorker** - Analyzes input themes and requirements
2. **RequirementsExtractionWorker** - Extracts functional/non-functional requirements
3. **ProblemStatementWorker** - Creates clear problem statement
4. **SolutionFrameworkWorker** - Designs solution approach
5. **PRDSynthesisWorker** - Synthesizes final PRD document
6. **ChangeWorker** - Handles PRD edits via JSON patches

### 3. Settings and Configuration Management

**Architecture Decision**: Hierarchical settings with runtime overrides and validation.

#### Configuration Hierarchy (Priority Order)
1. **Environment Variables** (lowest priority) - Default fallbacks
2. **Agent Defaults** (medium priority) - Static agent properties
3. **Request Settings** (highest priority) - Per-request overrides

#### Settings Flow
```typescript
// Agent Creation
const effectiveSettings = {
  ...environmentDefaults,    // From .env
  ...agentDefaults,         // From agent static properties
  ...(requestSettings || {}) // From API request
}

// Validation and instantiation
const agent = new AgentClass(effectiveSettings)
```

#### Model Compatibility System
Agents declare required capabilities:
```typescript
static readonly requiredCapabilities: ModelCapability[] = ['structured_output']
```

Frontend filters available models based on these requirements using the shared model-compatibility package.

### 4. State Management Strategy

**Architecture Decision**: Stateless backend with frontend state persistence.

#### Frontend State
- **React State**: For UI interactions and real-time updates
- **localStorage**: For conversation history and user settings persistence
- **No Global State Management**: Simple hook-based state management

#### Backend State
- **Stateless Design**: Each request creates new agent instance
- **No Session Management**: No persistent state between requests
- **Context Passing**: All context passed explicitly in requests

#### Agent State
- **Worker Context**: Passed between workers in single request execution
- **No Persistent Memory**: Agents don't retain information between calls

### 5. Model Integration and Abstraction

**Architecture Decision**: Unified model client with capability-based selection.

#### OpenRouter Client Abstraction
```typescript
class OpenRouterClient {
  async generateStructured<T>(schema: ZodSchema<T>, ...): Promise<T>
  async generateText(...): Promise<string>
}
```

#### Model Capability System
- **Capability Types**: `'reasoning' | 'structured_output' | 'tools' | 'multimodal'`
- **Agent Requirements**: Each agent declares required capabilities
- **Automatic Filtering**: Frontend shows only compatible models
- **Provider Support**: 15+ model providers (Anthropic, OpenAI, Google, etc.)

### 6. Shared Component Strategy

**Architecture Decision**: Maximize reusability through shared abstractions and components.

#### Shared Libraries Design
- **agent-core**: Abstract base classes and common patterns
- **ui-components**: Reusable React components (ChatUI, SettingsPanel)
- **model-compatibility**: Model filtering and capability checking
- **openrouter-client**: Unified LLM API client

#### UI Component Guidelines
**IMPORTANT**: Always use existing shadcn/ui components before creating new ones. Check the shared ui-components package and individual agent component directories for available components. Only create new components when existing ones cannot be adapted or extended.

Common shadcn/ui components already available:
- Button, Input, Textarea, Select
- Card, Dialog, Sheet, Popover
- Badge, Avatar, Progress, Separator
- Form components (Label, FormField, etc.)

#### New Agent Creation Pattern
To create a new agent:
1. Define required capabilities and defaults
2. Create specialized workers inheriting from WorkerAgent
3. Implement main agent using orchestration pattern
4. Create HTTP server exposing agent endpoints
5. Build frontend using shared UI components
6. Implement API routes that call agent backend

## Development Setup

### Installation
```bash
# Clone the repository
git clone <repository-url>
cd product-agents

# Install all dependencies for monorepo and packages
npm install

# Build all packages
npm run build
```

### NPM Workspace Commands

**Installing Dependencies**:
```bash
# Install dependency in root (affects all packages)
npm install <package-name>

# Install dependency in specific package
npm install <package-name> -w packages/prd-agent/frontend
npm install <package-name> -w packages/shared/ui-components

# Install dev dependency in specific package  
npm install <package-name> -D -w packages/prd-agent/agent

# Install dependency in all frontend packages
npm install <package-name> -w packages/prd-agent/frontend -w packages/persona-agent/frontend
```

**Common Examples**:
```bash
# Add a new React component library to all frontends
npm install lucide-react -w packages/prd-agent/frontend -w packages/persona-agent/frontend

# Add a backend utility to a specific agent
npm install express-rate-limit -w packages/prd-agent/agent

# Add a shared utility that all packages can use
npm install lodash -w packages/shared/agent-core

# Add a dev tool to the entire project
npm install prettier -D
```

### Development Commands
- `npm install` - Install all dependencies for monorepo and packages
- `npm run dev` - Start all development servers
- `npm run build` - Build all packages  
- `npm run lint` - Run ESLint across all packages
- `npm run clean` - Clean build artifacts

## Key Technologies
- **Frontend**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, TypeScript, Zod validation
- **AI Integration**: Vercel AI SDK, OpenRouter API, structured generation
- **Build System**: Turborepo, NPM workspaces
- **Styling**: Tailwind CSS with semantic color variables, Framer Motion
- **State Management**: React hooks with localStorage persistence