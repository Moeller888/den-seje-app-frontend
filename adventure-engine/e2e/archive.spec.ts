import { expect, test, type FrameLocator, type Page } from "@playwright/test";

/**
 * Arkivskabet (D-307 Trin A): the whole chain in a browser, on two real origins —
 * the host page on 127.0.0.1:4320 and the game iframe on 127.0.0.1:4321.
 *
 * The "server" is the TEST ADAPTER (FakeTaskService) in the host page. These tests prove the bridge, the
 * world binding and the isolation; they prove nothing about Lærlig's backend.
 */
const HOST = "http://127.0.0.1:4320";
const GAME = "http://127.0.0.1:4321";

const game = (page: Page): FrameLocator => page.frameLocator("#lv-game");

async function startGame(page: Page): Promise<FrameLocator> {
  await page.goto(`${HOST}/host.html?motion=off`);
  const f = game(page);
  await expect(f.locator("#lv-connection")).toHaveText("Forbundet");
  await f.locator("#start").click();
  await confirmLine(page, "line.intro");
  return f;
}

async function confirmLine(page: Page, key: string): Promise<void> {
  const bubble = game(page).locator(".bubble");
  await expect(bubble).toHaveAttribute("data-key", key, { timeout: 30_000 });
  await bubble.focus().catch(() => undefined);
  await page.keyboard.press("Enter");
}

/** Walk to the cabinet through the keyboard-accessible list of things in the scene. */
async function useCabinet(page: Page): Promise<void> {
  const f = game(page);
  await expect(f.locator("#game")).toHaveAttribute("data-idle", "true", { timeout: 30_000 });
  const button = f.locator('[data-hotspot="object:cabinet"]');
  await button.focus();
  await page.keyboard.press("Enter");
}

async function openTask(page: Page): Promise<FrameLocator> {
  const f = await startGame(page);
  await useCabinet(page);
  await confirmLine(page, "line.cabinet_locked");
  await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open");
  return f;
}

async function ledger(page: Page): Promise<{ xp: string; coins: string; graded: string }> {
  return {
    xp: (await page.locator("#ledger-xp").textContent()) ?? "",
    coins: (await page.locator("#ledger-coins").textContent()) ?? "",
    graded: (await page.locator("#ledger-graded").textContent()) ?? "",
  };
}

test.describe("Arkivskabet — a meaningful action in the world, graded through the bridge", () => {
  test("committed source choice → host grades → reward once → the cabinet opens", async ({ page }) => {
    const f = await openTask(page);
    await expect(f.locator("#lv-prompt")).toContainText("9. april 1940");
    await expect(f.locator("#lv-mode")).toHaveText("Selvstændig opgave");
    // Choosing is not answering: the commit button decides (commit point).
    await f.locator('.lv-card[data-option="kilde_b"]').click();
    await f.locator('.lv-card[data-option="kilde_a"]').click();
    await expect(f.locator('.lv-card[aria-pressed="true"]')).toHaveCount(1);
    expect(await ledger(page)).toEqual({ xp: "0", coins: "0", graded: "0" });
    await f.locator("#lv-commit").click();
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await expect(f.locator("#lv-feedback-text")).toContainText("ro og orden");
    await expect(f.locator("#lv-evidence")).toHaveAttribute("data-evidence", "evidence");
    await expect.poll(() => ledger(page)).toEqual({ xp: "10", coins: "5", graded: "1" });
    // The world reacts to the verdict.
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.unlocked");
    await useCabinet(page);
    await confirmLine(page, "line.cabinet_is_open");
    expect(await ledger(page)).toEqual({ xp: "10", coins: "5", graded: "1" });
  });

  test("a wrong source is graded incorrect, pays nothing, shows the right answer, and the cabinet stays locked", async ({ page }) => {
    const f = await openTask(page);
    await f.locator('.lv-card[data-option="kilde_d"]').click();
    await f.locator("#lv-commit").click();
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "incorrect");
    await expect(f.locator("#lv-correct")).toContainText("Proklamationen fra kongen og regeringen");
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.still_locked");
    expect(await ledger(page)).toEqual({ xp: "0", coins: "0", graded: "1" });
  });

  test("a hint comes from the host, and the same right answer then counts as practice", async ({ page }) => {
    const f = await openTask(page);
    await f.locator("#lv-hint").click();
    await expect(f.locator('#lv-hints li[data-level="1"]')).toHaveText("Hvem bestemte, hvad befolkningen skulle gøre?");
    await f.locator('.lv-card[data-option="kilde_a"]').click();
    await f.locator("#lv-commit").click();
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await expect(f.locator("#lv-evidence")).toHaveAttribute("data-evidence", "practice");
  });

  test("network failure: the game shows the abort, and 'send again' delivers the original answer once", async ({ page }) => {
    const f = await openTask(page);
    await page.locator("#inject-network").click();
    await f.locator('.lv-card[data-option="kilde_a"]').click();
    await f.locator("#lv-commit").click();
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "aborted", { timeout: 20_000 });
    await expect(f.locator("#lv-retry")).toBeVisible();
    expect((await ledger(page)).graded).toBe("0");
    await f.locator("#lv-retry").click();
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await expect.poll(() => ledger(page)).toEqual({ xp: "10", coins: "5", graded: "1" });
  });

  test("resumption: after the game reloads mid-task, the open task comes back with the handshake", async ({ page }) => {
    const f = await openTask(page);
    const prompt = await f.locator("#lv-prompt").textContent();
    const before = page.frames().find((fr) => fr.url().startsWith(GAME));
    await before?.evaluate(() => {
      document.body.dataset["oldDocument"] = "yes";
    });
    await page.locator("#reload-game").click();
    // Prove the reload: a fresh document (no marker) with the title screen showing again.
    await expect.poll(() => page.frames().find((fr) => fr.url().startsWith(GAME))?.url() ?? "").toContain("reload=1");
    await expect(f.locator("body")).not.toHaveAttribute("data-old-document", "yes");
    await expect(f.locator("#lv-connection")).toHaveText("Forbundet");
    await f.locator("#start").click();
    // The resumed task waits until the world is idle: first the opening line.
    await confirmLine(page, "line.intro");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open", { timeout: 30_000 });
    await expect(f.locator("#lv-prompt")).toHaveText(prompt ?? "");
    await f.locator('.lv-card[data-option="kilde_a"]').click();
    await f.locator("#lv-commit").click();
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await expect.poll(() => ledger(page)).toEqual({ xp: "10", coins: "5", graded: "1" });
  });
});

test.describe("Arkivskabet — isolation and sender checks", () => {
  test("the game, on its own origin, cannot read the host's session storage", async ({ page }) => {
    await startGame(page);
    const frame = page.frames().find((fr) => fr.url().startsWith(GAME));
    expect(frame).toBeDefined();
    const probe = await frame?.evaluate(() => {
      let parent = "readable";
      try {
        parent = String(window.parent.localStorage.getItem("sb-test-auth-token"));
      } catch {
        parent = "blocked";
      }
      return { parent, own: localStorage.getItem("sb-test-auth-token"), origin: location.origin };
    });
    expect(probe).toEqual({ parent: "blocked", own: null, origin: GAME });
    // The host page does hold it — the isolation, not its absence, is what keeps it from the game.
    expect(await page.evaluate(() => localStorage.getItem("sb-test-auth-token"))).toBe("TEST-ONLY-NOT-A-REAL-SESSION");
  });

  test("messages from a wrong origin, and forged reward messages from the game, change nothing", async ({ page }) => {
    await startGame(page);
    // Same message shape, but sent from the host's own origin instead of the game's: dropped.
    await page.evaluate(() => window.postMessage({ protocol: "laerligverse.bridge/2", type: "task.request", nonce: "x", requestId: "evil", objectiveId: "hist.besaettelsen.h4", purpose: "check", surface: "world", contextKey: "arkivskab" }, "*"));
    await expect(page.locator("#ledger-rejects")).toContainText("origin");
    // From the real game frame, a message type that would grant a reward does not exist: rejected.
    const frame = page.frames().find((fr) => fr.url().startsWith(GAME));
    await frame?.evaluate((host) => window.parent.postMessage({ protocol: "laerligverse.bridge/2", type: "reward.grant", xp: 999, coins: 999 }, host), HOST);
    await expect(page.locator("#ledger-rejects")).toContainText("invalid");
    expect(await ledger(page)).toEqual({ xp: "0", coins: "0", graded: "0" });
  });

  test("the game bundle as served contains no answer key, no test adapter and no host code", async ({ request }) => {
    const html = await (await request.get(`${GAME}/game.html`)).text();
    const urls = [...new Set([...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1] as string))];
    expect(urls.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    const queue = [...urls];
    while (queue.length > 0) {
      const url = queue.shift() as string;
      if (seen.has(url)) continue;
      seen.add(url);
      const js = await (await request.get(`${GAME}/${url}`)).text();
      for (const forbidden of ["kilde_a", "Proklamationen fra kongen", "ro og orden", "injectFailures", "sb-test-auth-token", "feedbackCorrect"]) {
        expect(js, `${url} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
      // Follow static and dynamic imports of the game's own chunks.
      for (const m of js.matchAll(/["'(]\.\/([A-Za-z0-9_-]+\.js)["')]/g)) queue.push(`assets/${m[1] as string}`);
    }
  });
});
