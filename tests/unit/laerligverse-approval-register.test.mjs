// D-344: the teacher's approval of the 12 Arkivskab elements is registered byte for byte and bound to the
// content it approved. Changing an approved element must be detected; a bad export must be refused.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DECISIONS, elements, fingerprintsOf, HTML } from "../../tools/laerligverse/review-pack.mjs";
import { REGISTER, changedSinceApproval, fingerprints, validateExport } from "../../tools/laerligverse/approval-register.mjs";

const IDS = ["maal", "intro-1", "intro-2", "intro-3", "intro-tjek", "arkivkort", "h4-kilde", "h4-kilde-revision", "h4-overfoersel", "refleksion", "t1864", "h4-genbesoeg"];
const exportOf = (over = {}) => ({
  _om: "Lærerens afgørelser.",
  laerer: "Testlærer",
  dato: "01-01-2026",
  elementer: Object.fromEntries(IDS.map((id) => [id, { status: "godkendt", kommentar: "", aendringer: "" }])),
  ...over,
});

test("the registered approval: 12/12 godkendt by Christopher Møller on 04-11-2026, the decision file is the export byte for byte", () => {
  const reg = JSON.parse(readFileSync(REGISTER, "utf8"));
  const bytes = readFileSync(DECISIONS);
  assert.equal(createHash("sha256").update(bytes).digest("hex"), reg.sha256);
  assert.equal(reg.sha256, "8cd7d9698dea96b550e4b7ee3728e4ca5e2d74b0231ead49b179fd3a3a453d6d");
  assert.equal(reg.laerer, "Christopher Møller");
  assert.equal(reg.dato, "04-11-2026");
  assert.equal(reg.indholdsversion, "25db5141683dc26efcad41b0f52be4574e836af8");
  assert.deepEqual(Object.keys(reg.fingeraftryk), IDS);
  const d = JSON.parse(bytes.toString("utf8"));
  assert.deepEqual(validateExport(bytes, IDS, { requireAllApproved: true }).problems, []);
  assert.equal(Object.values(d.elementer).filter((v) => v.status === "godkendt").length, 12);
  assert.ok(/IKKE et GO til produktion, elevpilot, LP-13 eller merge/.test(reg._om));
});

test("approved content is unchanged since the approval (fails when an approved element is edited — re-review it)", async () => {
  assert.deepEqual((await changedSinceApproval()).problems, []);
});

test("a change to an approved element changes exactly that element's fingerprint", async () => {
  const els = await elements();
  const before = fingerprintsOf(els);
  const copy = structuredClone({ list: els.list, objective: els.objective });
  const t = copy.list.find((e) => e.id === "t1864");
  t.item = { ...t.item, prompt: t.item.prompt + " (ændret)" };
  const after = fingerprintsOf(copy);
  for (const id of IDS) assert.equal(after[id] === before[id], id !== "t1864", id);
  // The objective is shown on the goal and on every task: changing it invalidates all of them.
  const copy2 = structuredClone({ list: els.list, objective: { ...els.objective, text: els.objective.text + "!" } });
  const after2 = fingerprintsOf(copy2);
  assert.notEqual(after2.maal, before.maal);
  assert.notEqual(after2["h4-kilde"], before["h4-kilde"]);
  assert.equal(after2["intro-1"], before["intro-1"]);
  assert.deepEqual(await fingerprints(), before);
});

test("validateExport refuses incomplete, unknown, duplicated, unsigned or not-fully-approved exports", () => {
  const ok = (o, opt) => validateExport(JSON.stringify(o, null, 2), IDS, opt).problems;
  assert.deepEqual(ok(exportOf(), { requireAllApproved: true }), []);
  assert.match(validateExport("{not json", IDS).problems[0], /not valid JSON/);
  const missing = exportOf(); delete missing.elementer.t1864;
  assert.ok(ok(missing).some((p) => /missing element: t1864/.test(p)));
  assert.ok(ok(exportOf({ elementer: { ...exportOf().elementer, ekstra: { status: "godkendt" } } })).some((p) => /unknown element: ekstra/.test(p)));
  const dup = JSON.stringify(exportOf(), null, 2).replace('"maal": {', '"maal": {"status":"afvist"},\n    "maal": {');
  assert.ok(validateExport(dup, IDS).problems.some((p) => /more than once in the same object: maal/.test(p)));
  assert.ok(ok(exportOf({ laerer: "" })).some((p) => /no teacher name/.test(p)));
  assert.ok(ok(exportOf({ ekstra: 1 })).some((p) => /unknown top-level field/.test(p)));
  const notAll = exportOf(); notAll.elementer.maal.status = "ikke_gennemgaaet";
  assert.deepEqual(ok(notAll), []);
  assert.ok(ok(notAll, { requireAllApproved: true }).some((p) => /maal: status is ikke_gennemgaaet/.test(p)));
  const comment = exportOf(); comment.elementer["intro-2"].kommentar = "tjek ordet";
  assert.ok(ok(comment, { requireAllApproved: true }).some((p) => /intro-2: has a comment/.test(p)));
  const fix = exportOf(); fix.elementer.t1864.status = "skal_rettes";
  assert.ok(ok(fix).some((p) => /without a requested change/.test(p)));
  assert.ok(validateExport(JSON.stringify(exportOf({ laerer: "Ã¸" })), IDS).problems.some((p) => /mojibake/.test(p)));
});

test("a new review page writes the fingerprints it showed; registering against changed content is refused", async () => {
  const fps = await fingerprints();
  const page = readFileSync(HTML, "utf8");
  assert.ok(page.includes(`const FP = ${JSON.stringify(fps)};`));
  assert.ok(page.includes("indhold:FP"));
  assert.deepEqual(validateExport(JSON.stringify(exportOf({ indhold: fps })), IDS, { currentFingerprints: fps }).problems, []);
  const stale = { ...fps, t1864: "0".repeat(64) };
  assert.ok(validateExport(JSON.stringify(exportOf({ indhold: stale })), IDS, { currentFingerprints: fps }).problems.some((p) => /t1864: the content changed/.test(p)));
});
