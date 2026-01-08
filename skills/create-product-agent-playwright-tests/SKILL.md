---
name: create-product-agent-playwright-tests
description: Create or update Playwright end-to-end tests for the Product Agents frontend in this repo, especially for settings validation, conversation artifact visibility, research plan approval/rejection, and clarifying-question flows. Use when asked to write, expand, or run Playwright tests for frontend/product-agent (including live E2E runs gated by E2E_LIVE).
---

# Create Product Agent Playwright Tests

Use this skill to add or modify Playwright tests under `frontend/product-agent/tests` and to run the E2E suite safely.

## Quick start

- Prefer the existing test patterns in `frontend/product-agent/tests/*.spec.ts`.
- Use stable selectors from `references/ui-selectors.md`.
- Use scenario briefs from `references/test-scenarios.md` to translate prompts into assertions.

## Workflow

1. Decide test type
   - Use smoke tests for non-live UI checks (landing page, settings persistence).
   - Use live E2E tests when the scenario depends on the backend or streaming (research plan approval, artifact rendering).

2. Pick a base pattern
   - For live tests, mirror `frontend/product-agent/tests/run-progress.e2e.spec.ts`.
   - For smoke tests, mirror `frontend/product-agent/tests/app-smoke.spec.ts` or `frontend/product-agent/tests/conversations.spec.ts`.

3. Implement assertions
   - Use role- or label-based selectors first.
   - Keep assertions UI-facing (visible text, status badges, buttons).
   - For approval flows, assert both the pending state and the response after clicking Approve/Reject.

4. Guard live tests
   - Gate live tests behind `E2E_LIVE=1` and skip if base URL is unreachable.
   - If prompt input is missing, skip with a clear reason (see live test patterns).

5. Run tests
   - Smoke tests: `npm run test -w frontend/product-agent`.
   - Live tests: `E2E_LIVE=1 npm run test -w frontend/product-agent`.
   - Targeted live file: `E2E_LIVE=1 npx playwright test tests/run-progress.e2e.spec.ts` (run inside `frontend/product-agent`).

## References

- UI selectors: `references/ui-selectors.md`
- Scenario briefs: `references/test-scenarios.md`

## Notes

- Live tests require a running backend with streaming enabled and valid API keys; follow the skip patterns used in `run-progress.e2e.spec.ts`.
- When validating settings persistence, confirm the Settings panel reflects saved values after reopening.
- For clarifying-question flows, accept either explicit question text or the "Needs Clarification" status badge.
