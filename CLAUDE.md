# Product Agents - Claude Memory File

## Project Overview
A monorepo containing multiple AI agent applications for various product development tasks. The project uses a turborepo structure with shared components and individual agent packages.

## Architecture
- **Framework**: Turborepo with Next.js frontends and TypeScript backends
- **Structure**: packages/ directory with individual agents and shared libraries
- **Shared Components**: UI components, agent core, model compatibility, and OpenRouter client

## Key Packages Structure
```
packages/
├── prd-agent/           # Product Requirements Document agent
│   ├── frontend/        # Next.js frontend with chat UI
│   ├── agent/          # Backend HTTP server
│   └── mcp-server/     # MCP server integration
├── persona-agent/       # User persona generation agent
├── research-agent/      # Research and analysis agent
├── story-*-agent/      # Story-related agents (generator, mapper, refiner)
└── shared/             # Shared libraries
    ├── ui-components/  # Reusable UI components
    ├── agent-core/     # Core agent functionality
    ├── model-compatibility/ # Model capability checking
    └── openrouter-client/   # OpenRouter API client
```

## Development Commands
- `npm run dev` - Start all development servers
- `npm run build` - Build all packages
- `npm run lint` - Run ESLint across all packages

## Key Technologies
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, TypeScript
- **AI Integration**: Vercel AI SDK, OpenRouter API
- **Styling**: Tailwind CSS with semantic color variables
- **State Management**: React hooks with localStorage persistence