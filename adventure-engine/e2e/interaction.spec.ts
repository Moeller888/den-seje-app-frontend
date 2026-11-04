import { expect, test } from "@playwright/test";
import { clickItem, clickScene, collectConsole, confirmLine, game, hoverScene, start, waitIdle } from "./helpers.ts";

const CLOCK: [number, number] = [520, 450];
const OILCAN: [number, number] = [1100, 447];
const DOOR_OUT: [number, number] = [1515, 465];
const FEATHER: [number, number] = [560, 660];
const DOOR_IN: [number, number] = [130, 480];

test.describe("pointer interaction (spec 04 D1–D5)", () => {
  test("cursor modes, tooltip and 200 ms click feedback", async ({ page }) => {
    await start(page);
    await hoverScene(page, CLOCK);
    await expect(game(page)).toHaveAttribute("data-cursor", "interact");
    await expect(page.locator("#tooltip")).toHaveText("Standur");
    await hoverScene(page, [700, 680]);
    await expect(game(page)).toHaveAttribute("data-cursor", "walk");
    await expect(page.locator("#tooltip")).toBeHidden();
    await hoverScene(page, [300, 200]);
    await expect(game(page)).toHaveAttribute("data-cursor", "idle");
    // The 200 ms feedback is observed by events, not by polling: a MutationObserver
    // records when "clicking" is added and removed (with the cursor mode at that
    // moment), and a capturing pointerdown listener records when the click began.
    // A state that has already ended before the next poll is still seen.
    await page.evaluate(() => {
      const node = document.getElementById("cursor") as HTMLElement;
      const log: Array<{ on: boolean; mode: string; t: number }> = [];
      const w = window as unknown as { clickLog: typeof log; pointerDownAt: number | null };
      w.clickLog = log;
      w.pointerDownAt = null;
      window.addEventListener("pointerdown", (ev) => (w.pointerDownAt ??= ev.timeStamp), { capture: true, once: true });
      let on = node.classList.contains("clicking");
      new MutationObserver(() => {
        const now = node.classList.contains("clicking");
        if (now !== on) log.push({ on: now, mode: node.dataset["mode"] ?? "", t: performance.now() });
        on = now;
      }).observe(node, { attributes: true, attributeFilter: ["class"] });
    });
    await clickScene(page, [300, 200]);
    // Activated, then deactivated again: exactly one on → off pair.
    await expect.poll(() => page.evaluate(() => (window as unknown as { clickLog: Array<{ on: boolean }> }).clickLog.map((e) => e.on))).toEqual([true, false]);
    const { log, downAt } = await page.evaluate(() => {
      const w = window as unknown as { clickLog: Array<{ on: boolean; mode: string; t: number }>; pointerDownAt: number | null };
      return { log: w.clickLog, downAt: w.pointerDownAt };
    });
    const [onEntry, offEntry] = log;
    // The feedback showed the cursor of the clicked point (an empty spot: idle).
    expect(onEntry?.mode).toBe("idle");
    // It ended no earlier than the configured 200 ms after the click began. The class is set
    // inside the pointerdown handler, so pointerdown time ≤ start of the feedback; 5 ms covers
    // the browsers' coarsened clocks (performance.now/timeStamp resolution), not a longer period.
    expect(downAt).not.toBeNull();
    expect((offEntry?.t ?? 0) - (downAt ?? 0)).toBeGreaterThanOrEqual(195);
    // The normal hover state is back: no feedback class, the point's mode, cursor shown.
    await expect(page.locator("#cursor")).not.toHaveClass(/clicking/);
    await expect(page.locator("#cursor")).toHaveAttribute("data-mode", "idle");
    await expect(game(page)).toHaveAttribute("data-cursor", "idle");
    await expect(page.locator("#cursor")).toBeVisible();
    // An empty click is "cannot" (spec 04 D3: idle → reaction).
    await expect(game(page)).toHaveClass(/cannot/);
  });

  test("modal input: during a line the cursor is busy and a scene click only confirms it", async ({ page }) => {
    await page.goto("./?motion=off");
    await page.locator("#start").click();
    await expect(page.locator(".bubble")).toBeVisible();
    await expect(game(page)).toHaveAttribute("data-modal", "true");
    await hoverScene(page, [700, 680]);
    await expect(game(page)).toHaveAttribute("data-cursor", "busy");
    await clickScene(page, [700, 680]);
    await expect(page.locator(".bubble")).toHaveCount(0);
    await waitIdle(page);
    await hoverScene(page, [700, 680]);
    await expect(game(page)).toHaveAttribute("data-cursor", "walk");
  });

  test("pick up, combine in the inventory, change scene and use the result (full puzzle)", async ({ page }) => {
    const logs = collectConsole(page);
    await start(page);
    await clickScene(page, CLOCK);
    await confirmLine(page, "line.clock_stopped");
    await waitIdle(page);

    await clickScene(page, OILCAN);
    await confirmLine(page, "line.oilcan_taken");
    await waitIdle(page);
    await expect(page.locator("#inventory")).toHaveAttribute("data-items", "oilcan");

    await clickScene(page, DOOR_OUT);
    await expect(game(page)).toHaveAttribute("data-scene", "yard", { timeout: 30_000 });
    await waitIdle(page);

    await clickScene(page, FEATHER);
    await confirmLine(page, "line.feather_taken");
    await waitIdle(page);

    // Select, deselect, select again, then combine (spec 04 D4 a–c).
    await clickItem(page, "oilcan");
    await expect(page.locator('.inv-item[data-item="oilcan"]')).toHaveAttribute("aria-pressed", "true");
    await expect(game(page)).toHaveAttribute("data-cursor", "use");
    await clickItem(page, "oilcan");
    await expect(game(page)).toHaveAttribute("data-selected", "");
    await clickItem(page, "oilcan");
    await page.locator('.inv-item[data-item="feather"]').hover();
    await expect(page.locator("#tooltip")).toHaveText("Brug Oliekande på Fjer");
    await page.locator('.inv-item[data-item="feather"]').click();
    await confirmLine(page, "line.feather_oiled");
    await waitIdle(page);
    await expect(page.locator("#inventory")).toHaveAttribute("data-items", "oilcan,oiled_feather");
    await expect(game(page)).toHaveAttribute("data-selected", "");

    await clickScene(page, DOOR_IN);
    await expect(game(page)).toHaveAttribute("data-scene", "workroom", { timeout: 30_000 });
    await waitIdle(page);

    await clickItem(page, "oiled_feather");
    await hoverScene(page, CLOCK);
    await expect(game(page)).toHaveAttribute("data-cursor", "use");
    await expect(page.locator("#tooltip")).toHaveText("Brug Olieret fjer på Standur");
    await clickScene(page, CLOCK);
    await confirmLine(page, "line.clock_fixed");
    await waitIdle(page);
    await expect(page.locator("#inventory")).toHaveAttribute("data-items", "oilcan");
    await clickScene(page, CLOCK);
    await confirmLine(page, "line.clock_ticks");
    // Phase 4 feature detection: a browser without Web Audio (Playwright's WebKit on Windows) reports
    // exactly one platform warning; with audio there must be no engine warning at all.
    const audio = await game(page).getAttribute("data-audio");
    const expected = audio === "unavailable" || audio === "refused" ? [expect.stringContaining("W-AUDIO-UNAVAILABLE")] : [];
    expect(logs.filter((l) => l.includes("[engine]"))).toEqual(expected);
  });

  test("use without a target clears the selection and reacts; Escape drops a selection", async ({ page }) => {
    await start(page);
    await clickScene(page, OILCAN);
    await confirmLine(page, "line.oilcan_taken");
    await waitIdle(page);
    await clickItem(page, "oilcan");
    await expect(game(page)).toHaveAttribute("data-selected", "oilcan");
    await clickScene(page, [700, 150]);
    await expect(game(page)).toHaveClass(/cannot/);
    await expect(game(page)).toHaveAttribute("data-selected", "");
    await clickItem(page, "oilcan");
    await page.keyboard.press("Escape");
    await expect(game(page)).toHaveAttribute("data-selected", "");
  });
});
