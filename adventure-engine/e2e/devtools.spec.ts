import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { confirmLine, game, start, waitIdle } from "./helpers.ts";

/**
 * Phase 6 devtools: only the DEV_TOOLS=true build (port 4319) has them; the
 * normal production build (port 4317, packages/app/dist) contains neither the
 * panel, its texts, its keyboard handler nor the import.
 */

const APP = join(import.meta.dirname, "../packages/app");
const MARKERS = ["adventure-engine devtools", "Udviklerværktøjer", "installDevtools", "devtools/boot", "Ctrl+Shift+D", "Indholdseditor"];

const filesOf = (dir: string): string[] => readdirSync(dir, { recursive: true }).map(String).filter((f) => /\.(js|html|css|map)$/.test(f));

test.describe("devtools build flag (phase 6)", () => {
  test("the production build has no devtools code, text, handler or import (and no editor)", async ({ page }) => {
    const dist = join(APP, "dist");
    for (const f of filesOf(dist)) {
      const text = readFileSync(join(dist, f), "utf8");
      for (const m of MARKERS) expect(text.includes(m), `${f} contains "${m}"`).toBe(false);
    }
    await start(page);
    await page.keyboard.press("Control+Shift+D");
    await expect(page.locator("#devtools")).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveAttribute("data-devtools", /.*/);
  });

  test("the DEV_TOOLS build has them behind Ctrl+Shift+D; actions are explicit button presses", async ({ page }) => {
    const devDist = join(APP, "dist-devtools");
    expect(filesOf(devDist).some((f) => readFileSync(join(devDist, f), "utf8").includes("adventure-engine devtools"))).toBe(true);
    await page.goto("http://127.0.0.1:4319/?motion=off");
    await page.locator("#start").click();
    await confirmLine(page, "line.intro");
    await waitIdle(page);
    await expect(page.locator("html")).toHaveAttribute("data-devtools", "available");
    const panel = page.locator("#devtools");
    await expect(panel).toBeHidden();
    await page.keyboard.press("Control+Shift+D");
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-dt="rng"]')).toContainText("seed: demo");
    await expect(panel.locator('[data-dt="rng"]')).toContainText("xoshiro128**");
    // Globals: set and delete.
    await panel.locator('[name="global-name"]').fill("dev_flag");
    await panel.locator('[name="global-value"]').fill("7");
    await panel.locator('[data-dt="set-global"]').click();
    await expect(panel.locator("table")).toContainText("dev_flag");
    await panel.locator('[data-dt="delete-dev_flag"]').click();
    await expect(panel.locator("table")).not.toContainText("dev_flag");
    // Scene change through the engine.
    await panel.locator('[name="scene"]').selectOption("yard");
    await panel.locator('[name="spot"]').selectOption("tree");
    await panel.locator('[data-dt="move"]').click();
    await expect(game(page)).toHaveAttribute("data-scene", "yard", { timeout: 30_000 });
    await expect(panel.locator('[data-dt="trace"]')).not.toBeEmpty();
    // Save slot inspection and the diagnostic report.
    await panel.locator('[data-dt="show-slot"]').click();
    await expect(panel.locator('[data-dt="slot"]')).toContainText(/tom|engine\.save/);
    const [download] = await Promise.all([page.waitForEvent("download"), panel.locator('[data-dt="report"]').click()]);
    const report = JSON.parse(readFileSync(await download.path(), "utf8")) as { tool: string; seed: string; world: { format: string }; trace: Array<{ kind: string }> };
    expect(report).toMatchObject({ tool: "adventure-engine devtools", seed: "demo", world: { format: "engine.save" } });
    expect(report.trace.some((e) => e.kind === "dev.action")).toBe(true);
    // Overlay of walk areas and zones.
    await panel.locator('[data-dt="overlay"]').check();
    await expect(page.locator("#devtools-overlay polygon").first()).toBeAttached();
    await page.keyboard.press("Control+Shift+D");
    await expect(panel).toBeHidden();
  });
});
