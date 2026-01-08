# UI Selectors & Anchors

Use stable, accessible selectors first (roles, labels, visible text). Fall back to CSS only when necessary.

## Global controls

- Settings button: `page.getByRole('button', { name: 'Settings' })`
- Context button: `page.getByRole('button', { name: 'Context' })`
- New PRD button: `page.locator('button[title="New PRD"]').first()`
- Prompt input: `page.getByPlaceholder('Type your requirements or prompt...')`
- Prompt input (generic): `page.locator('textarea[placeholder]')`

## Conversation starters

- Starter buttons: `page.getByRole('button', { name: <starterText> })`

## Progress / plan

- Plan outline text: `page.getByText(/Plan Outline/i)`
- Processing status: `page.getByText(/Processing your request/i)`

## Research plan card

- Card header: `page.getByRole('heading', { name: 'Research Plan' })`
- Awaiting approval badge: `page.getByText('Awaiting Approval')`
- Needs clarification badge: `page.getByText('Needs Clarification')`
- Approve action: `page.getByRole('button', { name: /Approve & Start Research/i })`
- Reject action: `page.getByRole('button', { name: 'Reject' })`

## Approval (generic plan review)

- Awaiting approval status: `page.getByText(/Awaiting approval/i)`
- Approve & Execute: `page.getByRole('button', { name: /Approve & Execute/i })`
- Reject: `page.getByRole('button', { name: 'Reject' })`

Notes:
- The research plan card lives under `frontend/product-agent/components/research/ResearchPlanCard.tsx`.
- Some approval flows are driven by progress cards in `frontend/product-agent/components/chat/ChatMessages.tsx`.
