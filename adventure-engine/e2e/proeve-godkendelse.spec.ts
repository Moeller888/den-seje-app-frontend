import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/**
 * D-346: the teacher's approval page for the measurement material (docs/laerligverse/proeve-godkendelse.html),
 * opened as a FILE, the way a teacher can open it without a server. Proves: nothing pre-approved; the decisions,
 * all comment fields, the five ambiguities and the LP-13 choices are saved and load back without loss; a bad or
 * hostile file is refused or shown as plain text; a decision on changed content must be reviewed again; and the
 * read-aloud prototype uses LOCAL voices only. The page makes no network request.
 */
const PAGE = new URL("../../docs/laerligverse/proeve-godkendelse.html", import.meta.url).href;
const ITEMS = ["A", "B", "T", "C", "rubrik"];
const FIELDS = ["faglig", "historisk", "sprog", "svaerhed", "elevforstaaelse", "aendringer"];

type Item = Record<string, string>;
type Saved = {
  format: string; laerer: string; dato: string; indhold: Record<string, string>;
  proever: Record<string, Item>; tvetydigheder: Record<string, { valg: string; kommentar: string }>; rubrikbeslutninger: Record<string, { valg: string; kommentar: string }>; lp13: Record<string, { valg: string; kommentar: string }>;
};

function watchNetwork(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (r) => { if (!/^(file|blob|data):/.test(r.url())) requests.push(r.url()); });
  return requests;
}

async function saveTo(page: Page, name: string): Promise<{ path: string; data: Saved }> {
  const [download] = await Promise.all([page.waitForEvent("download"), page.locator("#save").click()]);
  // An ASCII temp path: setInputFiles cannot read a non-ASCII Windows path in Chromium/Firefox.
  const path = join(mkdtempSync(join(tmpdir(), "lv-proeve-")), name);
  await download.saveAs(path);
  return { path, data: JSON.parse(readFileSync(path, "utf8")) as Saved };
}

test("prøvegodkendelse: intet er forhåndsgodkendt; afgørelser, kommentarer, tvivlstilfælde og LP-13 gemmes og indlæses uden tab", async ({ page }) => {
  const requests = watchNetwork(page);
  await page.goto(PAGE);
  for (const id of ITEMS) await expect(page.locator(`input[name="st-${id}"][value="ikke_gennemgaaet"]`)).toBeChecked();
  await expect(page.locator("#count")).toHaveText("0 af 5 gennemgået · 0 af 5 tvivlstilfælde");
  await expect(page.locator('input[name="tv-S4"][value="ikke_besluttet"]')).toBeChecked();
  await expect(page.locator('input[name="lp-LP13-7"][value="ikke_besluttet"]')).toBeChecked();
  await expect(page.locator('input[name="rb-T1"][value="ikke_besluttet"]')).toBeChecked();
  // The key is behind the teacher's fold.
  await expect(page.locator("#A details.teacher")).not.toHaveAttribute("open", "");

  await page.locator('input[name="st-A"][value="godkendt"]').check();
  for (const f of FIELDS) await page.locator(`textarea[name="${f}-A"]`).fill(`${f}: æøå ÆØÅ`);
  await page.locator('input[name="st-B"][value="skal_rettes"]').check();
  await page.locator('input[name="st-T"][value="afvist"]').check();
  await page.locator('input[name="tv-S4"][value="1"]').check();
  await page.locator('textarea[name="tvk-S4"]').fill("Ræsonnementet bruger ophavet forkert.");
  await page.locator('input[name="lp-LP13-1"][value="A"]').check();
  await page.locator('input[name="rb-T1"][value="saerskilt"]').check();
  await page.locator('textarea[name="rbk-T1"]').fill("Et bart nej giver 0; svaret noteres for sig.");
  await page.locator('input[name="lp-genbesoeg"][value="B"]').check();
  await expect(page.locator("#count")).toHaveText("3 af 5 gennemgået · 1 af 5 tvivlstilfælde");
  await expect(page.locator("#B")).toHaveAttribute("data-status", "skal_rettes");

  await page.locator("#save").click();
  await expect(page.locator("#msg")).toHaveText("Skriv dit navn og datoen, før du gemmer afgørelser.");
  await page.locator("#laerer").fill("Test Lærer");
  await page.locator("#dato").fill("04-11-2026");
  await page.locator("#save").click();
  await expect(page.locator("#msg")).toHaveText("Skriv, hvad der skal rettes, for: B");
  await page.locator('textarea[name="aendringer-B"]').fill("Gør modtageren lige så svær som i A.");

  const { path, data } = await saveTo(page, "proeve.json");
  expect(data.format).toBe("laerligverse-proeve-godkendelse/1");
  expect(data.laerer).toBe("Test Lærer");
  expect(data.dato).toBe("04-11-2026");
  expect(Object.keys(data.indhold).sort()).toEqual([...ITEMS].sort());
  expect(data.proever.A?.status).toBe("godkendt");
  for (const f of FIELDS) expect(data.proever.A?.[f]).toBe(`${f}: æøå ÆØÅ`);
  expect(data.proever.B).toMatchObject({ status: "skal_rettes", aendringer: "Gør modtageren lige så svær som i A." });
  expect(data.proever.T?.status).toBe("afvist");
  expect(data.proever.C?.status).toBe("ikke_gennemgaaet");
  expect(data.tvetydigheder.S4).toEqual({ valg: "1", kommentar: "Ræsonnementet bruger ophavet forkert." });
  expect(data.tvetydigheder.S2?.valg).toBe("ikke_besluttet");
  expect(data.lp13["LP13-1"]?.valg).toBe("A");
  expect(data.rubrikbeslutninger.T1).toEqual({ valg: "saerskilt", kommentar: "Et bart nej giver 0; svaret noteres for sig." });
  expect(data.lp13.genbesoeg?.valg).toBe("B");
  expect(data.lp13.pilot?.valg).toBe("ikke_besluttet");

  // A fresh page loads the file back: every value restored.
  await page.goto(PAGE);
  await expect(page.locator('input[name="st-A"][value="ikke_gennemgaaet"]')).toBeChecked();
  await page.locator("#load").setInputFiles(path);
  await expect(page.locator("#msg")).toHaveText("Afgørelser indlæst.");
  await expect(page.locator("#laerer")).toHaveValue("Test Lærer");
  await expect(page.locator("#dato")).toHaveValue("04-11-2026");
  await expect(page.locator('input[name="st-A"][value="godkendt"]')).toBeChecked();
  await expect(page.locator('input[name="st-B"][value="skal_rettes"]')).toBeChecked();
  await expect(page.locator('input[name="st-T"][value="afvist"]')).toBeChecked();
  for (const f of FIELDS) await expect(page.locator(`textarea[name="${f}-A"]`)).toHaveValue(`${f}: æøå ÆØÅ`);
  await expect(page.locator('input[name="tv-S4"][value="1"]')).toBeChecked();
  await expect(page.locator('textarea[name="tvk-S4"]')).toHaveValue("Ræsonnementet bruger ophavet forkert.");
  await expect(page.locator('input[name="lp-genbesoeg"][value="B"]')).toBeChecked();
  await expect(page.locator('input[name="rb-T1"][value="saerskilt"]')).toBeChecked();
  await expect(page.locator('textarea[name="rbk-T1"]')).toHaveValue("Et bart nej giver 0; svaret noteres for sig.");
  await expect(page.locator("#count")).toHaveText("3 af 5 gennemgået · 1 af 5 tvivlstilfælde");
  // Saving again gives the same decisions (no loss on a round trip).
  const again = await saveTo(page, "proeve2.json");
  expect(again.data).toEqual(data);
  expect(requests).toEqual([]);
});

test("prøvegodkendelse: ugyldige og fjendtlige filer afvises eller vises som ren tekst; ændret indhold skal gennemgås igen", async ({ page }) => {
  const requests = watchNetwork(page);
  await page.goto(PAGE);
  const dir = mkdtempSync(join(tmpdir(), "lv-proeve-bad-"));
  const write = (name: string, body: string) => { const p = join(dir, name); writeFileSync(p, body); return p; };

  await page.locator("#load").setInputFiles(write("broken.json", "{ikke json"));
  await expect(page.locator("#msg")).toContainText("Filen kunne ikke læses:");
  await page.locator("#load").setInputFiles(write("other.json", JSON.stringify({ laerer: "x", elementer: {} })));
  await expect(page.locator("#msg")).toContainText("det er ikke en prøvegodkendelsesfil");
  await expect(page.locator("#laerer")).toHaveValue("");

  // A real file to start from.
  await page.locator('input[name="st-C"][value="godkendt"]').check();
  await page.locator("#laerer").fill("Test Lærer");
  await page.locator("#dato").fill("04-11-2026");
  const { data } = await saveTo(page, "base.json");

  // Hostile text in comments and name: must stay text, never run.
  const hostile = `<img src=x onerror="window.__pwned=1"><script>window.__pwned=2</script>`;
  const evil = structuredClone(data);
  evil.laerer = hostile;
  if (evil.proever.A) evil.proever.A.faglig = hostile;
  if (evil.tvetydigheder.S2) evil.tvetydigheder.S2.kommentar = hostile;
  await page.goto(PAGE);
  await page.locator("#load").setInputFiles(write("evil.json", JSON.stringify(evil)));
  await expect(page.locator("#msg")).toHaveText("Afgørelser indlæst.");
  await expect(page.locator('textarea[name="faglig-A"]')).toHaveValue(hostile);
  await expect(page.locator("#laerer")).toHaveValue(hostile);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);

  // A decision made on content that has since changed is reset and flagged — never carried over silently.
  const stale = structuredClone(data);
  stale.indhold.C = "0".repeat(64);
  await page.goto(PAGE);
  await page.locator("#load").setInputFiles(write("stale.json", JSON.stringify(stale)));
  await expect(page.locator("#msg")).toHaveText("Afgørelser indlæst. Ændret indhold skal gennemgås igen: C");
  await expect(page.locator('input[name="st-C"][value="ikke_gennemgaaet"]')).toBeChecked();
  await expect(page.locator("#C .stale")).toHaveText("Indholdet er ændret efter din afgørelse (Godkendt). Gennemgå det igen.");
  expect(requests).toEqual([]);
});

test("prøvegodkendelse: lærerens registrerede fil (05-11-2026) — ændret indhold nulstilles, S6/S7/T1/LP-13 bevares, ny dato skal være DD-MM-ÅÅÅÅ", async ({ page }) => {
  const requests = watchNetwork(page);
  // The registered original, copied to an ASCII temp path (setInputFiles cannot read non-ASCII Windows paths).
  const src = new URL("../../docs/laerligverse/proeve-godkendelse-2026-11-05.json", import.meta.url);
  const original = JSON.parse(readFileSync(src, "utf8")) as Saved;
  const path = join(mkdtempSync(join(tmpdir(), "lv-proeve-reg-")), "registreret.json");
  writeFileSync(path, readFileSync(src));
  await page.goto(PAGE);
  // The overview states the real status from the register; nothing is shown as approved for changed content.
  for (const id of ITEMS) await expect(page.locator(`td[data-reg="${id}"]`)).toContainText("Afventer fornyet lærergodkendelse");
  await page.locator("#load").setInputFiles(path);
  // All five changed after the approval (fact check + the decided rules), so all five must be reviewed again.
  await expect(page.locator("#msg")).toHaveText("Afgørelser indlæst. Ændret indhold skal gennemgås igen: A, B, T, C, rubrik");
  for (const id of ITEMS) {
    await expect(page.locator(`input[name="st-${id}"][value="ikke_gennemgaaet"]`)).toBeChecked();
    await expect(page.locator(`#${id} .stale`)).toHaveText("Indholdet er ændret efter din afgørelse (Godkendt). Gennemgå det igen.");
  }
  // The original values are loaded as they are — not corrected silently.
  await expect(page.locator("#laerer")).toHaveValue("chri");
  await expect(page.locator("#dato")).toHaveValue("05-11/2026");
  await expect(page.locator('input[name="tv-S6"][value="foelgefejl"]')).toBeChecked();
  await expect(page.locator('input[name="tv-S7"][value="spoerg"]')).toBeChecked();
  for (const id of ["S2", "S3", "S4"]) await expect(page.locator(`input[name="tv-${id}"][value="ikke_besluttet"]`)).toBeChecked();
  await expect(page.locator('input[name="rb-T1"][value="saerskilt"]')).toBeChecked();
  for (const [id, v] of Object.entries(original.lp13)) await expect(page.locator(`input[name="lp-${id}"][value="${v.valg}"]`)).toBeChecked();
  // The registered decision and its origin are visible at each ambiguity.
  await expect(page.locator("#tv-S2 .reg")).toContainText("supplement-2026-11-05");
  await expect(page.locator("#tv-S6 .reg")).toContainText("proeve-godkendelse-2026-11-05.json");
  // A new file needs a full date in DD-MM-ÅÅÅÅ.
  await page.locator("#save").click();
  await expect(page.locator("#msg")).toHaveText("Skriv datoen som DD-MM-ÅÅÅÅ, fx 05-11-2026.");
  expect(requests).toEqual([]);
});

/** A fake speechSynthesis, installed before the page runs: records every call; voices set per test. */
async function fakeSpeech(page: Page, voices: { name: string; lang: string; localService: boolean }[]) {
  await page.addInitScript((vs) => {
    const calls: { op: string; text?: string; lang?: string; voice?: string; rate?: number }[] = [];
    (window as unknown as { __calls: typeof calls }).__calls = calls;
    class Utterance { text: string; lang = ""; voice: { name: string } | null = null; rate = 1; onend: (() => void) | null = null; onerror: (() => void) | null = null; constructor(t: string) { this.text = t; } }
    const synth = {
      paused: false,
      getVoices: () => vs,
      speak: (u: Utterance) => { calls.push({ op: "speak", text: u.text, lang: u.lang, voice: u.voice?.name ?? "", rate: u.rate }); },
      pause: () => { calls.push({ op: "pause" }); },
      resume: () => { calls.push({ op: "resume" }); },
      cancel: () => { calls.push({ op: "cancel" }); },
      addEventListener: () => {},
    };
    Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utterance, configurable: true });
  }, voices);
}
const calls = (page: Page) => page.evaluate(() => (window as unknown as { __calls: { op: string; text?: string; lang?: string; voice?: string }[] }).__calls);

test("oplæsning (prototype): slået fra som standard; kun lokale danske stemmer; start, pause, fortsæt, stop og gentag", async ({ page }) => {
  const requests = watchNetwork(page);
  await fakeSpeech(page, [
    { name: "Netværksstemme dansk", lang: "da-DK", localService: false },
    { name: "Lokal Helle", lang: "da-DK", localService: true },
    { name: "Local English", lang: "en-GB", localService: true },
  ]);
  await page.goto(PAGE);
  await expect(page.locator("#ra-on")).not.toBeChecked();
  await expect(page.locator("#A .ra")).toBeHidden();
  await page.locator("#ra-on").check();
  await expect(page.locator("#ra-voice")).toHaveText("Lokal dansk stemme: Lokal Helle");

  await page.locator("#A .ra-play").click();
  await expect(page.locator("#A .ra-msg")).toHaveText("Læser op (Lokal Helle).");
  await page.locator("#A .ra-pause").click();
  await page.locator("#A .ra-resume").click();
  await page.locator("#A .ra-stop").click();
  await expect(page.locator("#A .ra-msg")).toHaveText("Stoppet.");
  await page.locator("#A .ra-play").click();
  const c = await calls(page);
  expect(c.map((x) => x.op)).toEqual(["cancel", "speak", "pause", "resume", "cancel", "cancel", "speak"]);
  const spoken = c.filter((x) => x.op === "speak");
  for (const s of spoken) {
    expect(s.lang).toBe("da-DK");
    expect(s.voice).toBe("Lokal Helle");
    expect(s.text).toContain("Til Magistraten");
    // The student's text only — never the teacher's key.
    expect(s.text).not.toContain("Facit");
    expect(s.text).not.toContain("Afsenderens egen opfattelse");
  }
  expect(requests).toEqual([]);
});

test("oplæsning (prototype): ingen lokal dansk stemme → tydelig besked, og der tales ikke (ingen netværksstemme som reserve)", async ({ page }) => {
  await fakeSpeech(page, [
    { name: "Netværksstemme dansk", lang: "da-DK", localService: false },
    { name: "Local English", lang: "en-GB", localService: true },
  ]);
  await page.goto(PAGE);
  await page.locator("#ra-on").check();
  await expect(page.locator("#ra-voice")).toHaveText("Ingen lokal dansk stemme på denne computer.");
  await page.locator("#B .ra-play").click();
  await expect(page.locator("#B .ra-msg")).toHaveText("Ingen lokal dansk stemme. Siden bruger ikke netværksstemmer.");
  expect((await calls(page)).filter((x) => x.op === "speak")).toEqual([]);
});
