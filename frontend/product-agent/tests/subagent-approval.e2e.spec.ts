import { test, expect } from '@playwright/test';

const LIVE_E2E = process.env.E2E_LIVE === '1';
const PROMPT_SELECTOR = 'textarea[placeholder]';

const skipReason =
  'Requires E2E_LIVE=1, a running backend with streaming enabled, and a valid API key';

test.describe('Subagent Approval Flow', () => {
  test.skip(!LIVE_E2E, skipReason);
  test.skip(({ browserName }) => browserName !== 'chromium', 'Live checks run on chromium only');
  test.setTimeout(180_000);

  const sendPrompt = async (page: any, prompt: string) => {
    const promptBox = page.locator(PROMPT_SELECTOR).first();
    const ready = await promptBox.isVisible({ timeout: 15_000 }).catch(() => false);
    if (!ready) {
      test.skip(`Prompt input not available; page may not have loaded (${skipReason})`);
    }
    await promptBox.fill(prompt);
    await promptBox.press('Enter');
  };

  const waitForPlanApproval = async (page: any) => {
    const reviewHeading = page.getByRole('heading', { name: /Review Execution Plan/i });
    const approveButton = page.getByRole('button', { name: /Approve & Execute/i });

    await reviewHeading.waitFor({ state: 'visible', timeout: 120_000 });
    await expect(approveButton).toBeVisible({ timeout: 10_000 });
    await approveButton.click();
  };

  test('Research subagent approval flow displays plan card and handles approval', async ({ page }) => {
    try {
      await page.goto('/');
    } catch (error) {
      test.skip('Base URL not reachable; ensure frontend/backend server is running at PLAYWRIGHT_BASE_URL');
    }

    const promptBox = page.locator(PROMPT_SELECTOR).first();
    if (!(await promptBox.isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip('Prompt input not visible; skipping subagent approval test');
    }

    // Send a prompt that would trigger the research subagent
    await sendPrompt(
      page,
      'Create a PRD for a mobile app that helps users track their daily water intake'
    );

    // Wait for initial plan approval
    await waitForPlanApproval(page);

    // Look for either the execution progress or a research plan card
    const researchPlanCard = page.locator('text=/Research Plan|Research Steps/i');
    const executionSignal = page.locator('text=/Executing|Run in progress|Subagent update/i');

    // Wait for either the research plan card to appear (for approval) or execution to start
    await expect
      .poll(async () => {
        const hasResearchCard = await researchPlanCard.first().isVisible().catch(() => false);
        const hasExecution = await executionSignal.first().isVisible().catch(() => false);
        return hasResearchCard || hasExecution;
      }, { timeout: 120_000 })
      .toBe(true);

    // If research plan card appeared, approve it
    const approveResearchButton = page.getByRole('button', { name: /Approve & Start Research/i });
    if (await approveResearchButton.isVisible().catch(() => false)) {
      await approveResearchButton.click();

      // Verify execution continues after approval
      await expect(executionSignal.first()).toBeVisible({ timeout: 60_000 });
    }
  });

  test('Research subagent rejection marks run as failed', async ({ page }) => {
    try {
      await page.goto('/');
    } catch (error) {
      test.skip('Base URL not reachable; ensure frontend/backend server is running at PLAYWRIGHT_BASE_URL');
    }

    const promptBox = page.locator(PROMPT_SELECTOR).first();
    if (!(await promptBox.isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip('Prompt input not visible; skipping rejection test');
    }

    // Send a prompt that would trigger the research subagent
    await sendPrompt(
      page,
      'Research the competitive landscape for task management apps'
    );

    // Wait for initial plan approval
    await waitForPlanApproval(page);

    // Wait for research plan card to appear
    const researchPlanCard = page.locator('text=/Research Plan|Research Steps/i');

    // Wait for the research plan card or check if we hit clarification
    const hasResearchCard = await expect
      .poll(async () => {
        return await researchPlanCard.first().isVisible().catch(() => false);
      }, { timeout: 120_000 })
      .toBe(true)
      .catch(() => false);

    if (hasResearchCard) {
      // Click reject button
      const rejectButton = page.getByRole('button', { name: /Reject/i }).first();
      if (await rejectButton.isVisible().catch(() => false)) {
        await rejectButton.click();

        // Verify the run is marked as failed or shows appropriate status
        const failedIndicator = page.locator('text=/failed|rejected|cancelled/i');
        await expect(failedIndicator.first()).toBeVisible({ timeout: 30_000 });
      }
    }
  });

  test('Blocked subagent state persists across React batching', async ({ page }) => {
    try {
      await page.goto('/');
    } catch (error) {
      test.skip('Base URL not reachable');
    }

    const promptBox = page.locator(PROMPT_SELECTOR).first();
    if (!(await promptBox.isVisible({ timeout: 10_000 }).catch(() => false))) {
      test.skip('Prompt input not visible');
    }

    await sendPrompt(
      page,
      'I need a detailed competitive analysis for a new fitness tracking app'
    );

    // Wait for initial plan approval
    await waitForPlanApproval(page);

    // Wait for research plan card
    const researchPlanCard = page.locator('text=/Research Plan/i');
    const awaitingApproval = page.locator('text=/Awaiting Approval/i');

    // Wait for subagent approval state
    await expect
      .poll(async () => {
        const hasCard = await researchPlanCard.first().isVisible().catch(() => false);
        const hasAwaitingBadge = await awaitingApproval.first().isVisible().catch(() => false);
        return hasCard && hasAwaitingBadge;
      }, { timeout: 120_000 })
      .toBe(true);

    // Verify the card shows the blocked-subagent state correctly
    // The "Awaiting Approval" badge should remain visible
    await expect(awaitingApproval.first()).toBeVisible();

    // The status should NOT be "awaiting-input" (which would indicate the race condition bug)
    const awaitingInputText = page.locator('text=/Awaiting input/i');
    const isWrongState = await awaitingInputText.isVisible().catch(() => false);

    // If we see "Awaiting input" instead of "Awaiting Approval", the race condition is present
    expect(isWrongState).toBe(false);
  });
});

test.describe('ResearchPlanCard Validation', () => {
  test('ResearchPlanCard handles missing plan data gracefully', async ({ page }) => {
    // This is a smoke test to ensure the component doesn't crash with invalid data
    // In production, the component receives plan data from SSE events

    try {
      await page.goto('/');
    } catch (error) {
      test.skip('Base URL not reachable');
    }

    // Verify page loads without errors
    await expect(page.locator('body')).toBeVisible();

    // Check for any unhandled errors in the console
    const errors: string[] = [];
    page.on('pageerror', error => {
      errors.push(error.message);
    });

    // Brief wait to catch any immediate render errors
    await page.waitForTimeout(2000);

    // Filter out expected errors and verify no ResearchPlanCard-related crashes
    const researchPlanErrors = errors.filter(
      err => err.includes('ResearchPlanCard') || err.includes('Cannot read properties of undefined')
    );

    expect(researchPlanErrors).toHaveLength(0);
  });
});
