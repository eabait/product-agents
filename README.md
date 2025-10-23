# Product Agents Monorepo

A turborepo containing multiple AI agents for product development tasks. The most complete agent today is the PRD (Product Requirements Document) agent, which includes:
- Backend HTTP API (TypeScript/Node)
- Frontend (Next.js 14)

This README covers end-to-end local setup, environment configuration, required API keys, and run commands.


## Technical Requirements
- Node.js >= 18
- npm >= 10
- macOS/Linux/WSL recommended
- Port availability: `3000` (frontend), `3001` (backend)

Included tooling (already managed via workspaces):
- Turbo (turborepo)
- TypeScript
- ESLint


## Repository Structure
```
packages/
├─ prd-agent/              # PRD agent (most complete)
│  ├─ agent/               # Backend HTTP server
│  └─ frontend/            # Next.js UI and API routes (proxy to backend)
├─ shared/
│  ├─ agent-core/          # Base agent classes/utilities
│  ├─ model-compatibility/ # Model capability system
│  ├─ openrouter-client/   # OpenRouter + Vercel AI SDK client
│  └─ ui-components/       # Reusable React components
└─ (other agents scaffolds)
```


## Environment Variables and API Keys
The project integrates with OpenRouter for AI models. You need an OpenRouter API Key.

Where to obtain: Create an account and key at openrouter.ai (do not commit your key).

Recommended local setup files:
- Backend: `packages/prd-agent/agent/.env`
- Frontend: `packages/prd-agent/frontend/.env.local`

Required/optional variables by component:

Backend HTTP API (`packages/prd-agent/agent/.env`)
- `OPENROUTER_API_KEY`: REQUIRED unless passed per-request in settings
- `PRD_AGENT_HTTP_HOST`: Optional, default `0.0.0.0`
- `PRD_AGENT_HTTP_PORT`: Optional, default `3001`
- `PRD_AGENT_MODEL`: Optional, default `anthropic/claude-3-7-sonnet`
- `PRD_AGENT_TEMPERATURE`: Optional, default from server constants
- `PRD_AGENT_MAX_TOKENS`: Optional, default from server constants
- `PRD_AGENT_CHANGE_WORKER_TEMPERATURE`: Optional, tuning edit worker

Frontend (`packages/prd-agent/frontend/.env.local`)
- `PRD_AGENT_URL`: REQUIRED, e.g. `http://localhost:3001`
- `OPENROUTER_API_KEY`: Optional (server-side fetch for models)
- `YOUR_SITE_URL`: Optional, used as `HTTP-Referer` for OpenRouter models API
- `YOUR_SITE_NAME`: Optional, used as `X-Title` for OpenRouter models API
- `NEXT_PUBLIC_OPENROUTER_API_KEY`: Optional, if you want a client-side default (avoid exposing secrets in prod)

Security notes:
- Do not commit real API keys. `.env*` files are gitignored.
- Keys can also be supplied per-request in payloads if preferred.


## Install
From repository root:
```
npm install
```


## Running Locally (recommended dev flow)
Use two terminals: one for the backend HTTP API and one for the frontend.

1) Start the Backend HTTP API
```
cd packages/prd-agent/agent
# Create and populate .env with your keys/settings (see above)
# Then start the HTTP server
npm run start-http
# => listens on http://0.0.0.0:3001 by default
```

2) Start the Frontend (Next.js)
```
cd packages/prd-agent/frontend
# Create .env.local with at least:
# PRD_AGENT_URL=http://localhost:3001
# (Optionally OPENROUTER_API_KEY, YOUR_SITE_URL, YOUR_SITE_NAME)
npm run dev
# => http://localhost:3000
```

Alternative: run dev scripts via turborepo
- From root: `npm run dev` starts all available `dev` scripts (e.g., the frontend). The backend HTTP server uses `start-http`, so run it in a separate terminal as shown above.


## Backend HTTP API
Default base URL: `http://localhost:3001`

Key endpoints (JSON):
- GET `/health` — agent info, defaults, capabilities
- POST `/prd` — create a PRD
- POST `/prd/edit` — edit an existing PRD
- POST `/prd/sections` — generate specific sections
- POST `/prd/section/:name` — update one section by name
- Streaming variants: `/prd/stream`, `/prd/edit/stream`, `/prd/sections/stream`, `/prd/section/:name/stream` (Server-Sent Events)

Notes:
- The backend requires an OpenRouter API key either via `OPENROUTER_API_KEY` env or in request `settings.apiKey`.
- Default model: `anthropic/claude-3-7-sonnet` (capability-filtered in frontend).

Example: Create a PRD (non-streaming)
```
curl -X POST http://localhost:3001/prd \
  -H 'Content-Type: application/json' \
  -d '{
    "message": "Create a PRD for a mobile habit tracker app",
    "settings": {
      "model": "anthropic/claude-3-7-sonnet",
      "temperature": 0.3,
      "maxTokens": 8000
      // "apiKey": "sk-or-..."  // optional override per request
    }
  }'
```


## Frontend App
Default URL: `http://localhost:3000`

- UI provides chat, settings panel, and model selection.
- Next.js API routes proxy to the backend at `PRD_AGENT_URL`.
- `/api/models` fetches model metadata from OpenRouter (requires API key server-side or `x-api-key` header).

Ensure `PRD_AGENT_URL` points to your running backend, and set `OPENROUTER_API_KEY` (optional) to list models server-side.


## Workspace Scripts
Root (turborepo):
- `npm run dev` — turbo run dev (frontend only by default)
- `npm run build` — turbo run build for all packages
- `npm run test` — turbo run test
- `npm run lint` — turbo run lint
- `npm run clean` — clean build outputs

PRD Agent workspaces:
- `packages/prd-agent/agent`: `npm run start-http`, `npm run build`, `npm run dev` (build watch), `npm run test`
- `packages/prd-agent/frontend`: `npm run dev`, `npm run build`, `npm run start`, `npm run lint`
- `packages/prd-agent/mcp-server`: `npm run build`, `npm run dev`


## MCP Server (optional)
```
cd packages/prd-agent/mcp-server
npm run build
# Binary available as `prd-agent-mcp` (see package bin). Integrate per your MCP host tooling.
```


## Troubleshooting
- 404s from frontend API: Confirm `PRD_AGENT_URL` is set in `packages/prd-agent/frontend/.env.local`.
- Backend errors about missing API key: Set `OPENROUTER_API_KEY` in `packages/prd-agent/agent/.env` or pass `settings.apiKey` in requests.
- Port conflicts: Change `PRD_AGENT_HTTP_PORT` or Next.js port (`PORT`) as needed.
- Model list empty: Ensure `OPENROUTER_API_KEY` is set for frontend server-side or provide `x-api-key` header to `/api/models`.


## Notes
- This repo uses capability filtering to show models compatible with the agent’s requirements (e.g., structured output, streaming).
- Do not expose secrets to the browser. Prefer server-side env vars or per-request headers.

