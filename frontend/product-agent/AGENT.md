# Frontend Agent Guidelines

This document guides coding agents contributing to the `frontend/product-agent` package - the Next.js UI for the Product Agents system.

## Package Purpose

The frontend provides:
- A chat interface for interacting with the PRD agent and orchestrator
- Real-time streaming display of agent progress and artifacts
- Plan review and approval workflows
- Artifact visualization (PRD sections, personas, research, story maps)
- Settings management for model selection and parameters

## Architecture

### Tech Stack
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS + shadcn/ui components
- **State**: React hooks + localStorage persistence
- **API Communication**: Fetch with SSE for streaming

### Directory Structure
```
app/
├── page.tsx              # Main chat UI (single-page app)
├── layout.tsx            # Root layout with providers
├── globals.css           # Tailwind base + custom CSS vars
└── api/                  # Next.js API routes (proxy to backend)
    ├── runs/             # Run management endpoints
    ├── chat/             # Legacy chat endpoint
    ├── agent-defaults/   # Proxy to /health
    ├── models/           # OpenRouter model list
    ├── sections/         # PRD section endpoints
    └── subagents/        # Direct subagent runners

components/
├── chat/                 # Chat UI components
├── plan-review/          # Plan approval UI
├── prd-sections/         # PRD display/editing
├── research/             # Research artifact display
├── story-map/            # Story map visualization
├── settings/             # Settings panel
├── context/              # Context management UI
└── ui/                   # shadcn/ui base components

lib/                      # Utilities and shared logic
hooks/                    # Custom React hooks
contexts/                 # React context providers
types.ts                  # Shared TypeScript types
```

## Coding Guidelines

### Component Patterns

1. **Use Server Components by default** - Only add `'use client'` when needed (state, effects, event handlers)
2. **Colocate related code** - Keep component-specific types, utils, and styles in the component directory
3. **Prefer composition** - Build complex UIs from small, focused components
4. **Use shadcn/ui** - Check `components/ui/` before creating new base components

Example component structure:
```typescript
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface MyComponentProps {
  title: string
  onAction: () => void
}

export function MyComponent({ title, onAction }: MyComponentProps) {
  const [isLoading, setIsLoading] = useState(false)

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <Button onClick={onAction} disabled={isLoading}>
        Take Action
      </Button>
    </div>
  )
}
```

### API Routes

API routes proxy requests to the backend (`PRD_AGENT_URL`). Follow this pattern:

```typescript
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(2, 10)
  console.log(`[endpoint:${requestId}] request received`)

  try {
    const payload = await request.json()
    // Validate with Zod schema

    const response = await fetch(`${PRD_AGENT_URL}/endpoint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      return NextResponse.json({ error: error?.error ?? 'Request failed' }, { status: response.status })
    }

    return NextResponse.json(await response.json())
  } catch (error) {
    console.error(`[endpoint:${requestId}] error`, error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
```

### SSE Streaming

For real-time updates, use the SSE streaming pattern:

```typescript
// In API route
export async function GET(request: NextRequest, { params }: { params: { runId: string } }) {
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  // Connect to backend SSE and forward events
  // ...

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  })
}
```

### Styling Guidelines

1. **Use Tailwind utilities** - Prefer utility classes over custom CSS
2. **Follow spacing scale** - Use Tailwind's spacing scale (gap-2, p-4, etc.)
3. **Semantic colors** - Use CSS variables defined in `globals.css` for theming
4. **Match Claude's UI** - Reference existing components for typography and spacing

Key design tokens:
- Message spacing: `space-y-8` (32px)
- Content padding: `p-6` (24px)
- Max content width: `max-w-3xl` (768px)
- Base text: `text-base leading-7` (16px, line-height 28px)

### State Management

- **Local component state**: `useState` for UI state
- **Shared state**: Context providers in `contexts/`
- **Persistence**: localStorage for settings and conversation history

Storage keys:
- `prd-agent-conversations`: Conversation history
- `prd-agent-active-conversation`: Current conversation ID
- `prd-agent-settings`: Model and parameter settings

### Adding New Features

1. **New component**: Create in `components/<feature>/` with clear exports
2. **New API route**: Add in `app/api/<feature>/route.ts`
3. **New visualization**: Add component in `components/chat/` and integrate with message display
4. **New settings**: Extend the settings context and UI in `components/settings/`

## Testing

### Unit Tests
Currently minimal - prefer Playwright E2E tests.

### E2E Tests (Playwright)
```bash
npm run test -w frontend/product-agent       # Run E2E tests
npm run test:e2e:live -w frontend/product-agent  # Run against live backend
```

Test files in `tests/` directory.

## Development

```bash
npm run dev -w frontend/product-agent   # Start dev server
npm run build -w frontend/product-agent # Production build
npm run lint -w frontend/product-agent  # Run ESLint
```

## Environment Variables

Required in `.env.local`:
- `PRD_AGENT_URL`: Backend API URL (e.g., `http://localhost:3001`)

Optional:
- `OPENROUTER_API_KEY`: For direct model calls (usually passed through backend)

## Best Practices

1. **Type everything**: Use TypeScript interfaces for all props and API payloads
2. **Handle loading states**: Show skeletons or spinners during async operations
3. **Handle errors gracefully**: Display user-friendly error messages
4. **Optimize for streaming**: Design UIs that work well with progressive content
5. **Keep bundle small**: Use dynamic imports for heavy components
6. **Accessibility**: Use semantic HTML and ARIA attributes
7. **Console logging**: Use descriptive prefixes like `[feature:requestId]`

## Common Patterns

### Handling SSE in Components
```typescript
useEffect(() => {
  const eventSource = new EventSource(`/api/runs/${runId}/stream`)

  eventSource.addEventListener('progress', (e) => {
    const event = JSON.parse(e.data)
    // Handle progress event
  })

  eventSource.addEventListener('complete', (e) => {
    const result = JSON.parse(e.data)
    // Handle completion
    eventSource.close()
  })

  return () => eventSource.close()
}, [runId])
```

### Conditional Rendering by Artifact Type
```typescript
{artifact.kind === 'prd' && <PRDDisplay data={artifact.data} />}
{artifact.kind === 'persona' && <PersonaDisplay data={artifact.data} />}
{artifact.kind === 'research' && <ResearchDisplay data={artifact.data} />}
{artifact.kind === 'story-map' && <StoryMapDisplay data={artifact.data} />}
```
