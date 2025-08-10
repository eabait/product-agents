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
├── page.tsx              # Main PRD Agent page component
├── components/
│   └── ChatUI.tsx        # Chat interface component
├── api/
│   └── chat/
│       └── route.ts      # API endpoint for AI chat
├── globals.css           # Global styles and Tailwind config
└── layout.tsx           # Root layout
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
- Manages conversation state and localStorage persistence
- Handles sidebar collapse/expand functionality
- Contains settings modal (hidden by default)
- Integrates with ChatUI component

### ChatUI Component (ChatUI.tsx)
- Renders message bubbles with proper spacing
- Handles input field with auto-resize
- Shows typing indicators during AI responses
- Provides suggestion cards on welcome screen

## Key Features
1. **Conversation Management**: Create, switch between, and delete conversations
2. **Real-time Chat**: AI responses with proper markdown rendering
3. **PRD Generation**: Specialized prompts for creating Product Requirements Documents
4. **Settings**: AI model selection and temperature control
5. **Responsive Design**: Works on desktop and mobile

## AI Integration
- Uses `/api/chat` endpoint for AI communication
- Supports editing existing PRDs vs creating new ones
- Formats responses as structured markdown PRD documents
- Maintains conversation context and PRD state

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
- `react-markdown` - Markdown rendering
- `lucide-react` - Icon library
- `uuid` - ID generation
- `tailwindcss` - Styling
- `@radix-ui/react-*` - shadcn/ui base components

## State Management
Uses React hooks with localStorage for persistence:
- Conversations stored in `prd-agent-conversations`
- Active conversation ID in `prd-agent-active-conversation`
- Settings in `prd-agent-settings`

## Future Improvements
- Add conversation search functionality
- Implement conversation sharing
- Add more PRD templates and suggestions
- Enhanced mobile responsiveness