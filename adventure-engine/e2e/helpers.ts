import { expect, type Page } from "@playwright/test";
import { letterbox, logicalToClient } from "../packages/render-pixi/src/letterbox.ts";

export const LOGICAL = { width: 1280, height: 720 };

export const game = (page: Page) => page.locator("#game");

/** Open the demo, start a new game and confirm the opening line. */
export async function start(page: Page, query = "?motion=off"): Promise<void> {
  await page.goto(`./${query}`);
  await page.locator("#start").click();
  await expect(page.locator(".bubble")).toHaveAttribute("data-key", "line.intro");
  await page.keyboard.press("Enter");
  await waitIdle(page);
}

export async function waitIdle(page: Page): Promise<void> {
  await expect(game(page)).toHaveAttribute("data-idle", "true", { timeout: 30_000 });
}

/** Client (page) coordinates of a logical viewport point, through the letterbox. */
export function client(page: Page, p: readonly [number, number]): [number, number] {
  const vp = page.viewportSize() ?? LOGICAL;
  return logicalToClient(p, letterbox(vp, LOGICAL));
}

/** Viewport point of a scene point at the current scroll. */
export async function sceneToViewport(page: Page, p: readonly [number, number]): Promise<[number, number]> {
  const scroll = Number(await game(page).getAttribute("data-scroll"));
  return [p[0] - scroll, p[1]];
}

export async function hoverScene(page: Page, p: readonly [number, number]): Promise<void> {
  const [x, y] = client(page, await sceneToViewport(page, p));
  await page.mouse.move(x, y);
}

export async function clickScene(page: Page, p: readonly [number, number]): Promise<void> {
  const [x, y] = client(page, await sceneToViewport(page, p));
  await page.mouse.click(x, y);
}

/** Confirm the current speech bubble (expected text key) with Enter. */
export async function confirmLine(page: Page, key: string): Promise<void> {
  await expect(page.locator(".bubble")).toHaveAttribute("data-key", key, { timeout: 30_000 });
  await page.keyboard.press("Enter");
}

/** Click an inventory item (the panel slides up when the pointer is over it). */
export async function clickItem(page: Page, item: string): Promise<void> {
  await page.locator("#inventory").hover({ position: { x: 300, y: 4 } });
  await page.locator(`.inv-item[data-item="${item}"]`).click();
}

/** Activate a hotspot through the keyboard-accessible list. */
export async function activateHotspot(page: Page, key: string): Promise<void> {
  const button = page.locator(`[data-hotspot="${key}"]`);
  await button.focus();
  await page.keyboard.press("Enter");
}

export function collectConsole(page: Page): string[] {
  const out: string[] = [];
  page.on("console", (m) => out.push(`${m.type()}: ${m.text()}`));
  return out;
}
