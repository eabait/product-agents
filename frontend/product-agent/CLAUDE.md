# PRD Agent Frontend - Claude Memory File

## Project Overview
This is a PRD (Product Requirements Document) Agent frontend built with Next.js, React, and TypeScript. It provides a chat interface for AI-powered PRD generation using the Vercel AI SDK.

## Architecture
- **Framework**: Next.js 14.2.0 with App Router
- **UI**: React 18 with TypeScript
- **Styling**: Tailwind CSS + shadcn/ui components
- **AI Integration**: Vercel AI SDK for chat functionality
- **State Management**: React hooks with localStorage persistence

## Key Files Structure
```
app/
├── page.tsx              # Main PRD Agent page component with integrated chat UI
├── api/
│   └── chat/
│       └── route.ts      # AI SDK streaming API endpoint
├── globals.css           # Global styles and Tailwind config
└── layout.tsx           # Root layout
components/
├── chat/                 # Chat UI components
│   ├── ChatMessages.tsx  # Message display with PRD editing
│   ├── PRDEditor.tsx     # Interactive PRD editor
│   └── ...other chat components
└── ui/                   # shadcn/ui components
lib/
└── prd-schema.ts         # Zod schema for PRD validation
```

## UI Design Philosophy
The interface is designed to exactly match Claude's UI:
- **Sidebar**: 300px collapsible left panel with chat history
- **Main Content**: Centered conversation view (max-width 768px)
- **Typography**: Claude's exact text hierarchy (16px base, leading-7)
- **Spacing**: 32px message spacing, 24px content padding
- **Colors**: Semantic CSS variables for theming

## Component Architecture

### Main Page (page.tsx)
- Integrated chat interface with AI SDK streaming
- Conversation management with localStorage persistence
- Sidebar collapse/expand functionality
- Direct communication with PRD agent backend
- Real-time streaming responses from AI agent

## Key Features
1. **Conversation Management**: Create, switch between, and delete conversations
2. **Real-time Chat**: AI responses with proper markdown rendering
3. **PRD Generation**: Specialized prompts for creating Product Requirements Documents
4. **Settings**: AI model selection and temperature control
5. **Responsive Design**: Works on desktop and mobile

## AI Integration
- **AI SDK Streaming**: Uses AI SDK compatible streaming format for better UX
- **Unified Interface**: Single chat interface that automatically handles:
  - **PRD Creation**: Detects new PRD requests and calls `/prd` endpoint
  - **PRD Editing**: Detects existing PRDs and calls `/prd/edit` endpoint  
  - **General Chat**: Conversational interactions with the PRD agent
- **Backend Communication**: Integrates with existing PRD agent at `PRD_AGENT_URL`
- **Real-time Streaming**: AI SDK compatible streaming responses
- **Smart Context Detection**: Automatically determines create vs edit based on conversation history
- **API Route**: Single `/api/chat` endpoint handles all interactions with proper streaming
- **Type Safety**: Zod schemas available for PRD validation when needed

## Styling Notes
- Uses shadcn/ui components for consistency
- Tailwind CSS with semantic color variables
- Matches Claude's exact spacing and typography
- Smooth transitions and hover states

## Development Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run ESLint

## Dependencies
Key packages used:
- `next` - React framework
- `@ai-sdk/react` - AI SDK React package (for potential future enhancements)
- `ai` - Core AI SDK for streaming functionality and format compatibility
- `zod` - Schema validation and type safety for PRD structures
- `react-markdown` - Markdown rendering in chat messages
- `lucide-react` - Icon library
- `uuid` - ID generation for messages and conversations
- `tailwindcss` - Styling framework
- `@radix-ui/react-*` - shadcn/ui base components

## State Management
Uses React hooks with localStorage for persistence:
- Conversations stored in `prd-agent-conversations`
- Active conversation ID in `prd-agent-active-conversation`
- Settings in `prd-agent-settings`