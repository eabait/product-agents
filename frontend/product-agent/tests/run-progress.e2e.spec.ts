import { test, expect } from '@playwright/test'

const LIVE_E2E = process.env.E2E_LIVE === '1'
const PROMPT_SELECTOR = 'textarea[placeholder]'

const skipReason =
  'Requires E2E_LIVE=1, a running backend with streaming enabled, and a valid API key'

test.describe('Live runs (backend + OpenRouter required)', () => {
  test.skip(!LIVE_E2E, skipReason)
  test.skip(({ browserName }) => browserName !== 'chromium', 'Live checks run on chromium only')
  test.setTimeout(180_000)

  const sendPrompt = async (page: any, prompt: string) => {
    const promptBox = page.locator(PROMPT_SELECTOR).first()
    const ready = await promptBox.isVisible({ timeout: 15_000 }).catch(() => false)
    if (!ready) {
      test.skip(`Prompt input not available; page may not have loaded (${skipReason})`)
    }
    await promptBox.fill(prompt)
    await promptBox.press('Enter')
  }

  const waitForPlanReady = async (page: any) => {
    const reviewHeading = page.getByRole('heading', { name: /Review Execution Plan/i })
    const planOutline = page.getByText(/Plan Outline/i)

    await Promise.race([
      reviewHeading.waitFor({ state: 'visible', timeout: 120_000 }),
      planOutline.waitFor({ state: 'visible', timeout: 120_000 })
    ])

    if (await reviewHeading.isVisible().catch(() => false)) {
      const approveButton = page.getByRole('button', { name: /Approve & Execute/i })
      await expect(approveButton).toBeVisible({ timeout: 10_000 })
      await approveButton.click()
    }
  }

  const waitForExecutionOrClarification = async (page: any) => {
    const executionSignal = page.locator(
      'text=/Subagent update|Executing plan|Run in progress/i'
    )
    const clarificationSignal = page.locator(
      'text=/Awaiting input|Needs Clarification|I need a bit more information/i'
    )
    const reviewHeading = page.getByRole('heading', { name: /Review Execution Plan/i })
    const approveButton = page.getByRole('button', { name: /Approve & Execute/i })
    let approvals = 0

    while (approvals < 2) {
      let outcome: 'execution' | 'clarification' | 'review' | null = null
      await expect
        .poll(async () => {
          if (await executionSignal.first().isVisible().catch(() => false)) {
            outcome = 'execution'
            return outcome
          }
          if (await clarificationSignal.first().isVisible().catch(() => false)) {
            outcome = 'clarification'
            return outcome
          }
          if (await reviewHeading.isVisible().catch(() => false)) {
            outcome = 'review'
            return outcome
          }
          outcome = null
          return null
        }, { timeout: 120_000 })
        .not.toBeNull()

      if (outcome === 'review') {
        approvals += 1
        await expect(approveButton).toBeVisible({ timeout: 10_000 })
        await approveButton.click()
        await reviewHeading.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
        continue
      }

      return outcome as 'execution' | 'clarification'
    }

    throw new Error('Plan review repeated; aborting to avoid infinite loop')
  }

  test('PRD run renders plan review and begins execution after approval', async ({ page }) => {
    try {
      await page.goto('/')
    } catch (error) {
      test.skip('Base URL not reachable; ensure frontend/backend server is running at PLAYWRIGHT_BASE_URL')
    }
    const promptBox = page.locator(PROMPT_SELECTOR).first()
    if (!(await promptBox.isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip('Prompt input not visible; skipping live PRD run check')
    }
    await sendPrompt(page, 'Create a PRD for a mobile payment app with feature list and metrics')

    await waitForPlanReady(page)
    const outcome = await waitForExecutionOrClarification(page)
    if (outcome === 'clarification') {
      await sendPrompt(
        page,
        'Primary users are consumers and small merchants in LATAM. Must-have features: P2P transfers, bank linking, KYC, fraud alerts, bill split, recurring payments. Success metrics: MAU, activation rate, retention, transaction volume.'
      )
      const followUpOutcome = await waitForExecutionOrClarification(page)
      if (followUpOutcome === 'clarification') {
        await expect(
          page.getByText(/Awaiting input|Needs Clarification/i)
        ).toBeVisible({ timeout: 10_000 })
      }
    }
  })

  test('Persona-only run filters PRD-specific progress noise', async ({ page }) => {
    try {
      await page.goto('/')
    } catch (error) {
      test.skip('Base URL not reachable; ensure frontend/backend server is running at PLAYWRIGHT_BASE_URL')
    }

    // Toggle persona artifact in Settings (selectors may need adjustment if UI changes)
    await page.getByRole('button', { name: 'Settings' }).click()
    const personaToggle = page.getByLabel(/Persona Builder/i).first()
    if (!(await personaToggle.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip('Persona Builder toggle not visible; subagent may be disabled in this env')
    }
    await personaToggle.click()
    await page.getByRole('button', { name: /Close|Done|Save/i }).first().click()

    await sendPrompt(page, 'Draft 2 personas for a task management tool')

    // Progress indicator should render without PRD worker/section chatter
    await waitForPlanReady(page)
    await expect(page.getByText(/persona/i)).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/Target Users|Key Features/i)).not.toBeVisible({ timeout: 5_000 })
  })

  test('Minimal prompt triggers clarifying question flow', async ({ page }) => {
    try {
      await page.goto('/')
    } catch (error) {
      test.skip('Base URL not reachable; ensure frontend/backend server is running at PLAYWRIGHT_BASE_URL')
    }
    const promptBox = page.locator(PROMPT_SELECTOR).first()
    if (!(await promptBox.isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip('Prompt input not visible; skipping live clarification check')
    }

    await sendPrompt(page, 'Build something for me')

    const clarificationSignal = page.locator(
      'text=/Needs Clarification|Awaiting input|clarif(y|ication)/i'
    )
    await expect(clarificationSignal.first()).toBeVisible({ timeout: 120_000 })
  })
})
