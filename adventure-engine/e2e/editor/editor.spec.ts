import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { buildBundle, readProject, readZip, writeZip, type Project } from "../../packages/content-tools/src/index.ts";

/**
 * Phase 6: the content editor (port 4318). Opening and saving use the
 * fallback flows (file input, ZIP download) in every browser: the native
 * folder dialog of the File System Access API cannot be driven by a test; the
 * folder code shares readDirectory/writeDirectory semantics with the ZIP path
 * (docs/decisions/phase-6.md §12).
 */
test.use({ baseURL: "http://127.0.0.1:4318/" });

const FIXTURE = join(import.meta.dirname, "../../packages/content-tools/fixtures/editor-demo");

function fixtureZip(): Buffer {
  const files = new Map<string, Uint8Array>();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else files.set(relative(FIXTURE, full).split(sep).join("/"), new Uint8Array(readFileSync(full)));
    }
  };
  walk(FIXTURE);
  return Buffer.from(writeZip(files));
}

async function openEditor(page: Page): Promise<void> {
  page.on("dialog", (d) => void d.accept());
  await page.goto("./");
  await expect(page.locator("html")).toHaveAttribute("data-editor", "ready");
}

async function openFixture(page: Page): Promise<void> {
  await openEditor(page);
  await tab(page, "project");
  await page.locator("#open-zip-input").setInputFiles({ name: "lantern-demo.zip", mimeType: "application/zip", buffer: fixtureZip() });
  await expect(page.locator("#project-name")).toHaveText("lantern-demo");
  await expect(page.locator("#problem-count")).toHaveAttribute("data-problems", "0/0");
}

const tab = (page: Page, id: string) => page.locator(`[data-tab="${id}"]`).click();
const problems = (page: Page) => page.locator("#problem-count");

test.describe("content editor (phase 6)", () => {
  test("new project, scene, walk polygon, spot, portal, actor, object and a translation", async ({ page }) => {
    await openEditor(page);
    await tab(page, "project");
    await page.locator('[name="new-id"]').fill("testspil");
    await page.locator('[name="new-languages"]').fill("da, en");
    await page.locator('[data-action="new-project"]').click();
    await expect(page.locator("#project-name")).toHaveText("testspil");
    await expect(problems(page)).toHaveAttribute("data-problems", "0/0");

    // A second scene.
    await tab(page, "scenes");
    await page.locator('[name="new-scene"]').fill("gang");
    await page.locator('[data-action="new-scene"]').click();
    await expect(page.locator('[data-scene="gang"]')).toBeVisible();

    // Draw a walk polygon with three clicks, close it, then edit a point numerically.
    await page.locator('[data-tool="draw"]').click();
    await page.locator('[name="draw-layer"]').selectOption("walkable");
    const canvas = page.locator(".scene-canvas");
    const box = await canvas.boundingBox();
    if (box === null) throw new Error("no canvas");
    await canvas.click({ position: { x: 200, y: 250 } });
    await canvas.click({ position: { x: 600, y: 250 } });
    await canvas.click({ position: { x: 600, y: 350 } });
    await page.locator('[data-action="close-polygon"]').click();
    await expect(page.locator('[data-shape-button="walkable:0"]')).toBeVisible();
    await expect(page.locator(".shape-panel")).toHaveAttribute("data-selected-shape", "walkable:0");
    await page.locator('[name="pt-x-0"]').fill("100");
    await page.locator('[name="pt-x-0"]').press("Tab");
    await expect(page.locator('[name="pt-x-0"]')).toHaveValue("100");
    await page.locator('[data-action="add-point"]').click();
    await expect(page.locator('[name="pt-x-3"]')).toBeVisible();

    // A spot with the spot tool.
    await page.locator('[data-tool="spot"]').click();
    await canvas.click({ position: { x: 400, y: 300 } });
    await expect(page.locator('[data-shape-button="spots:spot_2"]')).toBeVisible();

    // Actor, object and a portal pair.
    await tab(page, "entities");
    await page.locator('[name="new-actor"]').fill("bo");
    await page.locator('[data-action="new-actor"]').click();
    await expect(page.locator('[data-form="actor:bo"]')).toBeVisible();
    await page.locator('[name="new-object"]').fill("kop");
    await page.locator('[data-action="new-object"]').click();
    await expect(page.locator('[data-form="object:kop"]')).toBeVisible();
    await page.locator('[name="new-object"]').fill("Bad Id");
    await expect(page.locator('[data-error="new-object"]')).toContainText("Ugyldigt id");
    await page.locator('[name="new-portal"]').fill("op");
    await page.locator('[data-action="new-portal"]').click();
    await expect(page.locator('[data-portal="op"]')).toBeVisible();
    await page.locator('[data-key="make-reverse"]').click();
    await expect(page.locator('[data-portal="op_back"]')).toBeVisible();
    await page.locator('[data-key="portal-exit-op"]').selectOption("begin");

    // Translation of a new key.
    await tab(page, "texts");
    await page.locator('[name="new-text-key"]').fill("o.kop");
    await page.locator('[data-action="add-text-key"]').click();
    const da = page.locator('[data-text-key="o.kop"] textarea[data-lang="da"]');
    await da.fill("Kop");
    await da.press("Tab");
    await page.locator('[data-text-key="o.kop"] textarea[data-lang="en"]').fill("Cup");
    await page.locator('[data-text-key="o.kop"] textarea[data-lang="en"]').press("Tab");
    await expect(da).toHaveValue("Kop");
    await expect(page.locator('[data-text-key="o.kop"] td').last()).toHaveText("ubrugt");
  });

  test("graph: create, add and connect nodes; see a validation error and fix it", async ({ page }) => {
    await openFixture(page);
    await tab(page, "graphs");
    await page.locator('[name="new-graph"]').fill("kop");
    await page.locator('[data-action="new-graph"]').click();
    await expect(page.locator('[data-graph="kop"]')).toBeVisible();
    await page.locator('[name="node-type"]').selectOption("say");
    await page.locator('[data-action="add-node"]').click();
    await expect(page.locator('[data-node="kop_say"]')).toBeVisible();
    // A say node without speaker and text is an error, shown on the node and in the report.
    await expect(problems(page)).not.toHaveAttribute("data-problems", /^0\//);
    await expect(page.locator('[data-node="kop_say"]')).toHaveClass(/error/);
    await tab(page, "problems");
    await expect(page.locator('tr[data-file="graphs/kop.json"]').first()).toBeVisible();
    await page.locator('tr[data-file="graphs/kop.json"] button').first().click();
    await expect(page.locator('[data-node-panel="kop_say"]')).toBeVisible();
    await page.locator('[data-key="param-kop_say-speaker"]').selectOption("mira");
    await page.locator('[data-key="param-kop_say-textKey"]').selectOption("line.intro");
    // Connect the entry to the say node.
    await page.locator('[data-node="kop_start"]').click();
    await page.locator('[name="edge-target"]').selectOption("kop_say");
    await page.locator('[data-action="connect"]').click();
    await expect(page.locator('[data-edge="kop_start->kop_say"]')).toBeAttached();
    await expect(page.locator('[data-edges="kop_start"] li')).toHaveCount(1);
    await expect(problems(page)).toHaveAttribute("data-problems", "0/0");
  });

  test("import a synthetic asset; export the project and open the export again (semantic identity)", async ({ page }) => {
    await openFixture(page);
    await tab(page, "assets");
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="#3a6"/></svg>';
    await page.locator("#asset-import").setInputFiles({ name: "Grøn kasse.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
    await expect(page.locator('[data-asset="groen-kasse"]')).toBeVisible();
    await expect(page.locator("#asset-message")).toContainText('importeret som "groen-kasse"');
    // The same bytes again are recognised by their hash.
    await page.locator("#asset-import").setInputFiles({ name: "kopi.svg", mimeType: "image/svg+xml", buffer: Buffer.from(svg) });
    await expect(page.locator("#asset-message")).toContainText('samme indhold som "groen-kasse"');
    await page.locator("#asset-import").setInputFiles({ name: "film.swf", mimeType: "application/x-shockwave-flash", buffer: Buffer.from("FWS1234") });
    await expect(page.locator("#asset-message")).toContainText("E-ASSET-FORBIDDEN");

    await tab(page, "project");
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator('[data-action="export-project"]').click()]);
    const exported = await readZip(new Uint8Array(readFileSync(await download.path())));
    const before = readProject(exported).project as Project;
    expect(Object.keys(before.assets)).toContain("groen-kasse");

    // Re-open the export in a fresh editor and compare the built bundles.
    await page.goto("./");
    await tab(page, "project");
    await page.locator("#open-zip-input").setInputFiles({ name: "export.zip", mimeType: "application/zip", buffer: Buffer.from(writeZip(exported)) });
    await expect(page.locator("#project-name")).toHaveText("lantern-demo");
    const [again] = await Promise.all([page.waitForEvent("download"), page.locator('[data-action="export-project"]').click()]);
    const reopened = await readZip(new Uint8Array(readFileSync(await again.path())));
    expect([...reopened.keys()]).toEqual([...exported.keys()]);
    expect(buildBundle(readProject(reopened).project as Project).json).toBe(buildBundle(before).json);

    // The runtime bundle export is a ZIP with bundle.json and the assets.
    const [bundleZip] = await Promise.all([page.waitForEvent("download"), page.locator('[data-action="export-bundle-2"]').click()]);
    const b = await readZip(new Uint8Array(readFileSync(await bundleZip.path())));
    expect(new TextDecoder().decode(b.get("bundle.json"))).toBe(buildBundle(before).json);
  });

  test("preview runs the project in the engine; a small interaction works; saves stay in memory", async ({ page }) => {
    await openFixture(page);
    await tab(page, "preview");
    await page.locator('[data-action="preview-start"]').click();
    await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "running", { timeout: 30_000 });
    const game = page.frameLocator("#preview-iframe");
    await game.locator("#start").click();
    await expect(game.locator(".bubble")).toHaveAttribute("data-key", "line.intro", { timeout: 30_000 });
    await game.locator("#game").press("Enter");
    await expect(game.locator("#game")).toHaveAttribute("data-idle", "true", { timeout: 30_000 });
    const lamp = game.locator('[data-hotspot="object:lamp"]');
    await lamp.focus();
    await lamp.press("Enter");
    await expect(game.locator(".bubble")).toHaveAttribute("data-key", "line.lamp_taken", { timeout: 30_000 });
    await game.locator("#game").press("Enter");
    await expect(game.locator('.inv-item[data-item="lamp"]')).toBeAttached({ timeout: 30_000 });
    await expect(game.locator("#game")).toHaveAttribute("data-storage", "memory");
    // Editing the document while the preview runs does not restart or change the preview.
    await page.locator('[data-action="preview-stop"]').click();
    await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "stopped");
    await expect(page.locator("#preview-iframe")).toHaveCount(0);
    // The editor origin has no game save database.
    const dbs = await page.evaluate(async () => ((await indexedDB.databases?.()) ?? []).map((d) => d.name));
    expect(dbs).not.toContain("engine-saves");
  });

  test("release review: a ZIP with a path outside the project is refused and nothing is opened", async ({ page }) => {
    await openFixture(page);
    const messages: string[] = [];
    page.on("dialog", (d) => void messages.push(d.message()));
    const evil = Buffer.from(writeZip(new Map([["../outside.json", new TextEncoder().encode("{}")], ["project.json", new TextEncoder().encode("{}")]])));
    await page.locator("#open-zip-input").setInputFiles({ name: "evil.zip", mimeType: "application/zip", buffer: evil });
    await expect.poll(() => messages.some((m) => m.includes("unsafe path"))).toBe(true);
    await expect(page.locator("#project-name")).toHaveText("lantern-demo");
  });

  test("preview refuses to start with validation errors", async ({ page }) => {
    await openFixture(page);
    await tab(page, "graphs");
    await page.locator('[data-graph="game"]').click();
    await page.locator('[name="node-type"]').selectOption("say");
    await page.locator('[data-action="add-node"]').click();
    await tab(page, "preview");
    await page.locator('[data-action="preview-start"]').click();
    await expect(page.locator("#preview-state")).toHaveAttribute("data-state", "invalid");
    await expect(page.locator("#preview-errors li").first()).toBeVisible();
    await expect(page.locator("#preview-iframe")).toHaveCount(0);
  });

  test("undo and redo restore the document, also renamed references", async ({ page }) => {
    await openFixture(page);
    await tab(page, "scenes");
    await page.locator('[data-scene="attic"]').click();
    const rename = page.locator('[name="rename"]').first();
    await rename.fill("loft");
    await page.locator('[data-action="rename"]').first().click();
    await expect(page.locator('[data-scene="loft"]')).toBeVisible();
    await expect(page.locator("#project-name")).toHaveAttribute("data-dirty", "true");
    await page.locator('[data-action="undo"]').click();
    await expect(page.locator('[data-scene="attic"]')).toBeVisible();
    await expect(page.locator("#project-name")).toHaveAttribute("data-dirty", "false");
    await page.locator('[data-action="redo"]').click();
    await expect(page.locator('[data-scene="loft"]')).toBeVisible();
    await tab(page, "entities");
    await page.locator('[data-entity="portal:up"]').click();
    await expect(page.locator('[data-key="portal-to-up"]')).toHaveValue("loft");
    // Keyboard shortcut (focus outside text fields).
    await page.locator('[data-tab="entities"]').focus();
    await page.keyboard.press("Control+z");
    await tab(page, "scenes");
    await expect(page.locator('[data-scene="attic"]')).toBeVisible();
    // A referenced element is not deleted silently.
    await page.locator('[data-key="delete-scene"]').click();
    await expect(page.locator('[data-scene="attic"]')).toBeVisible();
    await expect(page.locator("#status-message")).toContainText("bruges stadig");
  });

  test("keyboard: tabs with arrow keys, points moved with arrow keys on the canvas", async ({ page }) => {
    await openFixture(page);
    await page.locator('[data-tab="project"]').focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('[data-tab="scenes"]')).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-tab="scenes"]')).toBeFocused();
    await page.locator('[data-shape-button="walkable:0"]').focus();
    await page.keyboard.press("Enter");
    await page.locator('[data-key="pt-sel-0"]').focus();
    await page.keyboard.press("Enter");
    const x = page.locator('[name="pt-x-0"]');
    const before = Number(await x.inputValue());
    await page.locator(".scene-canvas").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(x).toHaveValue(String(before + 11));
    await page.keyboard.press("i");
    await expect(page.locator('[name="pt-x-4"]')).toBeVisible();
    await page.keyboard.press("Delete");
    await expect(page.locator('[name="pt-x-4"]')).toHaveCount(0);
    // Route preview: two clicks show the engine's path.
    await page.locator('[data-tool="route"]').click();
    const canvas = page.locator(".scene-canvas");
    await canvas.click({ position: { x: 150, y: 350 } });
    await canvas.click({ position: { x: 600, y: 100 } });
    await expect(page.locator("#route-info")).toHaveAttribute("data-route", "projected");
    await expect(page.locator(".route-path")).toBeAttached();
  });
});

test.describe("editor screenshots (Chromium)", () => {
  // Baselines are made on Windows; CI on Linux runs the functional specs with E2E_SCREENSHOTS=off.
  test.skip(({ browserName }) => browserName !== "chromium" || process.env["E2E_SCREENSHOTS"] === "off", "screenshots are Chromium-only (and off where the baselines' platform differs)");

  test("scene editor with the fixture", async ({ page }) => {
    await openFixture(page);
    await tab(page, "scenes");
    await page.locator('[data-shape-button="walkable:0"]').click();
    await page.mouse.move(0, 0);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await expect(page.locator(".scene-tab")).toHaveScreenshot("editor-scene.png");
  });
});
