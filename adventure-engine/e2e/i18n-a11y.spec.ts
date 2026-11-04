import { expect, test } from "@playwright/test";
import { activateHotspot, clickScene, collectConsole, confirmLine, game, start, waitIdle } from "./helpers.ts";

test.describe("language (spec 06 F7, TS-F07)", () => {
  test("language choice on the title screen and in game; texts switch at once; empty texts fall back", async ({ page }) => {
    const logs = collectConsole(page);
    await page.goto("./?motion=off");
    await expect(page.locator("h1")).toHaveText("Urmagerens eftermiddag");
    await page.locator('#title-screen [data-lang="en"]').click();
    await expect(page.locator("h1")).toHaveText("The Clockmaker's Afternoon");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.locator("#start").click();
    await expect(page.locator(".bubble-text")).toHaveText("The grandfather clock in the workroom has stopped. I should be able to fix it.");
    // Switching language while a line is shown re-renders it immediately (spec 06 F5).
    await page.locator('#langbar [data-lang="da"]').click();
    await expect(page.locator(".bubble-text")).toHaveText("Standuret i værkstedet er gået i stå. Det må jeg kunne ordne.");
    await page.locator('#langbar [data-lang="en"]').click();
    await page.keyboard.press("Enter");
    await waitIdle(page);

    await activateHotspot(page, "portal:to_yard");
    await expect(game(page)).toHaveAttribute("data-scene", "yard", { timeout: 30_000 });
    await waitIdle(page);
    await clickScene(page, [560, 660]);
    await confirmLine(page, "line.feather_taken");
    await waitIdle(page);
    // "o.feather" is empty in English: the Danish text is shown and W-I18N-EMPTY is reported.
    await expect(page.locator('.inv-item[data-item="feather"]')).toHaveAttribute("aria-label", "Fjer");
    expect(logs.some((l) => l.includes("W-I18N-EMPTY") && l.includes("o.feather"))).toBe(true);
  });

  test("?lang=en starts in English", async ({ page }) => {
    await page.goto("./?lang=en&motion=off");
    await expect(page.locator("#start")).toHaveText("New game");
    await expect(page.locator('#title-screen [data-lang="en"]')).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("accessibility", () => {
  test("everything is reachable with the keyboard; names and states are exposed", async ({ page }) => {
    await start(page);
    // Tab reaches the hotspot list first; the list becomes visible while focused.
    await page.keyboard.press("Tab");
    await expect(page.locator("[data-hotspot]").first()).toBeFocused();
    await expect(page.locator("#hotspots")).toHaveCSS("opacity", "1");
    const oilcan = page.getByRole("button", { name: "Oliekande" });
    await oilcan.focus();
    await page.keyboard.press("Enter");
    await confirmLine(page, "line.oilcan_taken");
    await waitIdle(page);
    const item = page.locator('.inv-item[data-item="oilcan"]');
    await item.focus();
    // Focus inside the panel slides it fully up (identity transform).
    await expect(page.locator("#inventory")).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
    await page.keyboard.press("Enter");
    await expect(item).toHaveAttribute("aria-pressed", "true");
    await expect(item).toHaveAttribute("aria-label", "Oliekande (valgt)");
    // With an item selected the hotspots describe the use.
    await expect(page.locator('[data-hotspot="object:clock"]')).toHaveText("Brug Oliekande på Standur");
    await page.keyboard.press("Escape");
    await expect(page.locator('.inv-item[data-item="oilcan"]')).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("navigation", { name: "Inventar" })).toBeAttached();
    await expect(page.getByRole("group", { name: "Sprog" })).toBeVisible();
  });

  test("reduced motion: no fades or slides", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("./");
    await expect(game(page)).toHaveClass(/reduced-motion/);
    await page.locator("#start").click();
    await expect(page.locator("#fade")).toHaveCSS("opacity", "0");
    await expect(page.locator("#fade")).toHaveCSS("transition-duration", "0s");
    await expect(page.locator("#inventory")).toHaveCSS("transition-duration", "0s");
  });
});
