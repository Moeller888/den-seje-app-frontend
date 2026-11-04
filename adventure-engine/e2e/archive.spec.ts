import { expect, test, type FrameLocator, type Page } from "@playwright/test";

/**
 * Arkivskabet (D-307 Trin A): the whole chain in a browser, on two real origins —
 * the host page on 127.0.0.1:4320 and the game iframe on 127.0.0.1:4321.
 *
 * The "server" is the TEST ADAPTER (FakeTaskService) in the host page. These tests prove the bridge, the
 * world binding and the isolation; they prove nothing about Lærlig's backend.
 */
const HOST = "http://127.0.0.1:4320";
const GAME = "http://127.0.0.1:4321";

const game = (page: Page): FrameLocator => page.frameLocator("#lv-game");

async function startGame(page: Page): Promise<FrameLocator> {
  await page.goto(`${HOST}/host.html?motion=off`);
  const f = game(page);
  await expect(f.locator("#lv-connection")).toHaveText("Forbundet");
  await f.locator("#start").click();
  await confirmLine(page, "line.intro");
  return f;
}

async function confirmLine(page: Page, key: string): Promise<void> {
  const bubble = game(page).locator(".bubble");
  await expect(bubble).toHaveAttribute("data-key", key, { timeout: 30_000 });
  await bubble.focus().catch(() => undefined);
  await page.keyboard.press("Enter");
}

/** Walk to the cabinet through the keyboard-accessible list of things in the scene. */
async function useCabinet(page: Page): Promise<void> {
  const f = game(page);
  await expect(f.locator("#game")).toHaveAttribute("data-idle", "true", { timeout: 30_000 });
  const button = f.locator('[data-hotspot="object:cabinet"]');
  await button.focus();
  await page.keyboard.press("Enter");
}

/** Phase 1 (D-310): two content cards, then the comprehension check, which shows one explanation for any choice. */
async function passIntro(f: FrameLocator, choice = 0): Promise<void> {
  await expect(f.locator("#lv-intro")).toBeVisible();
  await expect(f.locator('#lv-intro [data-card="0"]')).toContainText("9. april 1940");
  await f.locator("#lv-intro-next").click();
  await expect(f.locator('#lv-intro [data-card="1"]')).toContainText("Hvem har lavet den?");
  await f.locator("#lv-intro-next").click();
  // D-332: context and "what the source can and cannot be evidence for" are introduced before any task.
  await expect(f.locator('#lv-intro [data-card="2"]')).toContainText("Kontekst er situationen");
  await f.locator("#lv-intro-next").click();
  await expect(f.locator("#lv-intro-next")).toBeDisabled();
  await f.locator(`#lv-intro [data-check="${choice}"]`).click();
  await expect(f.locator("#lv-intro-explanation")).toContainText("Generalens egen ordre");
  await f.locator("#lv-intro-next").click();
  await expect(f.locator("#lv-intro")).toBeHidden();
}

/** D-322: the local archive-card practice after the introduction. `wrongFirst` swaps two facts first. */
async function fillArchiveCard(f: FrameLocator, wrongFirst = false): Promise<void> {
  const card = f.locator("#lv-archive-card");
  await expect(card).toBeVisible();
  await expect(card.locator(".lv-activity")).toHaveText("Øvelse · tæller ikke");
  await expect(f.locator("#lv-archive-card-check")).toBeDisabled();
  const right = { f1: "afsender", f2: "tid", f3: "modtager", f4: "formaal" } as const;
  const first = wrongFirst ? { ...right, f1: "tid", f2: "afsender" } : right;
  for (const [id, field] of Object.entries(first)) await f.locator(`#lv-fact-${id}`).selectOption(field);
  await f.locator("#lv-archive-card-check").click();
  if (wrongFirst) {
    await expect(card).toHaveAttribute("data-state", "retry");
    await expect(f.locator("#lv-why-f1")).toContainText("hvem der har lavet kilden");
    await expect(f.locator("#lv-why-f3")).toBeHidden();
    await expect(f.locator("#lv-archive-card-next")).toBeHidden();
    await f.locator("#lv-fact-f1").selectOption("afsender");
    await f.locator("#lv-fact-f2").selectOption("tid");
    await f.locator("#lv-archive-card-check").click();
  }
  await expect(card).toHaveAttribute("data-state", "done");
  await f.locator("#lv-archive-card-next").click();
  await expect(card).toBeHidden();
}

/** Pick a source, name what decided it, commit. */
async function choose(f: FrameLocator, option: string, reason = "hvem"): Promise<void> {
  await f.locator(`.lv-card[data-option="${option}"]`).click();
  await f.locator(`[data-reason="${reason}"]`).click();
  await f.locator("#lv-commit").click();
}

/** Phase 2: open the descriptions of the first `n` sources. */
/** Step 2: turn over every document that is still face up (D-322 QA: all of them are required). */
async function investigate(f: FrameLocator): Promise<void> {
  const n = await f.locator(".lv-inspect").count();
  for (let i = 0; i < n; i++) {
    const b = f.locator(".lv-inspect").nth(i);
    if ((await b.getAttribute("aria-expanded")) === "false") await b.click();
  }
}

async function openTask(page: Page): Promise<FrameLocator> {
  const f = await startGame(page);
  await useCabinet(page);
  await confirmLine(page, "line.cabinet_locked");
  await passIntro(f);
  await fillArchiveCard(f);
  await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open");
  return f;
}

async function ledger(page: Page): Promise<{ xp: string; coins: string; graded: string }> {
  return {
    xp: (await page.locator("#ledger-xp").textContent()) ?? "",
    coins: (await page.locator("#ledger-coins").textContent()) ?? "",
    graded: (await page.locator("#ledger-graded").textContent()) ?? "",
  };
}

test.describe("Arkivskabet — a meaningful action in the world, graded through the bridge", () => {
  test("committed source choice → host grades → reward once → the cabinet opens", async ({ page }) => {
    const f = await openTask(page);
    await expect(f.locator("#lv-prompt")).toContainText("9. april 1940");
    await expect(f.locator("#lv-mode")).toHaveText("Øvelse · hints tilladt");
    // Choosing is not answering: the commit button decides (commit point).
    await f.locator('.lv-card[data-option="kilde_b"]').click();
    await f.locator('.lv-card[data-option="kilde_a"]').click();
    await expect(f.locator('#lv-task .lv-card[aria-pressed="true"]')).toHaveCount(1);
    // Phase 2: the choice cannot be committed before two sources are investigated…
    await expect(f.locator("#lv-commit")).toBeDisabled();
    await investigate(f);
    // …nor (D-322 step 3) before the pupil names what decided it.
    await expect(f.locator("#lv-commit")).toBeDisabled();
    await expect(f.locator("#lv-guide")).toHaveText("Vælg, hvad der afgjorde dit valg.");
    await f.locator('[data-reason="hvem"]').click();
    await expect(f.locator("#lv-commit")).toBeEnabled();
    expect(await ledger(page)).toEqual({ xp: "0", coins: "0", graded: "0" });
    await f.locator("#lv-commit").click();
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await expect(f.locator("#lv-feedback-text")).toContainText("ro og orden");
    // Guided practice is never evidence (LPD §5.1 stage 2), even when right.
    await expect(f.locator("#lv-evidence")).toHaveAttribute("data-evidence", "practice");
    await expect.poll(() => ledger(page)).toEqual({ xp: "10", coins: "5", graded: "1" });
    // The world reacts to the verdict.
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.unlocked");
    // D-310: the opened cabinet now leads on to the drawer's new application (phase 6) — still no new reward.
    await useCabinet(page);
    await confirmLine(page, "line.drawer");
    expect(await ledger(page)).toEqual({ xp: "10", coins: "5", graded: "1" });
  });

  test("a wrong source is graded incorrect, pays nothing, shows the right answer, and the cabinet stays locked", async ({ page }) => {
    const f = await openTask(page);
    await investigate(f);
    await choose(f, "kilde_d");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "incorrect");
    await expect(f.locator("#lv-correct")).toHaveText("Det rigtige svar: Proklamation");
    // Phase 5: the explanation refutes THIS choice, not just "wrong".
    await expect(f.locator("#lv-feedback-text")).toContainText("bladet er lavet fire år senere");
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.still_locked");
    expect(await ledger(page)).toEqual({ xp: "0", coins: "0", graded: "1" });
  });

  test("a hint comes from the host, and the same right answer then counts as practice", async ({ page }) => {
    const f = await openTask(page);
    await f.locator("#lv-hint").click();
    await expect(f.locator('#lv-hints li[data-level="1"]')).toHaveText("Læs påstanden igen: hvis ønske handler den om?");
    await investigate(f);
    await choose(f, "kilde_a");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await expect(f.locator("#lv-evidence")).toHaveAttribute("data-evidence", "practice");
  });

  test("network failure: the game shows the abort, and 'send again' delivers the original answer once", async ({ page }) => {
    const f = await openTask(page);
    await page.locator("#inject-network").click();
    await investigate(f);
    await choose(f, "kilde_a");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "aborted", { timeout: 20_000 });
    await expect(f.locator("#lv-retry")).toBeVisible();
    expect((await ledger(page)).graded).toBe("0");
    await f.locator("#lv-retry").click();
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await expect.poll(() => ledger(page)).toEqual({ xp: "10", coins: "5", graded: "1" });
  });

  test("resumption: after the game reloads mid-task, the open task comes back with the handshake", async ({ page }) => {
    const f = await openTask(page);
    const prompt = await f.locator("#lv-prompt").textContent();
    const before = page.frames().find((fr) => fr.url().startsWith(GAME));
    await before?.evaluate(() => {
      document.body.dataset["oldDocument"] = "yes";
    });
    await page.locator("#reload-game").click();
    // Prove the reload: a fresh document (no marker) with the title screen showing again.
    await expect.poll(() => page.frames().find((fr) => fr.url().startsWith(GAME))?.url() ?? "").toContain("reload=1");
    await expect(f.locator("body")).not.toHaveAttribute("data-old-document", "yes");
    await expect(f.locator("#lv-connection")).toHaveText("Forbundet");
    await f.locator("#start").click();
    // The resumed task waits until the world is idle: first the opening line.
    await confirmLine(page, "line.intro");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open", { timeout: 30_000 });
    await expect(f.locator("#lv-prompt")).toHaveText(prompt ?? "");
    await investigate(f);
    await choose(f, "kilde_a");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await expect.poll(() => ledger(page)).toEqual({ xp: "10", coins: "5", graded: "1" });
  });
});

test.describe("Arkivskabet — the learning sequence (D-310)", () => {
  test("the introduction comes once: after a wrong first try the next use goes straight to the shelf", async ({ page }) => {
    const f = await openTask(page);
    await investigate(f);
    await choose(f, "kilde_c");
    await expect(f.locator("#lv-feedback-text")).toContainText("en tysk soldat kan fortælle");
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.still_locked");
    await useCabinet(page);
    await confirmLine(page, "line.cabinet_locked");
    await expect(f.locator("#lv-intro")).toBeHidden();
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open");
  });

  test("investigation shows who, when and to whom; the own reason comes back next to the explanation", async ({ page }) => {
    const f = await openTask(page);
    await expect(f.locator("#lv-material")).toBeVisible();
    await expect(f.locator("#lv-guide")).toContainText("Vend alle 4 dokumenter");
    await f.locator('[data-inspect="kilde_b"]').click();
    // D-322 step 2: the back of the document — sender, time, recipient, purpose, context.
    const back = f.locator("#lv-detail-kilde_b");
    await expect(back.locator("dt")).toHaveText(["Afsender", "Tid", "Modtager", "Formål", "Kontekst"]);
    await expect(back.locator('dd[data-field="tid"]')).toHaveText("skrevet i 1985");
    await expect(f.locator('[data-inspect="kilde_b"]')).toHaveAttribute("aria-expanded", "true");
    await expect(f.locator('[data-inspect="kilde_b"]')).toHaveText("Vend tilbage");
    await f.locator('[data-inspect="kilde_a"]').click();
    await f.locator('.lv-card[data-option="kilde_a"]').click();
    await f.locator('[data-reason="hvem"]').click();
    // D-322 QA: two turned documents are not enough — the back of EVERY source must be read.
    await expect(f.locator("#lv-guide")).toContainText("(2 af 4)");
    await expect(f.locator("#lv-commit")).toBeDisabled();
    await investigate(f);
    await expect(f.locator("#lv-commit")).toBeEnabled();
    await f.locator("#lv-commit").click();
    await expect(f.locator("#lv-own-reason")).toContainText("hvem der lavede kilden");
  });

  test("phase 6: the drawer gives a NEW claim where the proclamation is wrong, without hints", async ({ page }) => {
    const f = await openTask(page);
    await investigate(f);
    await choose(f, "kilde_a");
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.unlocked");
    await useCabinet(page);
    await confirmLine(page, "line.drawer");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open");
    await expect(f.locator("#lv-prompt")).toContainText("almindelig dansker i København");
    await expect(f.locator("#lv-mode")).toHaveText("Selvstændig opgave · uden hints");
    await expect(f.locator("#lv-hint")).toBeHidden();
    await investigate(f);
    // A pupil who only remembers "the proclamation" is refuted with the reason.
    await choose(f, "kilde_e");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "incorrect");
    await expect(f.locator("#lv-feedback-text")).toContainText("påstanden er en anden nu");
    await expect(f.locator("#lv-evidence")).toHaveAttribute("data-evidence", "evidence");
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.drawer_wrong");
    await expect(f.locator("#lv-reflection")).toBeVisible();
  });
});

test.describe("Arkivskabet v2 — the full learning sequence (D-322)", () => {
  test("archive card: a wrong placement gets its own explanation, and the pupil corrects it before the shelf", async ({ page }) => {
    const f = await startGame(page);
    await useCabinet(page);
    await confirmLine(page, "line.cabinet_locked");
    await passIntro(f);
    await fillArchiveCard(f, true);
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open");
    // Local practice: nothing was sent to the host, nothing graded.
    expect(await ledger(page)).toEqual({ xp: "0", coins: "0", graded: "0" });
  });

  test("revision: after a wrong assessment the pupil gets a NEW task on the same objective, not the same one again", async ({ page }) => {
    const f = await openTask(page);
    await expect(f.locator("#lv-activity")).toHaveText("Din vurdering · øvelse med hjælp");
    await investigate(f);
    await choose(f, "kilde_b", "hvornaar");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "incorrect");
    // Step 4: the feedback points at the relevant information — the right source's back is shown.
    await expect(f.locator('.lv-source[data-relevant="true"] .lv-card')).toHaveText("Proklamation");
    await expect(f.locator("#lv-detail-kilde_a")).toBeVisible();
    await expect(f.locator("#lv-relevant")).toContainText("afsender, tid, modtager og formål");
    // Step 5: the revise button takes focus; the keyboard alone continues.
    await expect(f.locator("#lv-revise")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open");
    await expect(f.locator("#lv-activity")).toHaveText("Revision · ny opgave, samme mål");
    await expect(f.locator("#lv-prompt")).toContainText("Revidér din vurdering med en ny påstand");
    // D-332: a NEW claim (the army command's wish), not the practice claim again.
    await expect(f.locator("#lv-prompt")).toContainText("Hærledelsen");
    await expect(f.locator('.lv-card[data-option="kilde_a"]')).toHaveCount(0);
    await investigate(f);
    await choose(f, "rev_ordre", "hvem");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await expect(f.locator("#lv-revise")).toBeHidden();
    await expect.poll(() => ledger(page)).toEqual({ xp: "10", coins: "5", graded: "2" });
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.unlocked");
  });

  test("independent application → reflection (local, never sent) → transfer to 1864 → revisit (local prototype) → the world comments", async ({ page }) => {
    const f = await openTask(page);
    await investigate(f);
    await choose(f, "kilde_a");
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.unlocked");
    await useCabinet(page);
    await confirmLine(page, "line.drawer");
    await expect(f.locator("#lv-activity")).toHaveText("Selvstændig anvendelse · uden hjælp");
    await investigate(f);
    await choose(f, "kilde_f", "til");
    await expect(f.locator("#lv-evidence")).toHaveAttribute("data-evidence", "evidence");
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.drawer_done");
    // Step 7: reflection — the text box has focus; the comparison waits for a real attempt.
    const reflection = f.locator("#lv-reflection");
    await expect(reflection).toBeVisible();
    await expect(f.locator("#lv-reflection-text")).toBeFocused();
    await expect(f.locator("#lv-reflection-compare")).toBeDisabled();
    const graded = (await ledger(page)).graded;
    await page.keyboard.type("Afsenderen kan have et formål og skrive længe efter.");
    await f.locator("#lv-reflection-compare").click();
    await expect(f.locator("#lv-reflection-answer")).toContainText("hvem, hvornår, til hvem og hvorfor");
    await expect(f.locator("#lv-reflection-selfcheck li")).toHaveCount(3);
    expect((await ledger(page)).graded).toBe(graded);
    await f.locator("#lv-reflection-next").click();
    // Step 7 (D-332): transfer to ANOTHER period, without help.
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open");
    await expect(f.locator("#lv-activity")).toHaveText("Overførsel · ny periode, uden hjælp");
    await expect(f.locator("#lv-prompt")).toContainText("1864");
    await expect(f.locator("#lv-hint")).toBeHidden();
    await investigate(f);
    await choose(f, "t_brev", "hvem");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.transfer_done");
    // Step 8: revisit, labelled as a local prototype without mastery.
    await expect(f.locator("#lv-revisit-due")).toContainText("ingen mastery registreres");
    await expect(f.locator("#lv-revisit-start")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open");
    await expect(f.locator("#lv-activity")).toHaveText("Genbesøg · lokal prototype");
    await expect(f.locator("#lv-prompt")).toContainText("kæmpet");
    await expect(f.locator("#lv-hint")).toBeHidden();
    await investigate(f);
    await choose(f, "gb_rapport", "hvem");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.revisit_done");
  });

  test("small screen: the task sheet fits a 360 px wide phone without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    const f = await openTask(page);
    await investigate(f);
    const fits = await page.frames().find((fr) => fr.url().startsWith(GAME))?.evaluate(() => {
      const sheet = document.querySelector("#lv-task .lv-sheet") as HTMLElement;
      const cards = document.querySelectorAll<HTMLElement>("#lv-task .lv-source");
      const xs = new Set([...cards].map((c) => Math.round(c.getBoundingClientRect().left)));
      return { overflow: sheet.scrollWidth - sheet.clientWidth, columns: xs.size, width: sheet.getBoundingClientRect().width };
    });
    expect(fits?.overflow).toBeLessThanOrEqual(0);
    expect(fits?.columns).toBe(1);
    expect(fits?.width).toBeLessThanOrEqual(360);
  });
});

test.describe("Arkivskabet — the evidence view (D-330): a correct answer is not documented learning", () => {
  const row = (page: Page, state: string) => page.locator(`#evidence-body table[data-objective="kildekritik.ophav"] tr[data-state="${state}"] td`);

  test("one objective through the whole sequence: supported → independent → applied → revisited, and still no documented progression", async ({ page }) => {
    const f = await openTask(page);
    await expect(page.locator("#evidence-body")).toContainText("Endnu ingen besvarede opgaver.");
    // Practice WITH a hint: practised and supported — not independent.
    await f.locator("#lv-hint").click();
    await investigate(f);
    await choose(f, "kilde_a");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await expect(row(page, "practised")).toHaveAttribute("data-status", "observed");
    await expect(row(page, "supported")).toHaveAttribute("data-status", "observed");
    await expect(row(page, "independent")).toHaveAttribute("data-status", "not_observed");
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.unlocked");
    // Transfer without help, in a situation never practised: independent AND applied.
    await useCabinet(page);
    await confirmLine(page, "line.drawer");
    // Wait for the NEW task before turning documents (the previous sheet's buttons are still in the DOM).
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open");
    await expect(f.locator("#lv-prompt")).toContainText("almindelig dansker i København");
    await investigate(f);
    await choose(f, "kilde_f", "til");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await expect(row(page, "independent")).toHaveAttribute("data-status", "observed");
    await expect(row(page, "applied")).toHaveAttribute("data-status", "observed");
    await expect(row(page, "revisited")).toHaveAttribute("data-status", "not_observed");
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.drawer_done");
    await f.locator("#lv-reflection-text").fill("Afsenderen kan have et formål og skrive længe efter.");
    await f.locator("#lv-reflection-compare").click();
    await f.locator("#lv-reflection-next").click();
    // Step 7 (D-332): transfer to ANOTHER period, without help.
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open");
    await expect(f.locator("#lv-activity")).toHaveText("Overførsel · ny periode, uden hjælp");
    await expect(f.locator("#lv-prompt")).toContainText("1864");
    await expect(f.locator("#lv-hint")).toBeHidden();
    await investigate(f);
    await choose(f, "t_brev", "hvem");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await f.locator("#lv-close").click();
    await confirmLine(page, "line.transfer_done");
    // The transfer in another period is also independent and applied — same objective.
    await expect(row(page, "applied")).toHaveAttribute("data-status", "observed");
    // The game's "fast-forward" is a story device; time passes only on the TEST ADAPTER's clock (host tool).
    await page.locator("#advance-clock").click();
    await f.locator("#lv-revisit-start").click();
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "open");
    await expect(f.locator("#lv-prompt")).toContainText("kæmpet");
    await investigate(f);
    await choose(f, "gb_rapport");
    await expect(f.locator("#lv-task")).toHaveAttribute("data-state", "correct");
    await expect(row(page, "revisited")).toHaveAttribute("data-status", "observed");
    await expect(row(page, "revisited")).toContainText("FORSLAG");
    // Everything the working model can show — and still: not documented progression, nothing usable as evidence.
    await expect(row(page, "documentedProgression")).toHaveAttribute("data-status", "not_observed");
    await expect(row(page, "evidence")).toHaveAttribute("data-eligible", "0");
    await expect(row(page, "introduced")).not.toHaveAttribute("data-status", "observed");
    await expect(page.locator("#evidence-body")).not.toContainText(/mestret|master/i);
  });
});

test.describe("Arkivskabet — isolation and sender checks", () => {
  test("the game, on its own origin, cannot read the host's session storage", async ({ page }) => {
    await startGame(page);
    const frame = page.frames().find((fr) => fr.url().startsWith(GAME));
    expect(frame).toBeDefined();
    const probe = await frame?.evaluate(() => {
      let parent = "readable";
      try {
        parent = String(window.parent.localStorage.getItem("sb-test-auth-token"));
      } catch {
        parent = "blocked";
      }
      return { parent, own: localStorage.getItem("sb-test-auth-token"), origin: location.origin };
    });
    expect(probe).toEqual({ parent: "blocked", own: null, origin: GAME });
    // The host page does hold it — the isolation, not its absence, is what keeps it from the game.
    expect(await page.evaluate(() => localStorage.getItem("sb-test-auth-token"))).toBe("TEST-ONLY-NOT-A-REAL-SESSION");
  });

  test("messages from a wrong origin, and forged reward messages from the game, change nothing", async ({ page }) => {
    await startGame(page);
    // Same message shape, but sent from the host's own origin instead of the game's: dropped.
    await page.evaluate(() => window.postMessage({ protocol: "laerligverse.bridge/2", type: "task.request", nonce: "x", requestId: "evil", objectiveId: "hist.besaettelsen.h4", purpose: "check", surface: "world", contextKey: "arkivskab" }, "*"));
    await expect(page.locator("#ledger-rejects")).toContainText("origin");
    // From the real game frame, a message type that would grant a reward does not exist: rejected.
    const frame = page.frames().find((fr) => fr.url().startsWith(GAME));
    await frame?.evaluate((host) => window.parent.postMessage({ protocol: "laerligverse.bridge/2", type: "reward.grant", xp: 999, coins: 999 }, host), HOST);
    await expect(page.locator("#ledger-rejects")).toContainText("invalid");
    expect(await ledger(page)).toEqual({ xp: "0", coins: "0", graded: "0" });
  });

  test("the game bundle as served contains no answer key, no test adapter and no host code", async ({ request }) => {
    const html = await (await request.get(`${GAME}/game.html`)).text();
    const urls = [...new Set([...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1] as string))];
    expect(urls.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    const queue = [...urls];
    while (queue.length > 0) {
      const url = queue.shift() as string;
      if (seen.has(url)) continue;
      seen.add(url);
      const js = await (await request.get(`${GAME}/${url}`)).text();
      for (const forbidden of ["kilde_a", "kilde_f", "rev_ordre", "t_brev", "gb_rapport", "ITEM_REVIEW", "cannotDocument", "Proklamationen fra kongen", "ro og orden", "injectFailures", "sb-test-auth-token", "feedbackCorrect", "optionFeedback"]) {
        expect(js, `${url} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
      // Follow static and dynamic imports of the game's own chunks.
      for (const m of js.matchAll(/["'(]\.\/([A-Za-z0-9_-]+\.js)["')]/g)) queue.push(`assets/${m[1] as string}`);
    }
  });
});
