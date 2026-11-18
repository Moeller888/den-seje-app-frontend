// Stimulus (F-07): the contract (supabase/functions/_shared/stimulus.ts), the public payload
// (_shared/question-dto.ts), the browser module (js/stimulus.js) and the quiz wiring (app.js, index.html).
//
// Pins: a stimulus is built from a whitelist (grading fields put inside it never leave), media are bare
// file names (never a URL, a path or another host), alt text / transcript / credit are required, a broken
// stimulus makes the row unservable instead of half-built, questions WITHOUT a stimulus produce exactly
// the payload they did before, the browser re-checks the same contract and renders text only, and the
// example sequence in tools/stimulus/examples keeps the contract and leaks no key.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  publicStimulus, checkStimulus, STIMULUS_KINDS, STIMULUS_LIMITS,
  STIMULUS_IMAGE_EXTENSIONS, STIMULUS_AUDIO_EXTENSIONS,
} from "../../supabase/functions/_shared/stimulus.ts";
import { toPublicQuestion, PUBLIC_CONTENT_KEYS } from "../../supabase/functions/_shared/question-dto.ts";
import { ASSET_DIRS } from "../../tools/cloudflare-build-static.mjs";
import * as client from "../../js/stimulus.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

const CREDIT = { source: "Danmarks Riges Grundlov af 5. juni 1849", year: "1849", license: "Offentligt domæne" };
const SOURCE = { kind: "source", title: "§ 35", text: "Valgret til Folkethinget har enhver uberygtet Mand …\n\nOrdforklaring.", credit: CREDIT };
const IMAGE = { kind: "image", file: "grundloven-1849-tidslinje.svg", alt: "Tidslinje fra 1660 til 1849.", caption: "Fra enevælde til folkestyre.", credit: { source: "Lærlig, egen tegning" } };
const AUDIO = { kind: "audio", file: "grundloven-1849-valgret.wav", title: "Hvem måtte stemme?", transcript: "Den 5. juni 1849 …", credit: { source: "Lærlig" } };

const EXAMPLE = JSON.parse(read("tools/stimulus/examples/grundloven-1849.json"));
const GRADING_KEYS = ["correct", "accepted_answers", "review_text", "facit", "tolerance", "criteria", "pairs"];

// ── The contract ────────────────────────────────────────────────────────────────────────────────

test("contract: the three kinds are accepted and returned field by field", () => {
  assert.deepEqual([...STIMULUS_KINDS], ["source", "image", "audio"]);
  assert.deepEqual(publicStimulus(SOURCE), SOURCE);
  assert.deepEqual(publicStimulus(IMAGE), IMAGE);
  assert.deepEqual(publicStimulus(AUDIO), AUDIO);
  // Optional fields may be left out; surrounding spaces are trimmed.
  assert.deepEqual(publicStimulus({ kind: "source", text: "  Tekst  ", credit: { source: " Kilde " } }),
    { kind: "source", text: "Tekst", credit: { source: "Kilde" } });
});

test("whitelist: grading data or anything else put inside a stimulus never leaves", () => {
  const leaky = {
    ...SOURCE, correct: "30", accepted_answers: ["30"], review_text: "Svaret er 30", html: "<b>x</b>",
    credit: { ...CREDIT, secret: "x", correct: "30" },
  };
  const out = publicStimulus(leaky);
  assert.deepEqual(out, SOURCE);
  const json = JSON.stringify(out);
  for (const k of [...GRADING_KEYS, "html", "secret"]) assert.equal(json.includes(`"${k}"`), false, k);
  const report = checkStimulus(leaky);
  assert.deepEqual(report.errors, []);
  assert.ok(report.warnings.some((w) => w.includes("stimulus.correct")));
  assert.ok(report.warnings.some((w) => w.includes("stimulus.credit.secret")));
});

test("required fields: text, alt, transcript, credit.source — with a reason, never half-built", () => {
  const breaks = [
    [null, /must be an object/],
    [[], /must be an object/],
    [{ ...SOURCE, kind: "video" }, /kind must be one of/],
    [{ ...SOURCE, text: "   " }, /text is empty/],
    [{ ...SOURCE, text: undefined }, /text is required/],
    [{ ...SOURCE, text: 5 }, /text must be text/],
    [{ ...SOURCE, credit: undefined }, /credit is required/],
    [{ ...SOURCE, credit: { creator: "x" } }, /credit: source is required/],
    [{ ...SOURCE, credit: { source: "" } }, /source is empty/],
    [{ ...IMAGE, alt: undefined }, /alt is required/],
    [{ ...IMAGE, alt: " " }, /alt is empty/],
    [{ ...AUDIO, transcript: undefined }, /transcript is required/],
    [{ ...SOURCE, text: "x".repeat(STIMULUS_LIMITS.text + 1) }, /longer than/],
    [{ ...IMAGE, alt: "x".repeat(STIMULUS_LIMITS.alt + 1) }, /longer than/],
    [{ ...SOURCE, text: "a\u0000b" }, /control character/],
    [{ ...SOURCE, title: 7 }, /title must be text/],
  ];
  for (const [raw, reason] of breaks) {
    assert.throws(() => publicStimulus(raw), reason, JSON.stringify(raw)?.slice(0, 80));
    assert.ok(checkStimulus(raw).errors.length > 0, "checkStimulus reports, never throws");
  }
});

test("media: a bare file name with an allowed extension — never a URL, a path or another host", () => {
  for (const file of ["a.svg", "kort-1.png", "x9.webp"]) assert.equal(publicStimulus({ ...IMAGE, file }).file, file);
  assert.equal(publicStimulus({ ...AUDIO, file: "klip-2.wav" }).file, "klip-2.wav");
  for (const file of [
    "https://evil.example/x.svg", "//evil.example/x.svg", "javascript:alert(1).svg", "data:image/svg+xml,x.svg",
    "../x.svg", "assets/stimulus/x.svg", "x/y.svg", "X.svg", "x .svg", "x.svg?y=1", "x.svg#y", "-x.svg", "x--y.svg",
    "x.gif", "x.jpg", "x.html", "x.js", "", "x".repeat(81) + ".svg",
  ]) {
    assert.throws(() => publicStimulus({ ...IMAGE, file }), /file/, file);
  }
  assert.throws(() => publicStimulus({ ...IMAGE, file: "x.wav" }), /file must end in/);
  assert.throws(() => publicStimulus({ ...AUDIO, file: "x.svg" }), /file must end in/);
  // Every allowed extension is one the frontend deploy actually copies from assets/.
  const deployed = ASSET_DIRS.find((d) => d.dir === "assets").extensions;
  for (const ext of [...STIMULUS_IMAGE_EXTENSIONS, ...STIMULUS_AUDIO_EXTENSIONS]) assert.ok(deployed.includes(ext), ext);
});

// ── The public payload ──────────────────────────────────────────────────────────────────────────

test("payload: stimulus is a public key; any format may carry one, and grading data stays home", () => {
  assert.ok(PUBLIC_CONTENT_KEYS.includes("stimulus"));
  const rows = [
    ["mc", { question: "Q?", options: ["A", "B"], correct: "A", review_text: "r", stimulus: IMAGE }],
    ["number", { question: "Q?", correct: "30", accepted_answers: ["30"], review_text: "r", stimulus: SOURCE }],
    ["text", { question: "Q?", correct: "Polen", accepted_answers: ["polen"], stimulus: AUDIO }],
  ];
  for (const [format, content] of rows) {
    const pub = toPublicQuestion(content, format, null);
    assert.deepEqual(pub.content.stimulus, content.stimulus, format);
    const json = JSON.stringify(pub);
    for (const k of GRADING_KEYS) assert.equal(json.includes(`"${k}"`), false, `${format}: ${k}`);
  }
});

test("payload: a broken stimulus makes the row unservable (throws), never served without its material", () => {
  for (const stimulus of [{ ...IMAGE, alt: "" }, { ...IMAGE, file: "https://x.y/z.svg" }, { kind: "source" }, "tekst", null]) {
    assert.throws(() => toPublicQuestion({ question: "Q?", options: ["A", "B"], correct: "A", stimulus }, "mc", null));
  }
});

test("payload: a question WITHOUT a stimulus is exactly what it was before", () => {
  const mc = { question: "Q?", options: ["A", "B"], correct: "A", type: "mc" };
  assert.deepEqual(toPublicQuestion(mc, "mc", null), { content: { question: "Q?", options: ["A", "B"], type: "mc" }, metadata: null });
  assert.deepEqual(toPublicQuestion({ question: "Q?", correct: "7" }, "number", null), { content: { question: "Q?" }, metadata: null });
  assert.equal("stimulus" in toPublicQuestion(mc, "mc", null).content, false);
});

// ── The browser module ──────────────────────────────────────────────────────────────────────────

test("browser: readStimulus agrees with the server contract (none / valid / invalid)", () => {
  assert.equal(client.readStimulus({ question: "Q" }), null);
  assert.equal(client.readStimulus(null), null);
  for (const s of [SOURCE, IMAGE, AUDIO]) assert.deepEqual(client.readStimulus({ stimulus: publicStimulus(s) }), s);
  const broken = [
    "x", [], { ...SOURCE, kind: "video" }, { ...SOURCE, text: "" }, { ...SOURCE, credit: null },
    { ...SOURCE, credit: { source: " " } }, { ...IMAGE, alt: "" }, { ...IMAGE, file: "../x.svg" },
    { ...IMAGE, file: "https://evil.example/x.svg" }, { ...IMAGE, file: "x.wav" }, { ...AUDIO, transcript: undefined },
    { ...AUDIO, file: "x.svg" }, { ...SOURCE, title: 3 },
  ];
  for (const s of broken) {
    assert.deepEqual(client.readStimulus({ stimulus: s }), { invalid: true }, JSON.stringify(s).slice(0, 60));
    assert.throws(() => publicStimulus(s), "the server refuses it too");
  }
});

test("browser: the credit line names the source, and nothing when there is none", () => {
  assert.equal(client.creditLine(CREDIT), "Kilde: Danmarks Riges Grundlov af 5. juni 1849 · 1849 · Offentligt domæne");
  assert.equal(client.creditLine({ source: "Lærlig", creator: "N.N." }), "Kilde: N.N. · Lærlig");
  assert.equal(client.creditLine(null), "");
  assert.equal(client.creditLine({ source: " " }), "");
});

function fakeElement(tagName) {
  const attrs = new Map();
  const el = {
    tagName: tagName.toUpperCase(), id: "", className: "", dataset: {}, children: [], _text: "",
    set textContent(v) { el._text = String(v); el.children = []; },
    get textContent() { return el._text; },
    set innerHTML(_v) { throw new Error("innerHTML must never be used"); },
    setAttribute(n, v) { attrs.set(n, String(v)); },
    getAttribute(n) { return attrs.has(n) ? attrs.get(n) : null; },
    hasAttribute(n) { return attrs.has(n); },
    appendChild(c) { el.children.push(c); return c; },
  };
  return el;
}
const fakeDocument = { createElement: (t) => fakeElement(t) };
const find = (node, tag) => {
  if (node.tagName === tag.toUpperCase()) return node;
  for (const c of node.children ?? []) { const f = find(c, tag); if (f) return f; }
  return null;
};

test("browser: a source is a labelled figure with the text as plain text and the read-aloud player", () => {
  const calls = [];
  const fig = client.buildStimulus(fakeDocument, SOURCE, { attachReadAloud: (el, text, ctx) => calls.push([el, text, ctx]), readAloudContext: { subject: "historie" } });
  assert.equal(fig.tagName, "FIGURE");
  assert.equal(fig.getAttribute("aria-labelledby"), "stimulus-label");
  assert.equal(fig.children[0].textContent, "Kilde");
  const quote = find(fig, "blockquote");
  assert.equal(quote.textContent, SOURCE.text);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], quote);
  assert.equal(calls[0][1], SOURCE.text);
  assert.deepEqual(calls[0][2], { subject: "historie" });
  assert.equal(find(fig, "figcaption").textContent, client.creditLine(CREDIT));
  // HTML in the text stays text.
  const html = client.buildStimulus(fakeDocument, { ...SOURCE, text: "<img src=x onerror=alert(1)>" });
  assert.equal(find(html, "blockquote").textContent, "<img src=x onerror=alert(1)>");
  assert.equal(find(html, "img"), null);
  // A failing read-aloud never breaks the stimulus.
  assert.doesNotThrow(() => client.buildStimulus(fakeDocument, SOURCE, { attachReadAloud: () => { throw new Error("x"); } }));
});

test("browser: an image has its alt text and loads only from this site's stimulus folder", () => {
  const fig = client.buildStimulus(fakeDocument, IMAGE);
  const img = find(fig, "img");
  // The figure's kind class never equals a class of an element inside it (the image's white
  // background once painted the whole frame because both were "stimulus-image").
  assert.equal(fig.className, "stimulus stimulus-kind-image");
  assert.equal(img.className, "stimulus-image");
  assert.equal(img.getAttribute("src"), "assets/stimulus/grundloven-1849-tidslinje.svg");
  assert.equal(img.getAttribute("alt"), IMAGE.alt);
  assert.equal(fig.children[0].textContent, "Billede");
  assert.ok(fig.children.some((c) => c.textContent === IMAGE.caption));
  assert.equal(find(client.buildStimulus(fakeDocument, IMAGE, { mediaBase: "../../assets/stimulus/" }), "img").getAttribute("src"),
    "../../assets/stimulus/grundloven-1849-tidslinje.svg");
});

test("browser (F-07 a11y): an image's information can be opened as text and read aloud, named as the image description", () => {
  const calls = [];
  const fig = client.buildStimulus(fakeDocument, IMAGE, { attachReadAloud: (el, text, ctx) => calls.push([el, text, ctx]), readAloudContext: { subject: "historie" } });
  const details = find(fig, "details");
  assert.equal(details.className, "stimulus-image-description");
  assert.equal(find(details, "summary").textContent, client.STIMULUS_TEXT.imageDescription);
  const p = details.children[1];
  assert.equal(p.id, "stimulus-image-text");
  assert.equal(p.textContent, IMAGE.alt, "plain text, the same information as the alt text");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], p);
  assert.equal(calls[0][1], IMAGE.alt);
  assert.deepEqual(calls[0][2], { subject: "historie", target: "image" });
  // still there without read-aloud, and a failing read-aloud never breaks the image
  assert.ok(find(client.buildStimulus(fakeDocument, IMAGE), "details"));
  assert.doesNotThrow(() => client.buildStimulus(fakeDocument, IMAGE, { attachReadAloud: () => { throw new Error("x"); } }));
  // the credit stays the last child (figcaption)
  assert.equal(fig.children.at(-1).tagName, "FIGCAPTION");
});

test("read-aloud adapter (F-07 a11y): the image description has its own spoken name", () => {
  const src = readFileSync(join(ROOT, "js", "read-aloud", "adapters", "quiz.js"), "utf8");
  assert.match(src, /target === "source" \? "kilden" : target === "image" \? "billedbeskrivelsen" : "spørgsmålet"/);
});

test("browser: an audio clip has keyboard-operable controls and its transcript behind \"Vis teksten\"", () => {
  const fig = client.buildStimulus(fakeDocument, AUDIO);
  const audio = find(fig, "audio");
  assert.equal(audio.hasAttribute("controls"), true);
  assert.equal(audio.getAttribute("preload"), "none");
  assert.equal(audio.getAttribute("src"), "assets/stimulus/grundloven-1849-valgret.wav");
  assert.equal(audio.getAttribute("aria-label"), "Lydklip: Hvem måtte stemme?");
  const details = find(fig, "details");
  assert.equal(find(details, "summary").textContent, "Vis teksten");
  assert.equal(details.children[1].textContent, AUDIO.transcript);
  assert.equal(fig.children[0].textContent, "Lyt");
});

test("browser: buildStimulus refuses an invalid stimulus and a missing document", () => {
  assert.throws(() => client.buildStimulus(fakeDocument, { invalid: true }), /valid stimulus/);
  assert.throws(() => client.buildStimulus(null, SOURCE), /document/);
});

// ── The quiz wiring (source level) ──────────────────────────────────────────────────────────────

test("app.js: the stimulus is cleared for every question, shown above it, and a broken one fails loud", () => {
  const app = code(read("app.js"));
  assert.match(app, /import \{ readStimulus, buildStimulus \} from "\.\/js\/stimulus\.js";/);
  assert.match(app, /const stimulusElement = document\.getElementById\("stimulus"\);/);
  const load = app.slice(app.indexOf("async function loadAndRenderQuestion() {"));
  assert.match(load.slice(0, 300), /stopReadAloud\(\);\s*clearStimulus\(\);/);
  // Rendered before the question text; a false result is the visible error with a way out.
  const at = load.indexOf("if (!renderStimulus(question.content)) {");
  assert.ok(at > 0 && at < load.indexOf("questionElement.textContent = question.content.question;"));
  const block = load.slice(at, load.indexOf("questionElement.textContent = question.content.question;"));
  assert.match(block, /uiState = "IDLE";/);
  assert.match(block, /msg\.id = "unsupported-format";/);
  assert.match(block, /hubBtn\.id = "go-hub-btn";/);
  assert.match(block, /return;/);
  assert.match(app, /logError\("INVALID_STIMULUS"/);
  assert.match(app, /attachReadAloud: attachReadAloudControl,/);
  assert.match(app, /readAloudContext: \{ subject: currentSubject, target: "source" \},/);
  const ra = read("js/read-aloud/adapters/quiz.js");
  // a source is "kilden", an image description "billedbeskrivelsen", everything else "spørgsmålet"
  assert.match(ra, /target === "source" \? "kilden" : target === "image" \? "billedbeskrivelsen" : "spørgsmålet"/);
  const html = read("index.html");
  assert.match(html, /<div id="stimulus" hidden><\/div>\s*<div id="question">/);
  assert.match(html, /<link rel="stylesheet" href="css\/stimulus\.css">/);
});

// ── The example sequence ───────────────────────────────────────────────────────────────────────

test("example: introduction → comprehension check → independent application, every step in contract", () => {
  const phases = EXAMPLE.steps.map((s) => s.phase);
  assert.deepEqual(phases, ["introduktion", "introduktion", "forståelsestjek", "selvstændig anvendelse"]);
  const kinds = EXAMPLE.steps.map((s) => s.row.content.stimulus.kind);
  assert.deepEqual(kinds, ["image", "audio", "source", "source"]);
  for (const [i, step] of EXAMPLE.steps.entries()) {
    const { content, answer_format: format } = step.row;
    assert.deepEqual(checkStimulus(content.stimulus), { errors: [], warnings: [] }, `step ${i}`);
    assert.ok(typeof content.correct === "string" && content.correct.length > 0, `step ${i}: has a key`);
    if (format === "mc") assert.ok(content.options.includes(content.correct), `step ${i}: key is an option`);
    assert.ok(typeof content.review_text === "string" && content.review_text.length > 0, `step ${i}: has feedback`);
    const pub = toPublicQuestion(content, format, null);
    const json = JSON.stringify(pub);
    for (const k of GRADING_KEYS) assert.equal(json.includes(`"${k}"`), false, `step ${i}: ${k} leaked`);
    assert.equal(/Ã|�/.test(json), false, `step ${i}: mojibake`);
  }
  // The image file is in the deployed folder; the audio recording is a documented gap, not a silent one.
  assert.ok(read("assets/stimulus/grundloven-1849-tidslinje.svg").includes("<svg"));
  assert.match(EXAMPLE.audio_note, /findes IKKE i repoet/);
});
