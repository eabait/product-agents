# PRD Agent Frontend

Next.js 14 UI for the PRD agent. Handles chat interactions, progress streaming, context management, and artifact toggles against the backend orchestrator.

## Quick Start

```bash
cd frontend/product-agent
npm install
# create .env.local with PRD_AGENT_URL and optional overrides
npm run dev
```

The dev server defaults to `http://localhost:3000`. Point `PRD_AGENT_URL` at your running backend (default `http://localhost:3001`).

## Available Scripts

- `npm run dev` – start the Next.js development server
- `npm run build` – create a production build
- `npm run start` – serve the production build
- `npm run lint` – run Next.js/ESLint checks
- `npm run lint:fix` – lint with auto-fixes
- `npm run clean` – remove `.next`, `out`, and `dist` artifacts

## Directories

- `app/` – App Router routes (streaming chat, settings, telemetry views)
- `components/` – UI primitives and composite widgets
- `contexts/` – React context providers (models, settings, run state)
- `lib/` – API clients, schema helpers, and SSE utilities
- `tests/` – Playwright e2e and component smoke tests

Docs for the relocation and integration work live in `docs/deep-agent-refactor/`.
