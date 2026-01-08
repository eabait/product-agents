# Test Scenarios

Use these scenario briefs to drive Playwright test cases. Keep assertions UI-facing and stable (roles, labels, visible text).

## Research run with plan approval/rejection

Prompt:
- "Research healthcare market in LATAM for CRMs"

Goals:
- A research plan card appears with "Research Plan" header and "Awaiting Approval" badge.
- "Approve & Start Research" and "Reject" buttons are visible.
- Approve path: clicking "Approve & Start Research" should start execution (look for progress text or a status shift away from pending approval).
- Reject path: clicking "Reject" should add a system/user message requesting a new research request or similar clarification.

Notes:
- This flow likely requires E2E_LIVE=1, a running backend, and valid API key.
- If status is "awaiting-clarification", ensure the "Needs Clarification" badge renders and the approve/reject buttons are not shown.

## Settings persistence and validation

Prompt:
- "Check if the settings works"

Goals:
- Open Settings, change a setting (model, temperature, max tokens, streaming toggle), close panel, reopen and confirm the selection persists.
- Optionally validate local storage key `prd-agent-settings` updates when settings change.

Notes:
- Prefer role-based selectors for Settings button and labeled controls.

## Conversation artifacts visibility

Prompt:
- "Validate that conversations are showing all the correct artifacts"

Goals:
- Run a prompt that produces multiple artifact cards (PRD, persona, research) and verify cards render with correct titles/labels.
- Ensure progress cards update status (e.g., Plan Outline, Processing your request) and artifacts appear in the conversation timeline.

Notes:
- Use a live run or seed the conversation via API/test fixtures if available.

## Clarifying questions when context is low

Prompt:
- "Validate agent is asking clarifying questions when it has little context"

Goals:
- Send a minimal prompt (e.g., "Build something for me") and verify the UI renders a clarification request.
- Look for explicit question text or an "awaiting-input"/"Needs Clarification" status on a card.

Notes:
- Some clarifications come through research plan cards with the "Needs Clarification" badge.

## Settings regression smoke

Prompt:
- "Check if the settings works"

Goals:
- Settings button is visible on landing page.
- Streaming toggle reflects default from backend / agent defaults payload.

Notes:
- Keep this as a quick, non-live test if possible.
