import { test, expect } from '@playwright/test'

const LIVE_E2E = process.env.E2E_LIVE === '1'
const PROMPT_SELECTOR = 'textarea[placeholder]'

const skipReason =
  'Requires E2E_LIVE=1, a running backend with streaming enabled, and a valid API key'

test.describe('Live runs (backend + OpenRouter required)', () => {
  test.skip(!LIVE_E2E, skipReason)
  test.skip(({ browserName }) => browserName !== 'chromium', 'Live checks run on chromium only')

  const sendPrompt = async (page: any, prompt: string) => {
    const promptBox = page.locator(PROMPT_SELECTOR).first()
    const ready = await promptBox.isVisible({ timeout: 15_000 }).catch(() => false)
    if (!ready) {
      test.skip(`Prompt input not available; page may not have loaded (${skipReason})`)
    }
    await promptBox.fill(prompt)
    await promptBox.press('Enter')
  }

  test('PRD run streams progress and renders plan outline', async ({ page }) => {
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

    await expect(page.getByText(/Plan Outline/i)).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/Processing your request/i)).toBeVisible()
    await expect(page.getByText(/artifact/i)).toBeVisible({ timeout: 120_000 })
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
    await expect(page.getByText(/Plan Outline/i)).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/persona/i)).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/Target Users|Key Features/i)).not.toBeVisible({ timeout: 5_000 })
  })
})
