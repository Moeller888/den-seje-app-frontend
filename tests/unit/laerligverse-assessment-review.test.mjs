// D-346 (F9): the teacher's approval page for the measurement material. Nothing pre-approved, all four tests and the
// rubric present, the five F8 ambiguities exactly, LP-13 kept apart, key only in the teacher's part, a strict
// self-contained page, a localhost-only server, and version-bound decisions.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { AMBIGUITIES, FORMAT, ITEMS, LP13, PAGE, UNDECIDED, check, contentFingerprints, validateReviewExport } from "../../tools/laerligverse/assessment-review.mjs";
import { FORMS, TRANSFER, VERSION } from "../../tools/laerligverse/assessment-v1.mjs";
import { SYNTHETIC_RESPONSES } from "../../tools/laerligverse/rehearsal.mjs";

const page = () => readFileSync(PAGE, "utf8");
const script = (h) => h.slice(h.indexOf("<script>") + 8, h.lastIndexOf("</script>"));

test("the page is generated from the material and not stale; its script parses", () => {
  assert.deepEqual(check(), []);
  new vm.Script(script(page()));
});

test("nothing is pre-approved or pre-decided: every test, ambiguity and LP-13 choice starts undecided", () => {
  const h = page();
  const checked = [...h.matchAll(/<input type="radio" name="([a-z]+)-([^"]+)" value="([^"]+)" checked>/g)].map((m) => [m[1], m[3]]);
  assert.equal(checked.filter(([n]) => n === "st").length, ITEMS.length);
  assert.ok(checked.filter(([n]) => n === "st").every(([, v]) => v === "ikke_gennemgaaet"));
  assert.equal(checked.filter(([n]) => n === "tv").length, AMBIGUITIES.length);
  assert.equal(checked.filter(([n]) => n === "lp").length, LP13.length);
  assert.ok(checked.filter(([n]) => n !== "st").every(([, v]) => v === UNDECIDED));
  assert.equal(/type="checkbox" id="ra-on" checked/.test(h), false, "read-aloud must be off by default");
});

test("all four tests and the rubric are on the page, each with the three decisions and all comment fields", () => {
  const h = page();
  for (const id of ITEMS) {
    assert.match(h, new RegExp(`<section class="el" id="${id}" data-status="ikke_gennemgaaet">`), id);
    for (const s of ["godkendt", "skal_rettes", "afvist"]) assert.match(h, new RegExp(`name="st-${id}" value="${s}"`), `${id} ${s}`);
    for (const f of ["faglig", "historisk", "sprog", "svaerhed", "elevforstaaelse", "aendringer"]) assert.match(h, new RegExp(`name="${f}-${id}"`), `${id} ${f}`);
  }
  for (const f of [FORMS.A, FORMS.B, FORMS.C, TRANSFER]) assert.ok(h.includes(f.source.text), f.id);
});

test("the answer key is only in the teacher's part: no facit inside what the student sees", () => {
  const h = page();
  const students = [...h.matchAll(/<div class="student"[\s\S]*?<div class="ra"/g)].map((m) => m[0]);
  assert.equal(students.length, 4);
  for (const s of students) {
    assert.equal(/<strong>(ja|nej)<\/strong>|Facit|accepterede svar/.test(s), false);
    for (const f of Object.values(FORMS)) for (const c of [...f.part2.claims, ...f.part3.claims]) assert.equal(s.includes(c.why), false, c.why);
  }
  assert.equal((h.match(/<details class="teacher">/g) ?? []).length, 4);
});

test("exactly the five ambiguities F8 recorded (S2, S3, S4, S6, S7), with the synthetic answer, options and a decision field", () => {
  const noted = SYNTHETIC_RESPONSES.filter((r) => r.note && r.id !== "S5").map((r) => r.id);
  assert.deepEqual(AMBIGUITIES.map((a) => a.id), noted);
  const h = page();
  for (const a of AMBIGUITIES) {
    assert.ok(a.options.length >= 2 && a.options.length <= 3, a.id);
    assert.ok(a.options.some((o) => o.id === a.recommendation), a.id);
    assert.ok(h.includes(`name="tv-${a.id}" value="${UNDECIDED}" checked`), a.id);
    assert.ok(h.includes(`name="tvk-${a.id}"`), a.id);
    const s = SYNTHETIC_RESPONSES.find((r) => r.id === a.id);
    assert.ok(h.includes(s.text[a.answerKey].replace(/"/g, "&quot;")), `${a.id} answer text`);
  }
});

test("LP-13 is a separate section that says it is not part of approving the tests and activates nothing", () => {
  const h = page();
  assert.match(h, /Dette er ikke en del af godkendelsen af prøvernes faglige indhold/);
  assert.match(h, /aktiverer intet/);
  for (const id of ["LP13-1", "LP13-2", "LP13-3", "LP13-4", "genbesoeg", "forsinket", "LP13-7", "pilot"]) assert.ok(LP13.some((d) => d.id === id), id);
  assert.ok(LP13.find((d) => d.id === "LP13-7").options.some(([, l]) => /Mestret.*frarådes/.test(l)));
});

test("the page is self-contained: strict CSP, no external resources, no network or storage calls", () => {
  const h = page();
  assert.match(h, /Content-Security-Policy" content="default-src 'none'/);
  assert.equal(/<script[^>]+src=|<link[^>]+href=|https?:\/\/(?!www\.w3)/.test(h), false);
  assert.equal(/fetch\(|XMLHttpRequest|localStorage|sessionStorage|innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function/.test(script(h)), false);
  // Read-aloud prototype: local voices only.
  assert.match(script(h), /localService === true/);
});

test("the server binds to 127.0.0.1 and serves only the page, only with GET", async () => {
  const { HOST, PORT, assessmentReviewHandler } = await import("../../tools/laerligverse/serve-assessment-review.mjs");
  assert.equal(HOST, "127.0.0.1");
  assert.equal(PORT, 4341);
  const res = (url, method = "GET") => {
    const out = { status: 0, headers: {} };
    assessmentReviewHandler(() => "<html></html>")({ url, method }, { writeHead: (s, hd) => { out.status = s; out.headers = hd; }, end: () => {} });
    return out;
  };
  assert.equal(res("/").status, 200);
  assert.equal(res("/").headers["cache-control"], "no-store");
  assert.equal(res("/proeve-godkendelse.html").status, 200);
  for (const u of ["/../package.json", "/docs/x", "/%2e%2e/secret"]) assert.equal(res(u).status, 404, u);
  assert.equal(res("/", "POST").status, 404);
});

const valid = (over = {}) => ({
  format: FORMAT, version: VERSION, laerer: "Test Lærer", dato: "01-01-2026", indhold: contentFingerprints(),
  proever: Object.fromEntries(ITEMS.map((id) => [id, { status: "godkendt", faglig: "", historisk: "", sprog: "", svaerhed: "", elevforstaaelse: "", aendringer: "" }])),
  tvetydigheder: Object.fromEntries(AMBIGUITIES.map((a) => [a.id, { valg: a.recommendation, kommentar: "" }])),
  lp13: Object.fromEntries(LP13.map((d) => [d.id, { valg: UNDECIDED, kommentar: "" }])),
  ...over,
});

test("validateReviewExport: accepts a complete file, refuses bad ones, and reports decisions on changed content", () => {
  assert.deepEqual(validateReviewExport(JSON.stringify(valid())), { problems: [], stale: [], notes: [] });
  assert.match(validateReviewExport("{nope").problems[0], /not valid JSON/);
  assert.ok(validateReviewExport(JSON.stringify(valid({ format: "x" }))).problems.some((p) => /format/.test(p)));
  assert.ok(validateReviewExport(JSON.stringify(valid({ laerer: "" }))).problems.some((p) => /teacher name/.test(p)));
  const fix = valid(); fix.proever.B.status = "skal_rettes";
  assert.ok(validateReviewExport(JSON.stringify(fix)).problems.some((p) => /B: "skal_rettes"/.test(p)));
  const bad = valid(); bad.tvetydigheder.S4.valg = "99";
  assert.ok(validateReviewExport(JSON.stringify(bad)).problems.some((p) => /S4: invalid choice/.test(p)));
  const stale = valid({ indhold: { ...contentFingerprints(), C: "0".repeat(64) } });
  assert.deepEqual(validateReviewExport(JSON.stringify(stale)).stale, ["C"]);
});

test("the fingerprint of a test changes when its question or key changes, and only that test's", () => {
  const before = contentFingerprints();
  assert.equal(new Set(Object.values(before)).size, ITEMS.length);
  // A changed KEY in B (on a copy — the real material is never touched).
  const forms = structuredClone(FORMS);
  forms.B.part2.claims[0].answer = forms.B.part2.claims[0].answer === "ja" ? "nej" : "ja";
  const afterKey = contentFingerprints({ forms });
  for (const id of ITEMS) assert.equal(afterKey[id] === before[id], id !== "B", id);
  // A changed QUESTION in the transfer test.
  const transfer = structuredClone(TRANSFER);
  transfer.open[0] += " (ændret)";
  const afterQ = contentFingerprints({ transfer });
  for (const id of ITEMS) assert.equal(afterQ[id] === before[id], id !== "T", id);
  assert.deepEqual(contentFingerprints(), before);
});
