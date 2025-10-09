import { test, expect } from '@playwright/test';

test('creating a new conversation adds it to the list', async ({ page }) => {
  await page.goto('/');

  const conversationButtons = page.locator('button[title="New PRD"]');
  await expect(conversationButtons.first()).toBeVisible();
  const initialCount = await conversationButtons.count();

  await page.getByRole('button', { name: 'New' }).click();

  await expect(page.locator('button[title="New PRD"]')).toHaveCount(initialCount + 1);
});
