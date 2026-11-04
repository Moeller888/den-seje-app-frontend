import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * D-341: the teacher review page (docs/laerligverse/kildekritik-laerergennemgang.html) in a real browser.
 * Opened as a FILE (file://) — the way a teacher opens it without any server. Proves: nothing is pre-approved,
 * the three decisions + comment + change request can be entered, saving requires a name and date (and a change
 * text for "Skal rettes"), and a saved file loads back without data loss. No network is used by the page.
 */
const PAGE = new URL("../../docs/laerligverse/kildekritik-laerergennemgang.html", import.meta.url).href;

test("lærergennemgang: intet er forhåndsgodkendt; afgørelser gemmes og indlæses uden tab", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (r) => { if (!r.url().startsWith("file:") && !r.url().startsWith("blob:") && !r.url().startsWith("data:")) requests.push(r.url()); });
  await page.goto(PAGE);

  // Nothing is pre-approved.
  const ids = await page.locator("section.el[data-status]").evaluateAll((els) => els.map((e) => e.id));
  expect(ids.length).toBe(12);
  for (const id of ids) await expect(page.locator(`input[name="st-${id}"][value="ikke_gennemgaaet"]`)).toBeChecked();
  await expect(page.locator("#count")).toHaveText(`0 af ${ids.length} gennemgået`);

  // Decide three elements: one of each.
  await page.locator('input[name="st-h4-kilde"][value="godkendt"]').check();
  await page.locator('textarea[name="km-h4-kilde"]').fill("Fin kilde. Æøå bevares.");
  await page.locator('input[name="st-t1864"][value="skal_rettes"]').check();
  await page.locator('input[name="st-h4-genbesoeg"][value="afvist"]').check();
  await page.locator('textarea[name="km-h4-genbesoeg"]').fill("For let.");
  await expect(page.locator("#count")).toHaveText(`3 af ${ids.length} gennemgået`);
  await expect(page.locator("#t1864")).toHaveAttribute("data-status", "skal_rettes");

  // Saving requires a teacher name and a date …
  await page.locator("#save").click();
  await expect(page.locator("#msg")).toHaveText("Skriv dit navn og datoen, før du gemmer afgørelser.");
  await page.locator("#laerer").fill("Test Lærer");
  await page.locator("#dato").fill("2026-11-04");
  // … and a change text for "Skal rettes".
  await page.locator("#save").click();
  await expect(page.locator("#msg")).toHaveText("Skriv, hvad der skal rettes, for: t1864");
  await page.locator('textarea[name="ae-t1864"]').fill("Tilføj, at Dybbøl blev stormet den 18. april.");

  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#save").click()]);
  // An ASCII temp path: setInputFiles cannot read a non-ASCII Windows path in Chromium/Firefox (a teacher picks the file in a dialog).
  const saved = join(mkdtempSync(join(tmpdir(), "lv-review-")), "afgoerelser.json");
  await download.saveAs(saved);
  type Decision = { status: string; kommentar: string; aendringer: string };
  const data = JSON.parse(readFileSync(saved, "utf8")) as { laerer: string; dato: string; elementer: Record<string, Decision> };
  expect(data.laerer).toBe("Test Lærer");
  expect(data.dato).toBe("2026-11-04");
  expect(data.elementer["h4-kilde"]).toEqual({ status: "godkendt", kommentar: "Fin kilde. Æøå bevares.", aendringer: "" });
  expect(data.elementer.t1864).toEqual({ status: "skal_rettes", kommentar: "", aendringer: "Tilføj, at Dybbøl blev stormet den 18. april." });
  expect(data.elementer["h4-genbesoeg"]?.status).toBe("afvist");
  expect(Object.values(data.elementer).filter((v) => v.status === "ikke_gennemgaaet").length).toBe(ids.length - 3);

  // A fresh page (nothing remembered) loads the file back: every value restored.
  await page.goto(PAGE);
  await expect(page.locator('input[name="st-h4-kilde"][value="ikke_gennemgaaet"]')).toBeChecked();
  writeFileSync(saved, JSON.stringify(data));
  await page.locator("#load").setInputFiles(saved);
  await expect(page.locator("#msg")).toHaveText("Afgørelser indlæst.");
  await expect(page.locator("#laerer")).toHaveValue("Test Lærer");
  await expect(page.locator("#dato")).toHaveValue("2026-11-04");
  await expect(page.locator('input[name="st-h4-kilde"][value="godkendt"]')).toBeChecked();
  await expect(page.locator('input[name="st-t1864"][value="skal_rettes"]')).toBeChecked();
  await expect(page.locator('input[name="st-h4-genbesoeg"][value="afvist"]')).toBeChecked();
  await expect(page.locator('textarea[name="km-h4-kilde"]')).toHaveValue("Fin kilde. Æøå bevares.");
  await expect(page.locator('textarea[name="ae-t1864"]')).toHaveValue("Tilføj, at Dybbøl blev stormet den 18. april.");
  await expect(page.locator("#count")).toHaveText(`3 af ${ids.length} gennemgået`);

  expect(requests).toEqual([]);
});
