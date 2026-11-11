// D-332: the teacher review pack, the teacher's decision file and the isolated server fixture are generated
// from the same data as the game; they must be in sync, cover the same elements, and approve nothing by
// themselves.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DECISIONS, FIXTURE, HTML, STATUSES, TEST_OBJECTIVE, check, elements } from "../../tools/laerligverse/review-pack.mjs";

test("pack, fixture and decision file are in sync with the item data (no drift)", async () => {
  assert.deepEqual(await check(), []);
});

test("the decision file is the teacher's: only valid statuses, and any decision carries a teacher name and a date", async () => {
  const d = JSON.parse(readFileSync(DECISIONS, "utf8"));
  const statuses = Object.values(d.elementer).map((v) => v.status);
  for (const s of statuses) assert.ok(STATUSES.includes(s), s);
  // The tool never approves: only a signed file may contain decisions (check() enforces it too).
  if (statuses.some((s) => s !== "ikke_gennemgaaet")) assert.ok(d.laerer && d.dato, "decisions without a signature");
});

test("the review page is self-contained and cannot leak anything: no external resources, a strict CSP, no network calls", () => {
  const page = readFileSync(HTML, "utf8");
  assert.match(page, /Content-Security-Policy" content="default-src 'none'/);
  assert.equal(/<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!www\.w3)/.test(page), false);
  assert.equal(/fetch\(|XMLHttpRequest|localStorage|sessionStorage/.test(page), false);
  for (const id of ["maal", "h4-kilde", "t1864", "h4-genbesoeg"]) assert.match(page, new RegExp(`name="st-${id}"`));
});

test("the pack covers the whole sequence in teaching order: objective, intro, check, archive card, steps 3–8 with reflection", async () => {
  const ids = (await elements()).list.map((e) => e.id);
  assert.deepEqual(ids, ["maal", "intro-1", "intro-2", "intro-3", "intro-tjek", "arkivkort", "h4-kilde", "h4-kilde-revision", "h4-overfoersel", "refleksion", "t1864", "h4-genbesoeg"]);
});

test("the server fixture is a clearly named TEST objective, with one back per option and the key only in `correct`", () => {
  const rows = JSON.parse(readFileSync(FIXTURE, "utf8"));
  assert.equal(TEST_OBJECTIVE.startsWith("test_"), true);
  for (const r of rows) {
    assert.equal(r.learning_objective, TEST_OBJECTIVE);
    assert.equal(r.content.options.length, r.content.option_details.length);
    assert.ok(r.content.options.includes(r.content.correct), r.tag);
    for (const d of r.content.option_details) assert.ok(d.length <= 400 && /^Afsender: /.test(d), r.tag);
  }
});

test("D-341: the three teacher decisions (+ the non-decision default), a change request for 'skal_rettes', and a localhost-only server", async () => {
  assert.deepEqual([...STATUSES], ["ikke_gennemgaaet", "godkendt", "skal_rettes", "afvist"]);
  const page = readFileSync(HTML, "utf8");
  for (const label of ["Godkendt", "Skal rettes", "Afvist", "Hvad skal rettes?", "Progression til næste trin", "Kendt faglig usikkerhed", "Observation (registreres)"]) assert.ok(page.includes(label), label);
  // Nothing is pre-approved: every radio group starts on "ikke gennemgået".
  const checked = [...page.matchAll(/<input type="radio" name="st-[^"]+" value="([a-z_]+)" checked>/g)].map((m) => m[1]);
  assert.ok(checked.length >= 12 && checked.every((v) => v === "ikke_gennemgaaet"));
  const { HOST, reviewHandler } = await import("../../tools/laerligverse/serve-review.mjs");
  assert.equal(HOST, "127.0.0.1");
  const res = (url, method = "GET") => {
    const out = { status: 0, headers: {}, body: "" };
    reviewHandler(() => "<html>page</html>")({ url, method }, { writeHead: (s, h) => { out.status = s; out.headers = h; }, end: (b) => { out.body = String(b); } });
    return out;
  };
  assert.equal(res("/").status, 200);
  assert.equal(res("/").headers["cache-control"], "no-store");
  for (const bad of ["/../package.json", "/docs/laerligverse/kildekritik-godkendelse.json", "/x", "/%2e%2e/secret"]) assert.equal(res(bad).status, 404, bad);
  assert.equal(res("/", "POST").status, 404);
});

test("D-341: the review page's script PARSES (F5's page had a raw newline in a string literal — save/load never ran)", async () => {
  const { Script } = await import("node:vm");
  const page = readFileSync(HTML, "utf8");
  const scripts = [...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.equal(scripts.length, 1);
  assert.doesNotThrow(() => new Script(scripts[0]));
});
