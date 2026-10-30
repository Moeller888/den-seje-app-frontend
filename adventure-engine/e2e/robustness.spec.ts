import { expect, test } from "@playwright/test";
import { activateHotspot, clickScene, client, collectConsole, game, hoverScene, start, waitIdle } from "./helpers.ts";

test.describe("assets, loading and viewport (spec 06 F2/F8)", () => {
  test("TS-F08: a failing asset gets a placeholder, the scene loads anyway and a warning is reported", async ({ page }) => {
    const logs = collectConsole(page);
    await page.route("**/assets/bg-workroom.svg", (route) => route.abort());
    await start(page, "?motion=off&dev=1");
    await expect(game(page)).toHaveAttribute("data-scene", "workroom");
    await expect(game(page)).toHaveAttribute("data-renderer", "pixi");
    expect(logs.some((l) => l.includes("W-ASSET-LOAD") && l.includes("bg.workroom"))).toBe(true);
    // The game is still playable.
    await hoverScene(page, [520, 450]);
    await expect(game(page)).toHaveAttribute("data-cursor", "interact");
  });

  test("scene change fades out and in and preloads the next scene once", async ({ page }) => {
    const requests: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/assets/") && r.url().endsWith(".svg")) requests.push(r.url().split("/").pop() ?? "");
    });
    await start(page, "");
    await expect(page.locator("#fade")).toHaveCSS("opacity", "0", { timeout: 5000 });
    expect(requests).not.toContain("bg-yard.svg");
    // Record the fade layer's states; a 500 ms fade is shorter than the assertion poll interval.
    await page.evaluate(() => {
      const fade = document.getElementById("fade") as HTMLElement;
      const seen: string[] = [];
      (window as unknown as { fadeLog: string[] }).fadeLog = seen;
      new MutationObserver(() => seen.push(`${fade.dataset["direction"]}:${fade.style.transition}`)).observe(fade, { attributes: true });
    });
    await activateHotspot(page, "portal:to_yard");
    await expect(game(page)).toHaveAttribute("data-scene", "yard", { timeout: 30_000 });
    expect(requests).toContain("bg-yard.svg");
    await waitIdle(page);
    const fades = await page.evaluate(() => (window as unknown as { fadeLog: string[] }).fadeLog);
    expect(fades).toContain("out:opacity 500ms linear");
    expect(fades.indexOf("in:opacity 500ms linear")).toBeGreaterThan(fades.indexOf("out:opacity 500ms linear"));
    await activateHotspot(page, "portal:to_workroom");
    await expect(game(page)).toHaveAttribute("data-scene", "workroom", { timeout: 30_000 });
    await waitIdle(page);
    await activateHotspot(page, "portal:to_yard");
    await expect(game(page)).toHaveAttribute("data-scene", "yard", { timeout: 30_000 });
    expect(requests.filter((r) => r === "bg-yard.svg")).toHaveLength(1);
  });

  test("letterbox: the game keeps 16:9, bands ignore input and hit-testing follows the scale", async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 1000 });
    await start(page);
    const canvas = page.locator("#stage canvas");
    const box = await canvas.boundingBox();
    // The canvas is sized in whole CSS pixels.
    expect(Math.abs((box?.width ?? 0) - 1000)).toBeLessThanOrEqual(1);
    expect(Math.abs((box?.height ?? 0) - 562.5)).toBeLessThanOrEqual(1);
    expect(Math.abs((box?.y ?? 0) - (1000 - 562.5) / 2)).toBeLessThanOrEqual(1);
    // A click in the top band does nothing (no "cannot", no walk).
    await page.mouse.click(500, 50);
    await expect(game(page)).not.toHaveClass(/cannot/);
    await expect(game(page)).toHaveAttribute("data-idle", "true");
    await hoverScene(page, [520, 450]);
    await expect(game(page)).toHaveAttribute("data-cursor", "interact");
    expect(client(page, [520, 450])[1]).toBeCloseTo(218.75 + 450 * (1000 / 1280), 3);
    // Wide window: bands left and right.
    await page.setViewportSize({ width: 1600, height: 600 });
    await expect.poll(async () => Math.round((await canvas.boundingBox())?.height ?? 0)).toBe(600);
    await hoverScene(page, [700, 680]);
    await expect(game(page)).toHaveAttribute("data-cursor", "walk");
    await clickScene(page, [700, 680]);
    await waitIdle(page);
  });
});
