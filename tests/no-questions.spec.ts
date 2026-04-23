import { test, expect } from '@playwright/test';

test('User can reach no questions state naturally', async ({ page }) => {
  await page.goto('https://den-seje-app-frontend.vercel.app/login.html');

  await page.fill('input[type="email"]', 'christnmoeller@hotmail.com');
  await page.fill('input[type="password"]', 'Cmiciquru5');
  await page.click('button');

  await page.waitForSelector('#logout-btn');

  const questionLocator = page.locator('#question');

  for (let i = 0; i < 50; i++) {
    await expect(questionLocator).toHaveAttribute('data-state', /ready|empty/, { timeout: 10000 });

    const state = await questionLocator.getAttribute('data-state');

    if (state === 'empty') {
      await expect(questionLocator).toContainText(/ingen flere spørgsmål/i);
      return;
    }

    const firstButton = page.locator('#options button').first();
    await expect(firstButton).toBeVisible({ timeout: 10000 });
    await firstButton.click();

    await expect(questionLocator).toHaveAttribute('data-state', 'loading', { timeout: 10000 });

    await expect(questionLocator).toHaveAttribute('data-state', /ready|empty/, { timeout: 10000 });
  }

  throw new Error('Reached max iterations without hitting no_questions');
});
