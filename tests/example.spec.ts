import { test, expect } from '@playwright/test';

test('Login and answer question flow works', async ({ page }) => {
  await page.goto('https://den-seje-app-frontend.vercel.app/login.html');

  await page.fill('input[type="email"]', 'christnmoeller@hotmail.com');
  await page.fill('input[type="password"]', 'Cmiciquru5');
  await page.click('button');

  // Wait for state machine to reach AWAITING_ANSWER (question fully loaded)
  // logout-btn is intentionally hidden in the mobile redesign — use the state machine as the loaded signal
  await page.waitForSelector('#question[data-state="ready"]', { timeout: 15000 });

  const questionElement = page.locator('#question');
  const firstQuestionText = await questionElement.innerText();
  expect(firstQuestionText.length).toBeGreaterThan(5);

  // Click first answer
  const firstButton = page.locator('#options button').first();
  await expect(firstButton).toBeVisible();
  await firstButton.click();

  // Wait for feedback
  const feedback = page.locator('#feedback');
  await expect(feedback).toBeVisible();

  const feedbackText = await feedback.innerText();
  expect(feedbackText.length).toBeGreaterThan(0);

  // Wait for state machine to reach AWAITING_ANSWER with the next question
  await page.waitForSelector('#question[data-state="ready"]');

  const secondQuestionText = await questionElement.innerText();
  expect(secondQuestionText).not.toBe(firstQuestionText);
});
