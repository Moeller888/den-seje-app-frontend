import { test, expect } from '@playwright/test';

test('Login and answer question flow works', async ({ page }) => {
  await page.goto('https://den-seje-app-frontend.vercel.app/login.html');

  await page.fill('input[type="email"]', process.env.TEST_STUDENT_EMAIL!);
  await page.fill('input[type="password"]', process.env.TEST_STUDENT_PASSWORD!);
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

  // Wait for system response — feedback text (correct/incorrect/pending) OR reflection panel
  // (reflection panel replaces #feedback after 400ms for incorrect+review_text answers;
  //  using waitForFunction handles both paths without a narrow timing dependency)
  await page.waitForFunction(
    () => {
      const fb = document.getElementById('feedback');
      const rc = document.getElementById('reflection-continue');
      const hasFeedback = (fb?.textContent ?? '').trim().length > 0;
      const hasReflection = rc?.style.display === 'block';
      return hasFeedback || hasReflection;
    },
    { timeout: 15000 }
  );

  // Navigate to next question — handles both paths:
  // • Auto-advance (correct / incorrect without review_text): question enters ready state automatically
  // • Reflection path (incorrect + review_text): "Videre →" button must be clicked to continue
  await page.waitForFunction(
    () => {
      const q = document.getElementById('question');
      if (q && q.dataset.state === 'ready') return true;
      const rc = document.getElementById('reflection-continue');
      if (rc && rc.style.display === 'block') rc.click();
      return false;
    },
    { timeout: 30000, polling: 500 }
  );

  const secondQuestionText = await questionElement.innerText();
  expect(secondQuestionText).not.toBe(firstQuestionText);
});
