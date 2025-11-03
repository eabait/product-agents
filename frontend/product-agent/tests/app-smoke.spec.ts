import { test, expect } from '@playwright/test';

test('landing page renders primary controls', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Context' })).toBeVisible();
  await expect(page.locator('button[title="New PRD"]').first()).toBeVisible();
  await expect(page.getByPlaceholder('Type your requirements or prompt...')).toBeVisible();
});
