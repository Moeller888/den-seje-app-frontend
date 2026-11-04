import { expect, test, type Page } from "@playwright/test";
import { activateHotspot, clickItem, confirmLine, game, start, waitIdle } from "./helpers.ts";

/**
 * Visual baselines (Chromium only). Every shot is taken in a settled state:
 * animations off (?motion=off), fonts loaded and the engine idle, so the
 * picture depends only on the world state, not on timing.
 */
// Baselines are made on Windows; CI on Linux runs the functional specs with E2E_SCREENSHOTS=off.
test.skip(({ browserName }) => browserName !== "chromium" || process.env["E2E_SCREENSHOTS"] === "off", "screenshots are Chromium-only (and off where the baselines' platform differs)");

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test("title screen", async ({ page }) => {
  await page.goto("./?motion=off");
  await settle(page);
  await expect(page).toHaveScreenshot("title.png");
});

test("workroom after the opening line", async ({ page }) => {
  await start(page);
  await settle(page);
  await expect(page).toHaveScreenshot("workroom.png");
});

test("dialog with the choice menu over the yard", async ({ page }) => {
  await start(page);
  await activateHotspot(page, "portal:to_yard");
  await expect(game(page)).toHaveAttribute("data-scene", "yard", { timeout: 30_000 });
  await waitIdle(page);
  await activateHotspot(page, "actor:crow");
  await confirmLine(page, "crow.hello");
  await expect(page.locator(".menu-option")).toHaveCount(3);
  await settle(page);
  await expect(page).toHaveScreenshot("dialog-menu.png");
});

test("open inventory with a selected item", async ({ page }) => {
  await start(page);
  await activateHotspot(page, "object:oilcan");
  await confirmLine(page, "line.oilcan_taken");
  await waitIdle(page);
  await clickItem(page, "oilcan");
  await expect(page.locator('.inv-item[data-item="oilcan"]')).toHaveAttribute("aria-pressed", "true");
  await settle(page);
  await expect(page).toHaveScreenshot("inventory-selected.png");
});

test("pause menu (phase 5)", async ({ page }) => {
  await start(page);
  await page.keyboard.press("Escape");
  await expect(game(page)).toHaveAttribute("data-menu", "pause");
  await settle(page);
  await expect(page).toHaveScreenshot("pause-menu.png");
});
