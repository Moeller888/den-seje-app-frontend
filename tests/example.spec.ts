import { test, expect } from '@playwright/test';

test('Login and answer question', async ({ page }) => {
  // Gå til login
  await page.goto('https://den-seje-app-frontend.vercel.app/login.html');

  // Login (rent og stabilt)
  await page.fill('input[type="email"]', 'christnmoeller@hotmail.com');
  await page.fill('input[type="password"]', 'Cmiciquru5');
  await page.click('button');

  // Vent på appen er loaded
  await page.waitForSelector('#logout-btn', { timeout: 10000 });

  // Vent på spørgsmål
  await page.waitForSelector('#question');

  // Klik på første svar-knap
  const firstButton = page.locator('#options button').first();
  await firstButton.click();

  // Vent på feedback vises
  await page.waitForSelector('#feedback');

  const feedbackText = await page.locator('#feedback').innerText();

  // Verificér at der kommer feedback
  expect(feedbackText.length).toBeGreaterThan(0);
});