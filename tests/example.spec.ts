import { test, expect } from '@playwright/test';

test('Login and answer question flow works', async ({ page }) => {
  await page.goto('https://den-seje-app-frontend.vercel.app/login.html');

  await page.fill('input[type="email"]', 'christnmoeller@hotmail.com');
  await page.fill('input[type="password"]', 'Cmiciquru5');
  await page.click('button');

  await page.waitForSelector('#logout-btn', { timeout: 10000 });

  // 🔹 Vent på første spørgsmål
  const questionElement = page.locator('#question');
  await expect(questionElement).toBeVisible();

  const firstQuestionText = await questionElement.innerText();
  expect(firstQuestionText.length).toBeGreaterThan(5);

  // 🔹 Klik første svar
  const firstButton = page.locator('#options button').first();
  await expect(firstButton).toBeVisible();
  await firstButton.click();

  // 🔹 Vent på feedback
  const feedback = page.locator('#feedback');
  await expect(feedback).toBeVisible();

  const feedbackText = await feedback.innerText();
  expect(feedbackText.length).toBeGreaterThan(0);

  // 🔹 VIGTIGT: verificér at næste spørgsmål loader
  await page.waitForTimeout(1000); // hvis du loader async

  const secondQuestionText = await questionElement.innerText();

  expect(secondQuestionText).not.toBe(firstQuestionText);
});
