import { test, expect } from '@playwright/test';

test('clicking a conversation starter populates the prompt', async ({ page }) => {
  await page.goto('/');

  const starterText = 'Create a PRD for a mobile payment app';
  const starterButton = page.getByRole('button', { name: starterText });
  await expect(starterButton).toBeVisible();

  await starterButton.click();

  const promptInput = page.getByPlaceholder('Type your requirements or prompt...');
  await expect(promptInput).toHaveValue(starterText);
});
