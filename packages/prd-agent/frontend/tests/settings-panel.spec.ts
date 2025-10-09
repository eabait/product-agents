import { test, expect } from '@playwright/test';

test('settings panel exposes sub-agent overrides', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'Settings' }).click();

  const sheet = page.getByRole('dialog', { name: 'Settings' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Sub-agent Overrides')).toBeVisible();

  const firstSubAgentTrigger = sheet.getByRole('button', { name: /Context Analyzer/ }).first();
  await firstSubAgentTrigger.click();

  await expect(sheet.getByText('Defaults:', { exact: false })).toBeVisible();
  await expect(sheet.getByText('Context Analyzer')).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
});
