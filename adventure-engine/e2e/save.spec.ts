import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { saveChecksum, type SaveData } from "../packages/core/src/save.ts";
import { activateHotspot, confirmLine, game, start, waitIdle } from "./helpers.ts";

/**
 * Phase 5: saving and loading in the browser (spec 05 E3–E5). The game mirrors
 * the save state on #game: data-last-save is "<slot>:<n>" once a write has
 * reached the store ("<slot>:rejected" / "<slot>:failed" otherwise), and
 * data-last-load is "ok:<repairs>" or "rejected:<code>".
 */

const CONTENT_ID = "clockmaker-demo";

const menu = (page: Page) => page.locator("#game-menu");

/** Through the portal to the yard; the first visit's story cutscene is skipped. */
async function toYard(page: Page): Promise<void> {
  await activateHotspot(page, "portal:to_yard");
  await expect(game(page)).toHaveAttribute("data-scene", "yard", { timeout: 30_000 });
  await expect(game(page)).toHaveAttribute("data-cutscene-skip", "ready", { timeout: 30_000 });
  await page.keyboard.press("Escape");
  await expect(game(page)).toHaveAttribute("data-cutscene", "idle");
  await waitIdle(page);
}

async function takeOilcan(page: Page): Promise<void> {
  await activateHotspot(page, "object:oilcan");
  await confirmLine(page, "line.oilcan_taken");
  await waitIdle(page);
  await expect(page.locator('.inv-item[data-item="oilcan"]')).toBeAttached();
}

/** Open the pause menu, save in a slot and wait until the write has reached storage. */
async function saveIn(page: Page, slot: string): Promise<void> {
  await page.locator("#menu-button").click();
  await expect(game(page)).toHaveAttribute("data-menu", "pause");
  await menu(page).locator('[data-action="save"]').click();
  await expect(game(page)).toHaveAttribute("data-menu", "save");
  await menu(page).locator(`[data-slot="${slot}"]`).click();
  await expect(game(page)).toHaveAttribute("data-last-save", new RegExp(`^${slot}:\\d+$`));
  await expect(page.locator("#notice")).toHaveText("Spillet er gemt.");
}

/** Read (value === undefined) or write one record of the game's IndexedDB store, outside the game. */
function idbRecord(page: Page, key: string, value?: string): Promise<string | null> {
  return page.evaluate(
    ([k, v]) =>
      new Promise<string | null>((resolve, reject) => {
        const req = indexedDB.open("engine-saves", 1);
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const tx = req.result.transaction("slots", v === null ? "readonly" : "readwrite");
          const store = tx.objectStore("slots");
          let out: string | null = null;
          if (v === null) {
            const get = store.get(k);
            get.onsuccess = () => (out = typeof get.result === "string" ? get.result : null);
          } else store.put(v, k);
          tx.oncomplete = () => {
            req.result.close();
            resolve(out);
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    [key, value ?? null] as const,
  );
}

test.describe("save and load (spec 05)", () => {
  test("a save in a slot is loaded back from the pause menu; the menu pauses the game", async ({ page }) => {
    await start(page);
    await expect(game(page)).toHaveAttribute("data-storage", "indexeddb");
    await takeOilcan(page);
    await saveIn(page, "slot1");
    // The slot row now shows its time and play time.
    await expect(menu(page).locator('[data-slot="slot1"]')).toContainText("spilletid");
    // Escape: back to the pause page, then closed.
    await page.keyboard.press("Escape");
    await expect(game(page)).toHaveAttribute("data-menu", "pause");
    await page.keyboard.press("Escape");
    await expect(game(page)).toHaveAttribute("data-menu", "closed");
    await toYard(page);
    // Escape with nothing selected opens the pause menu.
    await page.keyboard.press("Escape");
    await expect(game(page)).toHaveAttribute("data-menu", "pause");
    await expect(menu(page).getByRole("dialog", { name: "Menu" })).toBeVisible();
    await menu(page).locator('[data-action="load"]').click();
    await menu(page).locator('[data-slot="slot1"]').click();
    await expect(game(page)).toHaveAttribute("data-last-load", "ok:0");
    await expect(game(page)).toHaveAttribute("data-menu", "closed");
    await expect(game(page)).toHaveAttribute("data-scene", "workroom");
    await waitIdle(page);
    await expect(page.locator('.inv-item[data-item="oilcan"]')).toBeAttached();
    await expect(page.locator('[data-hotspot="object:oilcan"]')).toHaveCount(0);
  });

  test("saving is refused while a line is being spoken; the game continues afterwards", async ({ page }) => {
    await start(page);
    await activateHotspot(page, "object:oilcan");
    await expect(page.locator(".bubble")).toHaveAttribute("data-key", "line.oilcan_taken");
    await expect(game(page)).toHaveAttribute("data-can-save", "false");
    await page.locator("#menu-button").click();
    await menu(page).locator('[data-action="save"]').click();
    await menu(page).locator('[data-slot="slot2"]').click();
    await expect(game(page)).toHaveAttribute("data-last-save", "slot2:rejected");
    await expect(page.locator("#notice")).toHaveText("Der kan kun gemmes, når der ikke sker noget i spillet.");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(game(page)).toHaveAttribute("data-menu", "closed");
    // The line is still waiting and can be confirmed; no dead state.
    await confirmLine(page, "line.oilcan_taken");
    await waitIdle(page);
    await expect(game(page)).toHaveAttribute("data-can-save", "true");
  });

  test("TS-E03 / TS-A03: autosave after a scene change, and Fortsæt after a reload", async ({ page }) => {
    await page.goto("./?motion=off");
    // No saves yet: no Fortsæt on the title screen.
    await expect(page.locator("#continue")).toHaveCount(0);
    await page.locator("#start").click();
    await confirmLine(page, "line.intro");
    await waitIdle(page);
    await takeOilcan(page);
    await toYard(page);
    await expect(game(page)).toHaveAttribute("data-last-save", /^auto:\d+$/);
    await page.reload();
    await expect(page.locator("#continue")).toHaveText("Fortsæt");
    await expect(page.locator("#continue")).toHaveAttribute("data-backup", "false");
    await page.locator("#continue").click();
    await expect(game(page)).toHaveAttribute("data-last-load", "ok:0");
    await expect(game(page)).toHaveAttribute("data-scene", "yard");
    await waitIdle(page);
    await expect(page.locator('.inv-item[data-item="oilcan"]')).toBeAttached();
  });

  test("autosave when going to the title screen and when the page is hidden", async ({ page }) => {
    await start(page);
    await page.locator("#menu-button").click();
    await menu(page).locator('[data-action="title"]').click();
    await expect(game(page)).toHaveAttribute("data-started", "false");
    await expect(game(page)).toHaveAttribute("data-last-save", /^auto:1$/);
    await expect(page.locator("#continue")).toBeVisible();
    await page.locator("#continue").click();
    await expect(game(page)).toHaveAttribute("data-last-load", "ok:0");
    await waitIdle(page);
    // The page becomes hidden (tab switch); the browser event is simulated.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(game(page)).toHaveAttribute("data-last-save", /^auto:2$/);
  });

  test("a damaged slot offers its backup (spec 05 E5)", async ({ page }) => {
    await start(page);
    await takeOilcan(page);
    await saveIn(page, "slot3");
    // Damage the main file in IndexedDB (a torn write), then reload.
    await page.evaluate(
      (key) =>
        new Promise<void>((resolve, reject) => {
          const req = indexedDB.open("engine-saves", 1);
          req.onerror = () => reject(req.error);
          req.onsuccess = () => {
            const tx = req.result.transaction("slots", "readwrite");
            tx.objectStore("slots").put('{"format":"engine.save/1","formatVersion":1,"cont', key);
            tx.oncomplete = () => {
              req.result.close();
              resolve();
            };
            tx.onerror = () => reject(tx.error);
          };
        }),
      `engine:${CONTENT_ID}:slot3`,
    );
    // (Leaving the page may autosave to "auto", so the title's Fortsæt is not asserted here;
    // its backup choice is covered by the unit tests of continueChoice.)
    await page.reload();
    await page.locator("#title-load").click();
    await expect(game(page)).toHaveAttribute("data-menu", "load");
    await expect(menu(page).locator('[data-slot="slot3"]')).toBeDisabled();
    await expect(menu(page).locator('[data-slot="slot3"]')).toContainText("beskadiget");
    await menu(page).locator('[data-restore="slot3"]').click();
    await expect(page.locator("#notice")).toHaveText("Sikkerhedskopien er gendannet.");
    await expect(menu(page).locator('[data-slot="slot3"]')).toBeEnabled();
    await menu(page).locator('[data-slot="slot3"]').click();
    await expect(game(page)).toHaveAttribute("data-last-load", "ok:0");
    await waitIdle(page);
    await expect(page.locator('.inv-item[data-item="oilcan"]')).toBeAttached();
  });

  test("follow-up F5: a save whose IndexedDB write fails is reported once and never shown as saved", async ({ page }) => {
    await start(page);
    await expect(game(page)).toHaveAttribute("data-storage", "indexeddb");
    // From now on every IndexedDB put of slot1 fails (as a full or closed store would).
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
        if (typeof key === "string" && key.includes(":slot1")) throw new DOMException("simulated failure", "QuotaExceededError");
        return put.call(this, value, key);
      };
    });
    const errors: string[] = [];
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text());
    });
    await page.locator("#menu-button").click();
    await menu(page).locator('[data-action="save"]').click();
    await menu(page).locator('[data-slot="slot1"]').click();
    await expect(game(page)).toHaveAttribute("data-last-save", "slot1:failed");
    await expect(page.locator("#notice")).toHaveText("Spillet kunne ikke gemmes: storage");
    // The next, unaffected save is confirmed on its own and does not inherit the failure.
    await menu(page).locator('[data-slot="slot2"]').click();
    await expect(game(page)).toHaveAttribute("data-last-save", /^slot2:\d+$/);
    await expect(page.locator("#notice")).toHaveText("Spillet er gemt.");
    // The failed slot write was reported by the save itself, not a second time through the store's error handler.
    expect(errors.filter((e) => e.includes("IndexedDB write failed"))).toEqual([]);
  });

  test("follow-up: an intact save the content cannot load is not shown as ok; its backup is offered", async ({ page }) => {
    await start(page);
    await takeOilcan(page);
    await saveIn(page, "slot3");
    const key = `engine:${CONTENT_ID}:slot3`;
    // Make the main file a save of another game: the checksum matches, but this content cannot load it.
    const main = await idbRecord(page, key);
    expect(main).not.toBeNull();
    const d = JSON.parse(main as string) as Record<string, unknown>;
    d["content"] = { ...(d["content"] as object), id: "another-game" };
    d["checksum"] = saveChecksum(d as unknown as SaveData);
    await idbRecord(page, key, JSON.stringify(d));
    await page.reload();
    await page.locator("#title-load").click();
    await expect(game(page)).toHaveAttribute("data-menu", "load");
    const row = menu(page).locator('[data-slot="slot3"]');
    await expect(row).toBeDisabled();
    await expect(row).toContainText("kan ikke indlæses – sikkerhedskopi kan gendannes");
    await menu(page).locator('[data-restore="slot3"]').click();
    await expect(page.locator("#notice")).toHaveText("Sikkerhedskopien er gendannet.");
    await expect(row).toBeEnabled();
    await row.click();
    await expect(game(page)).toHaveAttribute("data-last-load", "ok:0");
    await waitIdle(page);
    await expect(page.locator('.inv-item[data-item="oilcan"]')).toBeAttached();
  });

  test("export downloads a valid save; import loads it, and a broken file is refused", async ({ page }) => {
    await start(page);
    await takeOilcan(page);
    await page.locator("#menu-button").click();
    const [download] = await Promise.all([page.waitForEvent("download"), menu(page).locator('[data-action="export"]').click()]);
    expect(download.suggestedFilename()).toBe(`${CONTENT_ID}-save.json`);
    const path = await download.path();
    const text = readFileSync(path, "utf8");
    const data = JSON.parse(text) as { format: string; formatVersion: number; checksum: string; content: { id: string } };
    expect([data.format, data.formatVersion]).toEqual(["engine.save", 1]);
    expect(data.content.id).toBe(CONTENT_ID);
    expect(data.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    // A new game without the oil can, then import the exported file.
    await menu(page).locator('[data-action="title"]').click();
    await page.locator("#start").click();
    await confirmLine(page, "line.intro");
    await waitIdle(page);
    await expect(page.locator('.inv-item[data-item="oilcan"]')).toHaveCount(0);
    await page.locator("#menu-button").click();
    await menu(page).locator("#import-file").setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from(text.slice(0, 60)) });
    await expect(game(page)).toHaveAttribute("data-last-load", "rejected:E-SAVE-PARSE");
    await expect(page.locator("#notice")).toHaveText("Det gemte spil kunne ikke indlæses (E-SAVE-PARSE).");
    await expect(game(page)).toHaveAttribute("data-menu", "pause");
    // Release review: an oversized file is refused before it is read.
    await menu(page).locator("#import-file").setInputFiles({ name: "huge.json", mimeType: "application/json", buffer: Buffer.alloc(4 * 1024 * 1024 + 1, 0x20) });
    await expect(game(page)).toHaveAttribute("data-last-load", "rejected:E-SAVE-TOO-LARGE");
    await expect(page.locator("#notice")).toHaveText("Det gemte spil kunne ikke indlæses (E-SAVE-TOO-LARGE).");
    await menu(page).locator("#import-file").setInputFiles({ name: "save.json", mimeType: "application/json", buffer: Buffer.from(text) });
    await expect(game(page)).toHaveAttribute("data-last-load", "ok:0");
    await waitIdle(page);
    await expect(page.locator('.inv-item[data-item="oilcan"]')).toBeAttached();
  });

  test("language and mute are remembered across a reload (spec 05 E2 settings)", async ({ page }) => {
    await page.goto("./?motion=off");
    await page.locator('#title-screen [data-lang="en"]').click();
    await expect(page.locator("#start")).toHaveText("New game");
    await page.locator("#start").click();
    await confirmLine(page, "line.intro");
    await waitIdle(page);
    await page.locator("#mute").click();
    await expect(game(page)).toHaveAttribute("data-muted", "true");
    await page.reload();
    await expect(page.locator("#start")).toHaveText("New game");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(game(page)).toHaveAttribute("data-muted", "true");
    // ?lang= still wins over the stored choice.
    await page.goto("./?motion=off&lang=da");
    await expect(page.locator("#start")).toHaveText("Nyt spil");
  });
});
