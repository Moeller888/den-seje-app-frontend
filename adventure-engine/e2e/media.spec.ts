import { expect, test, type Page } from "@playwright/test";
import { activateHotspot, clickItem, clickScene, collectConsole, confirmLine, game, hoverScene, start, waitIdle } from "./helpers.ts";

/**
 * Phase 4: animation, sound and cutscenes in the browser. Physical audio output
 * is never asserted: the tests observe the adapter state the game mirrors on
 * #game (audio state, playing sounds, animations, cutscene state).
 */

const toYard = async (page: Page): Promise<void> => {
  await activateHotspot(page, "portal:to_yard");
  await expect(game(page)).toHaveAttribute("data-scene", "yard", { timeout: 30_000 });
};

test.describe("animation (spec 06 F3)", () => {
  test("Tove switches between stand and walk, and the facing selects the animation", async ({ page }) => {
    await start(page);
    await expect(game(page)).toHaveAttribute("data-player-anim", /^stand/);
    await clickScene(page, [1000, 650]);
    await expect(game(page)).toHaveAttribute("data-player-anim", "walk.right");
    await waitIdle(page);
    await expect(game(page)).toHaveAttribute("data-player-anim", "stand.right");
    await clickScene(page, [400, 650]);
    await expect(game(page)).toHaveAttribute("data-player-anim", "walk.left");
    await waitIdle(page);
    await expect(game(page)).toHaveAttribute("data-player-anim", "stand.left");
  });

  test("the crow's flap animation sends its signal to core", async ({ page }) => {
    await start(page);
    await expect(game(page)).toHaveAttribute("data-last-signal", "");
    await toYard(page);
    await expect(game(page)).toHaveAttribute("data-last-signal", "crow:landed", { timeout: 30_000 });
  });
});

test.describe("sound (spec 06 F4)", () => {
  test("autoplay: audio stays locked until the first user gesture", async ({ page }) => {
    await page.goto("./?motion=off");
    // No gesture yet: locked (or unavailable where the browser has no Web Audio).
    await expect(game(page)).toHaveAttribute("data-audio", /^(locked|unavailable)$/);
    const before = await game(page).getAttribute("data-audio");
    await page.locator("#start").click();
    await expect(page.locator(".bubble")).toBeVisible();
    if (before === "locked") await expect(game(page)).toHaveAttribute("data-audio", /^(running|refused)$/);
    // Whatever the platform did, the logical sound state is the same and nothing hangs.
    await expect(game(page)).toHaveAttribute("data-sounds", "workroom:hum,workroom:theme");
    await page.keyboard.press("Enter");
    await waitIdle(page);
  });

  test("the mute button works with the keyboard and shows its state; unmute restores", async ({ page }) => {
    await start(page);
    const mute = page.locator("#mute");
    await expect(mute).toHaveAttribute("aria-pressed", "false");
    await expect(mute).toHaveAccessibleName("Lyd fra");
    await mute.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#mute")).toHaveAttribute("aria-pressed", "true");
    await expect(game(page)).toHaveAttribute("data-muted", "true");
    await expect(page.locator("#mute")).toContainText("Lyd fra");
    await page.locator("#mute").focus();
    await page.keyboard.press(" ");
    await expect(page.locator("#mute")).toHaveAttribute("aria-pressed", "false");
    await expect(game(page)).toHaveAttribute("data-muted", "false");
    await expect(game(page)).toHaveAttribute("data-sounds", "workroom:hum,workroom:theme");
  });

  test("TS-F05: leaving the workroom stops its ambient loop but keeps the persistent theme", async ({ page }) => {
    await start(page);
    await expect(game(page)).toHaveAttribute("data-sounds", "workroom:hum,workroom:theme");
    await toYard(page);
    await expect(game(page)).toHaveAttribute("data-sounds", "workroom:theme");
    await waitIdle(page);
    await activateHotspot(page, "portal:to_workroom");
    await expect(game(page)).toHaveAttribute("data-scene", "workroom", { timeout: 30_000 });
    await expect(game(page)).toHaveAttribute("data-sounds", "workroom:theme,workroom:hum");
  });

  test("a failing sound or atlas gives a warning and never locks the game", async ({ page }) => {
    const logs = collectConsole(page);
    await page.route("**/media/hum.wav", (route) => route.abort());
    await page.route("**/assets/tove-atlas.svg", (route) => route.abort());
    await start(page, "?motion=off&dev=1");
    // Feature detection: with Web Audio the failing hum.wav is reported; without it (WebKit on Windows)
    // nothing is fetched and the platform warning is reported once a sound is due.
    const audio = await game(page).getAttribute("data-audio");
    if (audio === "running") await expect.poll(() => logs.some((l) => l.includes("W-AUDIO-LOAD"))).toBe(true);
    else {
      expect(audio).toMatch(/^(unavailable|refused)$/);
      await clickScene(page, [1100, 447]);
      await expect.poll(() => logs.some((l) => l.includes("W-AUDIO-UNAVAILABLE"))).toBe(true);
      await confirmLine(page, "line.oilcan_taken");
      await waitIdle(page);
    }
    expect(logs.some((l) => l.includes("W-ASSET-LOAD") && l.includes("atlas.tove"))).toBe(true);
    await expect(game(page)).toHaveAttribute("data-modal", "false");
    await clickScene(page, [700, 650]);
    await waitIdle(page);
    await hoverScene(page, [520, 450]);
    await expect(game(page)).toHaveAttribute("data-cursor", "interact");
  });
});

test.describe("cutscenes (spec 06 F6)", () => {
  test("a cutscene hides the cursor and blocks scene input; early skip is ignored, a later skip ends it", async ({ page }) => {
    await start(page);
    await hoverScene(page, [700, 650]);
    // Early input must happen before skipAfterMs (1000 ms of game time). A real Enter and a real
    // click are sent from the frame in which the cutscene first shows as playing (at most one
    // frame, <= 250 ms of game time, after it started), so the check does not depend on test speed.
    await page.evaluate(() => {
      const g = document.getElementById("game") as HTMLElement;
      const w = window as unknown as { earlySkip?: string };
      new MutationObserver((_m, obs) => {
        if (g.dataset["cutscene"] !== "playing") return;
        obs.disconnect();
        w.earlySkip = g.dataset["cutsceneSkip"] ?? "";
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        document.getElementById("surface")?.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true, clientX: 400, clientY: 400 }));
      }).observe(g, { attributes: true, attributeFilter: ["data-cutscene"] });
    });
    await toYard(page);
    await expect(game(page)).toHaveAttribute("data-cutscene-name", "story", { timeout: 30_000 });
    expect(await page.evaluate(() => (window as unknown as { earlySkip?: string }).earlySkip)).toBe("wait");
    // The early input was ignored: still playing, still in the yard, input locked, cursor hidden.
    await expect(game(page)).toHaveAttribute("data-cutscene", "playing");
    await expect(game(page)).toHaveAttribute("data-cutscene-variant", "da");
    await expect(game(page)).toHaveAttribute("data-scene", "yard");
    await expect(game(page)).toHaveAttribute("data-modal", "true");
    await expect(page.locator("#cursor")).toBeHidden();
    await expect(page.locator(".cutscene-caption")).toBeVisible();
    await expect(game(page)).toHaveAttribute("data-cutscene-skip", "ready");
    await page.keyboard.press("Escape");
    await expect(game(page)).toHaveAttribute("data-cutscene", "idle");
    await expect(page.locator("#cutscene")).toBeHidden();
    await waitIdle(page);
    await expect(game(page)).toHaveAttribute("data-modal", "false");
  });

  test("TS-F06: in English the story falls back to the language-neutral default variant", async ({ page }) => {
    await start(page, "?lang=en&motion=off");
    await toYard(page);
    await expect(game(page)).toHaveAttribute("data-cutscene", "playing", { timeout: 30_000 });
    await expect(game(page)).toHaveAttribute("data-cutscene-variant", "default");
    await expect(page.locator(".cutscene-picture")).toBeVisible();
    await expect(page.locator(".cutscene-caption")).toBeHidden();
    await waitIdle(page);
    await expect(game(page)).toHaveAttribute("data-cutscene", "idle");
  });

  test("hold keeps the finale's last picture until the clock is used; the chime signals core", async ({ page }) => {
    await start(page);
    await clickScene(page, [1100, 447]);
    await confirmLine(page, "line.oilcan_taken");
    await waitIdle(page);
    await clickScene(page, [1515, 465]);
    await expect(game(page)).toHaveAttribute("data-scene", "yard", { timeout: 30_000 });
    await waitIdle(page);
    await clickScene(page, [560, 660]);
    await confirmLine(page, "line.feather_taken");
    await waitIdle(page);
    await clickItem(page, "oilcan");
    await page.locator('.inv-item[data-item="feather"]').click();
    await confirmLine(page, "line.feather_oiled");
    await waitIdle(page);
    await clickScene(page, [130, 480]);
    await expect(game(page)).toHaveAttribute("data-scene", "workroom", { timeout: 30_000 });
    await waitIdle(page);
    await clickItem(page, "oiled_feather");
    await clickScene(page, [520, 450]);
    await expect(game(page)).toHaveAttribute("data-cutscene-name", "finale", { timeout: 30_000 });
    // After the finale the picture stays (held) under Tove's line.
    await expect(page.locator(".bubble")).toHaveAttribute("data-key", "line.clock_fixed", { timeout: 30_000 });
    await expect(game(page)).toHaveAttribute("data-cutscene", "held");
    await expect(page.locator(".cutscene-picture")).toHaveAttribute("data-asset", "img.finale");
    await expect(page.locator(".cutscene-caption")).toHaveText("Tik, tak – værkstedet lever igen.");
    await page.keyboard.press("Enter");
    await expect(game(page)).toHaveAttribute("data-last-signal", "clock:chimed", { timeout: 30_000 });
    await waitIdle(page);
    await expect(game(page)).toHaveAttribute("data-cutscene", "held");
    await clickScene(page, [520, 450]);
    await expect(game(page)).toHaveAttribute("data-cutscene", "idle");
    await confirmLine(page, "line.clock_ticks");
  });
});
