import { expect, test } from "@playwright/test";
import { activateHotspot, client, confirmLine, game, start, waitIdle } from "./helpers.ts";

test.describe("dialog (spec 04 D6, TS-D11/TS-D12)", () => {
  test("keyboard: Say with Enter/click, Choose with arrows+Enter and digits; a bubble without layout sits over the head", async ({ page }) => {
    await start(page);
    await activateHotspot(page, "portal:to_yard");
    await expect(game(page)).toHaveAttribute("data-scene", "yard", { timeout: 30_000 });
    await waitIdle(page);

    await activateHotspot(page, "actor:crow");
    const bubble = page.locator(".bubble");
    await expect(bubble).toHaveAttribute("data-key", "crow.hello", { timeout: 30_000 });
    // TS-D12: the crow has no speech region, so the bubble is placed above its head.
    await expect(bubble).toHaveAttribute("data-placement", "head");
    const box = await bubble.boundingBox();
    const head = client(page, [980, 560 - 90]);
    expect(box).not.toBeNull();
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(head[1]);
    expect(Math.abs((box?.x ?? 0) + (box?.width ?? 0) / 2 - head[0])).toBeLessThan(5);
    // A click anywhere confirms the line.
    await page.mouse.click(...client(page, [200, 200]));

    const options = page.locator(".menu-option");
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(options.nth(1)).toHaveClass(/active/);
    await expect(options.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(options.nth(2)).toHaveClass(/active/);
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    // The chosen player line is not repeated as a bubble; the crow answers.
    await confirmLine(page, "crow.hint");
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toContainText("Hvem er du?");
    await page.keyboard.press("1");
    await confirmLine(page, "crow.who");
    await expect(options).toHaveCount(1);
    await options.nth(0).hover();
    await options.nth(0).click();
    await waitIdle(page);
    await expect(game(page)).toHaveAttribute("data-modal", "false");

    // end_dialog switched the crow to its next conversation start.
    await activateHotspot(page, "actor:crow");
    await confirmLine(page, "crow.again");
    await expect(options).toHaveCount(1);
    await page.keyboard.press("Enter");
    await waitIdle(page);
  });

  test("Space also confirms a line; the line is announced to screen readers", async ({ page }) => {
    await page.goto("./?motion=off");
    await page.locator("#start").click();
    await expect(page.locator(".bubble")).toBeVisible();
    await expect(page.locator("#live")).toHaveText("Tove: Standuret i værkstedet er gået i stå. Det må jeg kunne ordne.");
    await page.keyboard.press(" ");
    await expect(page.locator(".bubble")).toHaveCount(0);
    await waitIdle(page);
  });
});
