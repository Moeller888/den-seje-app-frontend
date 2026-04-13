import { test, expect } from '@playwright/test';

test('App health check - full flow', async ({ page }) => {
  await page.goto('https://den-seje-app-frontend.vercel.app/login.html');

  // Login
  await page.fill('input[type="email"]', 'christnmoeller@hotmail.com');
  await page.fill('input[type="password"]', 'Cmiciquru5');
  await page.click('button');

  // Vent på app
  await page.waitForSelector('#logout-btn');

  // Tjek at spørgsmål loader
  await page.waitForSelector('#question');

  const questionText = await page.locator('#question').innerText();
  expect(questionText.length).toBeGreaterThan(5);

  // Klik svar
  const btn = page.locator('#options button').first();
  await btn.click();

  // 🔥 Vent på at feedback får INDHOLD (ikke visibility)
  await page.waitForFunction(() => {
    const el = document.querySelector('#feedback');
    return el && el.textContent && el.textContent.length > 0;
  });

  const feedbackText = await page.locator('#feedback').innerText();
  expect(feedbackText.length).toBeGreaterThan(0);

  // Vent på nyt spørgsmål
  await page.waitForTimeout(1500);

  const newQuestion = await page.locator('#question').innerText();
  expect(newQuestion.length).toBeGreaterThan(5);
});