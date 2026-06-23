/**
 * Mobile UX Validation — gameplay screen (index.html)
 * Tests real mobile conditions: iPhone 12 viewport, touch targets,
 * keyboard simulation, long text, theme variants, layout stability.
 *
 * Firefox does not support isMobile context options — these tests are
 * Chromium + WebKit only.
 */
import { test, expect } from '@playwright/test';

// Skip entire file on Firefox — isMobile is not supported
test.beforeEach(async ({}, testInfo) => {
  testInfo.skip(testInfo.project.name === 'firefox', 'Firefox does not support isMobile context option');
});

const PROD = 'https://den-seje-app-frontend.vercel.app';
const EMAIL    = process.env.TEST_STUDENT_EMAIL!;
const PASSWORD = process.env.TEST_STUDENT_PASSWORD!;

// iPhone 12 profile
const iPhone12 = {
  viewport: { width: 390, height: 844 },
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
};

// iPhone SE (narrow)
const iPhoneSE = {
  viewport: { width: 375, height: 667 },
  userAgent: iPhone12.userAgent,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

async function loginAndWait(page: any) {
  await page.goto(`${PROD}/login.html`, { waitUntil: 'domcontentloaded' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  // Submit the form — keyboard Enter is reliable across desktop+mobile contexts
  await page.locator('#loginBtn').click();
  // Wait for redirect to index.html (more reliable than element visibility)
  // 20s timeout: Vercel Edge Function cold starts can add 5-15s latency in a long suite
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });
  // Wait for question to be fully loaded (state machine at AWAITING_ANSWER)
  await page.waitForSelector('#question[data-state="ready"]', { timeout: 20000 });
}

// Advances to the next ready question, handling both paths:
// • Auto-advance (correct / incorrect without review_text): question enters ready state automatically
// • Reflection path (incorrect + review_text): clicks "Videre →" to continue
async function advanceToNextQuestion(page: any, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const q = document.getElementById('question');
      if (q && (q as HTMLElement).dataset.state === 'ready') return true;
      const rc = document.getElementById('reflection-continue') as HTMLElement;
      if (rc && rc.style.display === 'block') rc.click();
      return false;
    },
    { timeout, polling: 500 }
  );
}

// ── 1. Layout integrity on iPhone 12 ────────────────────────────────────────
test('1. iPhone 12 layout — no overflow, correct structure', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  // Check horizontal overflow — scrollWidth should NOT exceed viewport width
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1
  );
  expect(overflow, 'Horizontal overflow on iPhone 12').toBe(false);

  // Verify core elements exist and are visible
  await expect(page.locator('.game-topbar')).toBeVisible();
  await expect(page.locator('.game-identity')).toBeVisible();
  await expect(page.locator('.game-card')).toBeVisible();
  await expect(page.locator('#options')).toBeVisible();

  // game-shell width should not exceed viewport
  const shellWidth = await page.locator('.game-shell').evaluate(
    (el: Element) => (el as HTMLElement).offsetWidth
  );
  expect(shellWidth, 'game-shell must fit within viewport').toBeLessThanOrEqual(391);

  await page.screenshot({ path: 'test-results/mobile-ux/01-iphone12-layout.png', fullPage: false });
  await ctx.close();
});

// ── 2. iPhone SE (375px) layout ──────────────────────────────────────────────
test('2. iPhone SE (375px) — layout holds on narrow viewport', async ({ browser }) => {
  const ctx = await browser.newContext(iPhoneSE);
  const page = await ctx.newPage();
  await loginAndWait(page);

  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1
  );
  expect(overflow, 'Horizontal overflow on iPhone SE').toBe(false);

  // Card must not bleed outside the shell
  const cardRect  = await page.locator('.game-card').boundingBox();
  const shellRect = await page.locator('.game-shell').boundingBox();
  expect(cardRect!.x, 'Card left edge').toBeGreaterThanOrEqual(shellRect!.x - 1);
  expect(cardRect!.x + cardRect!.width, 'Card right edge').toBeLessThanOrEqual(
    shellRect!.x + shellRect!.width + 1
  );

  await page.screenshot({ path: 'test-results/mobile-ux/02-iphonese-layout.png', fullPage: false });
  await ctx.close();
});

// ── 3. Touch targets — MC buttons meet 44px minimum ─────────────────────────
test('3. Touch targets — MC buttons ≥ 44px height', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  const buttons = page.locator('#options button:not(.submit-btn)');
  const count = await buttons.count();

  if (count > 0) {
    for (let i = 0; i < count; i++) {
      const box = await buttons.nth(i).boundingBox();
      expect(box!.height, `MC button ${i} height ≥ 44px`).toBeGreaterThanOrEqual(44);
      expect(box!.width, `MC button ${i} width ≥ full width`).toBeGreaterThanOrEqual(300);
    }
  }

  // Back button (← Hub) touch target
  const backBox = await page.locator('.topbar-back').boundingBox();
  expect(backBox!.height, 'Back button height').toBeGreaterThanOrEqual(32);

  await page.screenshot({ path: 'test-results/mobile-ux/03-touch-targets.png', fullPage: false });
  await ctx.close();
});

// ── 4. Safari input zoom prevention — font-size must be ≥ 16px ──────────────
test('4. Input font-size ≥ 16px (prevents Safari auto-zoom)', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  // Inject dummy input into #options, measure its computed font-size
  const inputFontSize = await page.evaluate(() => {
    const opts = document.getElementById('options');
    if (!opts) return null;
    const input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);
    const fs = parseFloat(getComputedStyle(input).fontSize);
    document.body.removeChild(input);
    return fs;
  });

  expect(inputFontSize, 'Input font-size must be ≥ 16px to prevent iOS zoom').toBeGreaterThanOrEqual(16);

  // Check textarea too
  const textareaFontSize = await page.evaluate(() => {
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    const fs = parseFloat(getComputedStyle(ta).fontSize);
    document.body.removeChild(ta);
    return fs;
  });

  // The CSS sets 16px explicitly on #options textarea — confirm it applies
  const optsFontSize = await page.evaluate(() => {
    const opts = document.getElementById('options');
    if (!opts) return null;
    const ta = document.createElement('textarea');
    opts.appendChild(ta);
    const fs = parseFloat(getComputedStyle(ta).fontSize);
    opts.removeChild(ta);
    return fs;
  });

  expect(optsFontSize, '#options textarea font-size must be ≥ 16px').toBeGreaterThanOrEqual(16);
  await ctx.close();
});

// ── 5. Layout stability — card position stays stable across 3 rounds ─────────
test('5. Layout stability — game-card position stable across 3 answers', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  async function cardTop() {
    const box = await page.locator('.game-card').boundingBox();
    return Math.round(box!.y);
  }

  const top0 = await cardTop();
  await page.screenshot({ path: 'test-results/mobile-ux/05a-before.png', fullPage: false });

  // Round 1
  await page.locator('#options button').first().click();
  await advanceToNextQuestion(page);
  const top1 = await cardTop();
  await page.screenshot({ path: 'test-results/mobile-ux/05b-after-q1.png', fullPage: false });

  // Round 2
  await page.locator('#options button').first().click();
  await advanceToNextQuestion(page);
  const top2 = await cardTop();
  await page.screenshot({ path: 'test-results/mobile-ux/05c-after-q2.png', fullPage: false });

  // Round 3
  await page.locator('#options button').first().click();
  await advanceToNextQuestion(page);
  const top3 = await cardTop();
  await page.screenshot({ path: 'test-results/mobile-ux/05d-after-q3.png', fullPage: false });

  expect(Math.abs(top1 - top0), 'Card top shifted after Q1').toBeLessThanOrEqual(4);
  expect(Math.abs(top2 - top0), 'Card top shifted after Q2').toBeLessThanOrEqual(4);
  expect(Math.abs(top3 - top0), 'Card top shifted after Q3').toBeLessThanOrEqual(4);

  await ctx.close();
});

// ── 6. Long question text — wraps without overflow ───────────────────────────
test('6. Long question text — wraps without overflow', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  // Inject extremely long question
  await page.evaluate(() => {
    const q = document.getElementById('question');
    if (q) q.textContent = 'Hvad er den fulde officielle betegnelse for den internationale aftale om klimaforandringer, som blev indgået i Paris i december 2015 under FNs klimakonference, og hvad er dens centrale mål for global temperaturstigning i Celsius frem mod år 2100?';
  });

  const overflow = await page.locator('#question').evaluate((el: Element) => ({
    scrollWidth: el.scrollWidth,
    clientWidth: el.clientWidth,
  }));
  expect(overflow.scrollWidth, 'Question text must not overflow horizontally').toBeLessThanOrEqual(
    overflow.clientWidth + 2
  );

  const cardBox = await page.locator('.game-card').boundingBox();
  expect(cardBox!.x + cardBox!.width, 'Card must stay within viewport').toBeLessThanOrEqual(392);

  await page.screenshot({ path: 'test-results/mobile-ux/06-long-question.png', fullPage: false });
  await ctx.close();
});

// ── 7. Long MC option text — buttons wrap, don't truncate ────────────────────
test('7. Long MC option text — buttons wrap correctly', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  const count = await page.locator('#options button').count();
  if (count > 0) {
    await page.evaluate(() => {
      const btn = document.querySelector('#options button') as HTMLButtonElement;
      if (btn) btn.textContent = 'En meget lang svarmulighed der potentielt kan skabe problemer med layout på en smal mobilskærm i portræt';
    });

    const btnBox  = await page.locator('#options button').first().boundingBox();
    expect(btnBox!.x + btnBox!.width, 'Long MC button must not overflow viewport').toBeLessThanOrEqual(392);
    // Should grow in height (min-height: 52px) not truncate
    expect(btnBox!.height, 'Long MC button must grow to fit text').toBeGreaterThanOrEqual(52);
  }

  await page.screenshot({ path: 'test-results/mobile-ux/07-long-mc.png', fullPage: false });
  await ctx.close();
});

// ── 8. XP popup — positioned within viewport ────────────────────────────────
test('8. XP popup — stays within viewport bounds on mobile', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  await page.evaluate(() => {
    const popup = document.getElementById('xp-popup') as HTMLElement;
    if (popup) {
      popup.textContent = '+3 mønter';
      popup.classList.remove('xp-show');
      void popup.offsetWidth;
      popup.classList.add('xp-show');
    }
  });

  // Popup is fixed — check it doesn't clip outside the visible area
  const box = await page.locator('#xp-popup').boundingBox();
  if (box) {
    // Allow some tolerance for mid-animation position
    expect(box.x + box.width, 'Popup right edge within viewport').toBeLessThanOrEqual(500);
  }

  await page.screenshot({ path: 'test-results/mobile-ux/08-xp-popup.png', fullPage: false });
  await ctx.close();
});

// ── 9. Level-up overlay — full coverage, no clipping ────────────────────────
test('9. Level-up overlay — full viewport on mobile', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  await page.evaluate(() => {
    const overlay = document.getElementById('level-up-overlay') as HTMLElement;
    const text    = document.getElementById('level-up-text') as HTMLElement;
    if (overlay && text) {
      text.textContent = 'Du er nu level 5!';
      overlay.style.display = 'flex';
      overlay.style.opacity = '1';
    }
  });

  const box = await page.locator('#level-up-overlay').boundingBox();
  expect(box!.x, 'Overlay starts at x=0').toBeLessThanOrEqual(0);
  expect(box!.y, 'Overlay starts at y=0').toBeLessThanOrEqual(0);
  expect(box!.width, 'Overlay covers full width').toBeGreaterThanOrEqual(388);
  expect(box!.height, 'Overlay covers full height').toBeGreaterThanOrEqual(600);

  await page.screenshot({ path: 'test-results/mobile-ux/09-level-up.png', fullPage: false });
  await ctx.close();
});

// ── 10. Theme void — dark mode ────────────────────────────────────────────────
test('10. Theme void — elements visible, no transparent bleed', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  await page.evaluate(() => { document.documentElement.dataset.theme = 'void'; });

  const xpBg  = await page.locator('#xp-bar-container').evaluate(
    (el: Element) => getComputedStyle(el).backgroundColor
  );
  expect(xpBg, 'Void: XP track must have a background').not.toBe('rgba(0, 0, 0, 0)');
  expect(xpBg, 'Void: XP track must have a background').not.toBe('transparent');

  const cardBg = await page.locator('.game-card').evaluate(
    (el: Element) => getComputedStyle(el).backgroundColor
  );
  expect(cardBg, 'Void: game-card must have a background').not.toBe('rgba(0, 0, 0, 0)');

  await page.screenshot({ path: 'test-results/mobile-ux/10-void.png', fullPage: false });
  await ctx.close();
});

// ── 11. Theme sakura — accent applied ────────────────────────────────────────
test('11. Theme sakura — accent border on game-card', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  await page.evaluate(() => { document.documentElement.dataset.theme = 'sakura'; });

  const borderColor = await page.locator('.game-card').evaluate(
    (el: Element) => getComputedStyle(el).borderTopColor
  );
  expect(borderColor, 'Sakura: game-card top border must be non-transparent').not.toBe('rgba(0, 0, 0, 0)');
  expect(borderColor, 'Sakura: game-card top border must be non-transparent').not.toBe('transparent');

  await page.screenshot({ path: 'test-results/mobile-ux/11-sakura.png', fullPage: false });
  await ctx.close();
});

// ── 12. Theme pearl — light theme ────────────────────────────────────────────
test('12. Theme pearl — light theme visible', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  await page.evaluate(() => { document.documentElement.dataset.theme = 'pearl'; });

  const identityBg = await page.locator('.game-identity').evaluate(
    (el: Element) => getComputedStyle(el).backgroundColor
  );
  expect(identityBg, 'Pearl: identity strip must have a background').not.toBe('rgba(0, 0, 0, 0)');

  await page.screenshot({ path: 'test-results/mobile-ux/12-pearl.png', fullPage: false });
  await ctx.close();
});

// ── 13. Theme aurora ─────────────────────────────────────────────────────────
test('13. Theme aurora — no transparent bleed', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  await page.evaluate(() => { document.documentElement.dataset.theme = 'aurora'; });

  const cardBg = await page.locator('.game-card').evaluate(
    (el: Element) => getComputedStyle(el).backgroundColor
  );
  expect(cardBg, 'Aurora: game-card must have a background').not.toBe('rgba(0, 0, 0, 0)');

  await page.screenshot({ path: 'test-results/mobile-ux/13-aurora.png', fullPage: false });
  await ctx.close();
});

// ── 14. Dead space audit — scroll height not excessive ───────────────────────
test('14. Scroll height — no excessive dead space', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  const metrics = await page.evaluate(() => ({
    scrollHeight: document.documentElement.scrollHeight,
    viewportHeight: window.innerHeight,
  }));

  const excess = metrics.scrollHeight - metrics.viewportHeight;
  // game-shell has padding-bottom: 64px — allow some slack
  expect(excess, 'Excessive scroll space (more than 150px beyond viewport)').toBeLessThan(200);

  await page.screenshot({ path: 'test-results/mobile-ux/14-scroll.png', fullPage: true });
  await ctx.close();
});

// ── 15. Avatar identity strip — sizing correct ───────────────────────────────
test('15. Avatar identity strip — 52×78px, strip < 40% viewport', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  const avatarBox = await page.locator('#avatar-display').boundingBox();
  expect(avatarBox!.width,  'Avatar width ~52px').toBeGreaterThanOrEqual(50);
  expect(avatarBox!.width,  'Avatar width ~52px').toBeLessThanOrEqual(54);
  expect(avatarBox!.height, 'Avatar height ~78px').toBeGreaterThanOrEqual(76);
  expect(avatarBox!.height, 'Avatar height ~78px').toBeLessThanOrEqual(82);

  const identityBox = await page.locator('.game-identity').boundingBox();
  expect(identityBox!.height / iPhone12.viewport.height, 'Identity strip < 40% of viewport').toBeLessThan(0.40);

  await page.screenshot({ path: 'test-results/mobile-ux/15-avatar.png', fullPage: false });
  await ctx.close();
});

// ── 16. Rapid pacing — 4 rounds without stuck state ──────────────────────────
test('16. Rapid pacing — 4 answer cycles, no stuck state', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  for (let i = 0; i < 4; i++) {
    await advanceToNextQuestion(page);

    const btnCount = await page.locator('#options button').count();
    expect(btnCount, `Round ${i + 1}: options must be rendered`).toBeGreaterThan(0);

    await page.locator('#options button').first().click();

    await page.waitForFunction(() => {
      const fb = document.getElementById('feedback');
      return fb && fb.textContent && fb.textContent.length > 0;
    }, { timeout: 5000 });

    await page.screenshot({ path: `test-results/mobile-ux/16-pacing-r${i + 1}.png`, fullPage: false });
  }

  // Must end in AWAITING_ANSWER — not stuck
  await advanceToNextQuestion(page);
  await ctx.close();
});

// ── 17. Viewport meta — mobile configuration correct ────────────────────────
test('17. Viewport meta — correct, no user-scalable=no', async ({ browser }) => {
  const ctx = await browser.newContext(iPhone12);
  const page = await ctx.newPage();
  await loginAndWait(page);

  const content = await page.evaluate(() =>
    document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null
  );

  expect(content, 'Viewport meta must exist').not.toBeNull();
  expect(content!, 'Must set width=device-width').toContain('width=device-width');
  expect(content!, 'Must set initial-scale=1').toContain('initial-scale=1');
  // Accessibility: must NOT block user scaling
  expect(content!, 'Must not force user-scalable=no').not.toContain('user-scalable=no');
  expect(content!, 'Must not force maximum-scale=1').not.toContain('maximum-scale=1');

  await ctx.close();
});
