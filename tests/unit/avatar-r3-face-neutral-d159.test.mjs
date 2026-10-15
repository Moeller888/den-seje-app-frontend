// D-159 — R3 face-neutral is PREPARED as a direct transparent feature layer. Preparation only: no upload, no image
// request, no call id, no claim, no credentials. These tests guard the register, the contract section, the
// preparation-only adapter (which must be unable to send) and the output checks — all on synthetic files and the
// tracked Northstar; no real claim, no API key, no private H1-derived guide is needed or read.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { spawnSync, execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { preD159Contract, PRE_D159_CONTRACT_CANONICAL_SHA256, D159_ADDED_TOP_LEVEL_KEYS } from "./avatar-r3-d147-closure.mjs";
import { PINS, PARAMETERS, FIELD_ORDER, OMITTED, ENDPOINT_DOCUMENTATION, buildPreview, validateFields, parseArgs } from "../../tools/avatar/prepare-r3-face-neutral-request.mjs";
import { checkFaceNeutralOutput, readPng, browShapes, bboxOf, BROAD_ENVELOPE, NOSE_TARGET, MOUTH_TARGET, BROW_MARGIN, BROW_RULE, EYE_ZONES } from "../../tools/avatar/check-r3-face-neutral-output.mjs";

const HERE = dirname(fileURLToPath(import.meta.url)), REPO = join(HERE, "..", "..");
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const rel = (p) => join(REPO, ...p.split("/"));
const C = JSON.parse(readFileSync(rel("tools/avatar/fixtures/r3/r3-shadow-contract-v1.json"), "utf8"));
const S = C.faceNeutralPreparation;
const REG = readFileSync(rel("docs/project-state.md"), "utf8").split("\n");
const rowsOf = (k) => REG.filter((l) => l.startsWith("| **" + k + "** |"));
const ADAPTER = rel("tools/avatar/prepare-r3-face-neutral-request.mjs"), CHECKS = rel("tools/avatar/check-r3-face-neutral-output.mjs");
const W = 1024, H = 1536;

// ── synthetic PNG encoder (filter 0; colour types 2 and 6) ─────────────────────────────────────────────────────
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const v of b) c = CRC[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "ascii"), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); };
function png(w, h, rgba, ct = 6) { const ch = ct === 6 ? 4 : 3, raw = Buffer.alloc(h * (w * ch + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = (y * w + x) * 4, d = y * (w * ch + 1) + 1 + x * ch; for (let k = 0; k < ch; k++) raw[d + k] = rgba[s + k]; }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = ct;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]); }
const canvas = () => Buffer.alloc(W * H * 4);
const put = (o, x, y, c) => o.set(c, (y * W + x) * 4);
/** a small, plainly synthetic feature: a dark horizontal bar inside the broad envelope (not a facial feature) */
function bar() { const o = canvas(); for (let y = 320; y < 326; y++) for (let x = 500; x < 520; x++) put(o, x, y, [40, 30, 25, 255]); return o; }

// ── register ────────────────────────────────────────────────────────────────────────────────────────────────
test("D-159 is registered exactly once, directly after D-158, and D-158 is not rewritten — only its status is re-pointed", () => {
  assert.equal(rowsOf("D-159").length, 1);
  assert.equal(REG.findIndex((l) => l.startsWith("| **D-159** |")), REG.findIndex((l) => l.startsWith("| **D-158** |")) + 1);
  const d158 = rowsOf("D-158")[0];
  const NEW = "Status **`BROW_DEFINITION_BINDING — WORDING_CORRECTED_BY_D-159`** (2026-10-14 — see D-159; was `B — KONTRAKT BLOKERER` for requestforberedelsen);";
  const OLD = "Status **`B — KONTRAKT BLOKERER`** for requestforberedelsen;";
  assert.equal(d158.split(NEW).length, 2, "D-158's status is re-pointed to D-159 and keeps the old status as 'was'");
  assert.equal(sha256(d158.replace(NEW, OLD) + "\n"), "564229aee3b794e10a5bf27938079759112015eea2f0ea7d51775ccce7bed624", "apart from the status line, D-158 is the row as registered");
  assert.ok(rowsOf("D-157").length <= 1, "D-157 (from its own branch) is never duplicated");
});

test("the D-159 row carries the decision, the pins, the exception's conditions and the D-158 correction", () => {
  const row = rowsOf("D-159")[0];
  for (const needle of ["PREPARATION ONLY — NO IMAGE REQUEST AUTHORISED", "`UNASSIGNED`", "`NONE`", "forbliver **5**", "default OFF",
    PINS.guide.sha256, PINS.northstar.sha256, PINS.prompt.sha256, "gpt-image-2.5-sunburst-2026-09-08", "`[384,230,632,412]`", "inklusivt",
    "statiske øjenlågsfold", "ikke blinklagets bevægelige øjenlåg", "normal source-over", "uden hudpatches",
    "kun efter sin egen kaldstilladelse", "ikke automatisk en accepteret kandidat", "review på det godkendte underlag", "ændret hudtone eller skygge kræver fornyet visuelt review",
    "ikke med, at transparens alene gør laget hudtoneuafhængigt", "*som udgangspunkt*", "*alene*", "foreløbigt designforslag", "en lokal commit opfylder ikke det krav"])
    assert.ok(row.includes(needle), "D-159 must carry " + JSON.stringify(needle));
  assert.ok(!/[ÃÂ]\S|�/.test(row), "no mojibake");
  assert.ok(!/oejen|haar|\bfoelge|\bae[bn]dr/i.test(row), "no ASCII transliteration of Danish");
});

// ── contract ────────────────────────────────────────────────────────────────────────────────────────────────
test("D-159 adds exactly one top-level section: the pre-D-159 contract is reproduced canonically", () => {
  assert.deepEqual(D159_ADDED_TOP_LEVEL_KEYS, ["faceNeutralPreparation"]);
  const pre = preD159Contract(C);
  assert.equal(sha256(JSON.stringify(pre)), PRE_D159_CONTRACT_CANONICAL_SHA256);
  assert.deepEqual(Object.keys(C).filter((k) => !(k in pre)), ["faceNeutralPreparation"]);
});

test("the section authorises nothing: no call id, no claim, no new authorisedCalls entry, counter 5, R3 OFF", () => {
  assert.equal(S.decision, "D-159");
  assert.deepEqual([S.isAuthorisation, S.authorisesImageRequest, S.authorisesUpload, S.preparedRequest.sendable], [false, false, false, false]);
  const keys = []; const walk = (v) => { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) { keys.push(k); walk(x); } };
  walk(S);
  for (const k of ["callId", "claim", "claimIdentity", "mandateState", "authorisedCall"]) assert.ok(!keys.includes(k), "the section has no " + k);
  assert.equal(C.authorisedCalls.calls.length, 5);
  assert.ok(!C.authorisedCalls.calls.some((e) => /face/i.test(JSON.stringify(e.callId ?? ""))));
  assert.equal(C.imageCallBudget.callsActuallySentSoFar.underlay, 5);
  assert.deepEqual([C.imageCallBudget.isAuthorisation, C.meta.authorisesImageRequest, C.architecture.defaultEnabled], [false, false, false]);
  assert.deepEqual(C.assets.find((a) => a.name === "r3-face-neutral"), { id: 5, name: "r3-face-neutral", slot: "face", method: "generated", calls: 1 });
  assert.ok(!/AVATAR_R3\s*=\s*true/.test(readFileSync(rel("js/avatar-layers.js"), "utf8")), "R3 stays OFF");
});

test("the later-attempt rules: three distinct quantities, no sixth underlay call, history untouched, every image kept", () => {
  const R = S.laterAttemptRules;
  assert.match(R.source, /authorises nothing/);
  assert.match(R.callCounting.threeQuantities, /three different quantities/);
  assert.match(R.callCounting.decisionOrMergeIsNotASend, /No owner decision, authorisation entry or merge ever raises callsActuallySentSoFar/);
  assert.match(R.callCounting.underlayStaysFive, /never counted as a sixth underlay call/);
  assert.match(R.callCounting.historicalAccounting, /not rewritten/);
  assert.equal(C.imageCallBudget.callsActuallySentSoFar.underlay, 5);
  assert.ok(C.imageCallBudget.callsActuallySentSoFar.which.includes("D-142 — sent during the incident, outcome UNKNOWN"), "the historical D-142 record is unchanged");
  assert.ok(!("whenASendIsRecorded" in R.callCounting) && !("unknownOutcome" in R.callCounting), "the superseded rule that counted an unknown outcome as sent is gone");
  assert.match(R.unexpectedImageCount.keep, /complete raw response and every delivered image/);
  assert.match(R.unexpectedImageCount.record, /actual number of images and the SHA-256/);
  assert.match(R.unexpectedImageCount.mark, /n = 1, mark the outcome UNEXPECTED/);
  assert.match(R.unexpectedImageCount.never, /No automatic selection, no candidate production and no retry/);
  assert.ok(!/first image/i.test(JSON.stringify(R)), "no 'record only the first image' rule");
  assert.match(R.sendPath, /never gets a send path/);
  assert.deepEqual(Object.keys(C.imageCallBudget.callsActuallySentSoFar).filter((k) => typeof C.imageCallBudget.callsActuallySentSoFar[k] === "number"), ["underlay"], "no face counter exists before a face attempt");
});

// ── the claim / dispatch / result model, checked by deriving it from synthetic event sequences ──────────────
// A pure reducer over the events a future send adapter could record. It never touches a real claim or the network.
function derive(events) {
  const has = (e) => events.includes(e);
  const claimState = has("claim") ? "consumed" : "unconsumed";
  const dispatch = has("dispatch") ? "started" : has("stop") ? "not-started" : claimState === "consumed" ? "undetermined" : "not-started";
  const result = has("response") ? "response" : has("httpError") ? "http-error" : dispatch === "not-started" ? "none" : "unknown";
  return { claimState, dispatch, result, actuallySent: dispatch === "started" ? 1 : 0, dispatchUndetermined: dispatch === "undetermined" ? 1 : 0,
    serverAnswered: result === "response" || result === "http-error", automaticRetry: false };
}
const SEQUENCES = [["claim", "stop"], ["claim", "crash"], ["claim", "dispatch", "crash"], ["claim", "dispatch", "httpError"], ["claim", "dispatch", "response"]];

test("the five registered cases are exactly what the synthetic event sequences imply", () => {
  const cases = S.laterAttemptRules.callCounting.cases;
  assert.equal(cases.length, 5);
  SEQUENCES.forEach((seq, i) => {
    const d = derive(seq), c = cases[i];
    for (const k of ["claimState", "dispatch", "result", "actuallySent", "dispatchUndetermined", "serverAnswered", "automaticRetry"])
      assert.equal(c[k], d[k], `case ${i + 1} (${c.case}) — ${k}`);
  });
});

test("the accounting is internally consistent across every case", () => {
  const cases = S.laterAttemptRules.callCounting.cases;
  for (const c of cases) {
    assert.equal(c.claimState, "consumed");
    assert.equal(c.automaticRetry, false, "a consumed claim never allows an automatic retry");
    assert.equal(c.actuallySent, c.dispatch === "started" ? 1 : 0, "only a documented dispatch start counts as sent");
    assert.equal(c.dispatchUndetermined, c.dispatch === "undetermined" ? 1 : 0, "an undetermined start is recorded separately");
    assert.ok(!(c.actuallySent && c.dispatchUndetermined), "an attempt is never both sent and undetermined");
    assert.equal(c.serverAnswered, c.result === "http-error" || c.result === "response", "only a received response documents a server answer");
    if (c.serverAnswered) assert.equal(c.dispatch, "started", "a server answer implies a documented dispatch");
    if (c.dispatch === "not-started") assert.equal(c.result, "none");
  }
  assert.ok(cases.some((c) => c.claimState === "consumed" && c.actuallySent === 0 && c.dispatch === "not-started"), "a consumed claim alone is not a dispatch");
  assert.ok(cases.some((c) => c.dispatch === "started" && c.result === "unknown" && c.actuallySent === 1 && !c.serverAnswered), "an unknown result does not downgrade a documented dispatch");
  const sum = (k) => cases.reduce((n, c) => n + c[k], 0), notStarted = cases.filter((c) => c.dispatch === "not-started").length;
  assert.deepEqual([sum("actuallySent"), sum("dispatchUndetermined"), notStarted], [3, 1, 1]);
  assert.equal(sum("actuallySent") + sum("dispatchUndetermined") + notStarted, cases.length, "every consumed claim is exactly one of sent / undetermined / not started");
  assert.equal(cases.filter((c) => c.serverAnswered).length, 2);
});

test("negative control: the consistency rules reject the superseded model and a claim-only send", () => {
  assert.equal(derive(["claim", "crash"]).actuallySent, 0, "an undetermined dispatch is not counted as sent");
  const documented = derive(["claim", "dispatch", "crash"]);
  const superseded = { ...documented, dispatch: "undetermined" };   // the rejected idea: an unknown result makes the dispatch unknown
  assert.notEqual(superseded.dispatch, documented.dispatch);
  assert.notEqual(superseded.actuallySent, superseded.dispatch === "started" ? 1 : 0, "the consistency rule detects it");
  const claimOnlySend = { ...derive(["claim", "stop"]), actuallySent: 1 };
  assert.notEqual(claimOnlySend.actuallySent, claimOnlySend.dispatch === "started" ? 1 : 0, "the consistency rule detects a claim-only send");
});

test("the section's pins and parameters are exactly the adapter's", () => {
  const r = S.preparedRequest;
  assert.equal(r.model, PARAMETERS.model);
  assert.deepEqual(r.parameters, { size: "1024x1536", quality: "high", n: 1, output_format: "png", background: "transparent" });
  assert.deepEqual(r.fieldOrder, [...FIELD_ORDER]); assert.deepEqual(r.omitted, [...OMITTED]);
  assert.equal(r.inputs[0].sha256, PINS.guide.sha256); assert.equal(r.inputs[0].tracked, false);
  assert.equal(r.inputs[1].sha256, PINS.northstar.sha256); assert.equal(r.prompt.sha256, PINS.prompt.sha256);
  assert.deepEqual(S.areaModel.broadEnvelope.rect, [...BROAD_ENVELOPE]);
  assert.deepEqual(S.areaModel.targetAreas.nose, [...NOSE_TARGET]); assert.deepEqual(S.areaModel.targetAreas.mouth, [...MOUTH_TARGET]);
  assert.deepEqual(S.areaModel.excludedZones.eyeZones, EYE_ZONES.map((z) => [...z]));
});

test("the tracked Northstar and the exact prompt text match their pins", () => {
  assert.equal(sha256(readFileSync(rel(PINS.northstar.path))), PINS.northstar.sha256);
  const p = readFileSync(rel(PINS.prompt.path));
  assert.equal(sha256(p), PINS.prompt.sha256); assert.equal(p.length, PINS.prompt.bytes);
  assert.ok(!p.includes(13) && p[p.length - 1] !== 10, "LF only, no trailing newline");
});

// ── coordinate convention (inclusive) ───────────────────────────────────────────────────────────────────────
test("the broad envelope is the union of the target areas padded by 10 px, inclusive, and the brows are the reviewed fit", () => {
  const ns = readPng(readFileSync(rel(PINS.northstar.path)));
  const { left, right } = browShapes(ns.rgba);
  assert.deepEqual(bboxOf(left), BROW_RULE.leftBbox); assert.deepEqual(bboxOf(right), BROW_RULE.rightBbox);
  assert.equal(left.size, BROW_RULE.px); assert.equal(right.size, BROW_RULE.px);
  const grow = ([a, b, c, d], m) => [a - m, b - m, c + m, d + m];
  const boxes = [grow(BROW_RULE.leftBbox, BROW_MARGIN), grow(BROW_RULE.rightBbox, BROW_MARGIN), [...NOSE_TARGET], [...MOUTH_TARGET]];
  assert.deepEqual(boxes.slice(0, 2), [[394, 244, 485, 276], [531, 240, 622, 272]]);
  const union = boxes.reduce((u, b) => [Math.min(u[0], b[0]), Math.min(u[1], b[1]), Math.max(u[2], b[2]), Math.max(u[3], b[3])]);
  assert.deepEqual(grow(union, 10), [...BROAD_ENVELOPE]);
});

// ── the adapter cannot send ─────────────────────────────────────────────────────────────────────────────────
const codeOf = (file) => readFileSync(file, "utf8").split("\n").filter((l) => !l.trimStart().startsWith("//")).join("\n");
test("neither tool has network capability, reads the environment or writes files", () => {
  const a = codeOf(ADAPTER), c = codeOf(CHECKS);
  assert.deepEqual([...a.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]).sort(), ["node:crypto", "node:fs", "node:path", "node:url"]);
  assert.deepEqual([...c.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]), ["node:zlib"]);
  for (const [name, src] of [["adapter", a], ["checks", c]]) {
    for (const re of [/\bfetch\s*\(/, /\bimport\s*\(/, /\brequire\s*\(/, /node:(?:http|https|net|tls|dns|dgram|child_process|worker_threads)/, /undici|XMLHttpRequest|WebSocket|EventSource/,
      new RegExp("process\\." + "env"), new RegExp("OPENAI" + "_"), /api[-_]?key\s*[:=]/i, /authorization\s*:/i, /bearer\s/i, /writeFileSync|appendFileSync|createWriteStream|mkdirSync|renameSync|unlinkSync|rmSync/, /claim-register|\.claim\.json/])
      assert.ok(!re.test(src), `${name} must not contain ${re}`);
  }
  assert.equal((a.match(/https:\/\//g) || []).length, 1, "the adapter names the endpoint exactly once");
  assert.ok(ENDPOINT_DOCUMENTATION.includes("https://api.openai.com/v1/images/edits") && /documentation only/.test(ENDPOINT_DOCUMENTATION));
  assert.ok(!/https?:\/\//.test(c), "the checks name no URL at all");
});

test("the adapter CLI refuses every send-, credential- and unknown flag before touching a file", () => {
  for (const flag of ["--send", "--execute", "--live", "--upload", "--fetch", "--claim=x", "--call-id=x", "--api-key=NOT_A_REAL_KEY", "--token=NOT_A_REAL_TOKEN", "--owner-approval=D-159", "--endpoint=x", "--force", "--foo"]) {
    const r = spawnSync(process.execPath, [ADAPTER, flag, "--guide=does-not-exist.png"], { env: {}, encoding: "utf8" });
    assert.equal(r.status, 2, flag + " must be refused"); assert.match(r.stderr, /^REFUSED: /, flag);
    assert.equal(r.stdout, "", flag + " must print no preview");
  }
  const none = spawnSync(process.execPath, [ADAPTER], { env: {}, encoding: "utf8" });
  assert.equal(none.status, 2); assert.match(none.stderr, /--guide=/);
  assert.throws(() => parseArgs(["--guide=a.png", "--guide=b.png"]), /REFUSED/);
  assert.equal(parseArgs(["--guide=a.png"]), "a.png");
});

test("unknown request fields and changed parameter values are refused", () => {
  assert.deepEqual(validateFields({}), { ...PARAMETERS });
  for (const f of [{ mask: "x" }, { input_fidelity: "high" }, { moderation: "low" }, { prompt: "x" }, { image: "x" }, { quality: "max" }, { background: "auto" }, { size: "1024x1024" }, { n: 2 }, { model: "gpt-image-2-2026-04-21" }])
    assert.throws(() => validateFields(f), /REFUSED/, JSON.stringify(f));
});

// ── deterministic preview on synthetic inputs ───────────────────────────────────────────────────────────────
function synthetic() {
  const guideBuf = png(W, H, bar()), o = canvas(); for (let y = 100; y < 140; y++) for (let x = 100; x < 140; x++) put(o, x, y, [200, 120, 80, 255]);
  const northstarBuf = png(W, H, o), promptBuf = Buffer.from("Synthetic test prompt. Not a production prompt.", "utf8");
  const pins = { guide: { name: "synthetic-guide.png", sha256: sha256(guideBuf), bytes: guideBuf.length, storage: "synthetic" }, northstar: { path: "synthetic-northstar.png", sha256: sha256(northstarBuf), bytes: northstarBuf.length }, prompt: { path: "synthetic-prompt.txt", sha256: sha256(promptBuf), bytes: promptBuf.length } };
  return { guideBuf, northstarBuf, promptBuf, pins };
}
test("the request preview is deterministic, sanitised and never sendable", () => {
  const s = synthetic();
  const a = buildPreview(s, s.pins), b = buildPreview(s, s.pins);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.sendable, false); assert.equal(a.callId, "UNASSIGNED"); assert.equal(a.claim, "NONE"); assert.equal(a.authorisation, "NONE"); assert.equal(a.uploadApproval, "NONE");
  assert.deepEqual(a.fields.map((f) => f.name), [...FIELD_ORDER]);
  assert.deepEqual(a.fields.filter((f) => f.name === "image[]").map((f) => f.order), [1, 2]);
  const json = JSON.stringify(a);
  assert.ok(!json.includes(s.guideBuf.subarray(16, 64).toString("base64")) && !/"data"|base64/i.test(json), "no file bytes in the preview");
});

test("a changed, missing or malformed input is refused", () => {
  const s = synthetic();
  const flip = (b) => { const c = Buffer.from(b); c[c.length - 20] ^= 1; return c; };
  assert.throws(() => buildPreview({ ...s, guideBuf: flip(s.guideBuf) }, s.pins), /REFUSED: image 1/);
  assert.throws(() => buildPreview({ ...s, northstarBuf: flip(s.northstarBuf) }, s.pins), /REFUSED: image 2/);
  assert.throws(() => buildPreview({ ...s, promptBuf: Buffer.from("changed") }, s.pins), /REFUSED: prompt/);
  assert.throws(() => buildPreview({ ...s, guideBuf: undefined }, s.pins), /missing/);
  assert.throws(() => buildPreview({ ...s, promptBuf: undefined }, s.pins), /missing/);
  const small = png(512, 768, Buffer.alloc(512 * 768 * 4)); // wrong canvas, with a matching pin
  assert.throws(() => buildPreview({ ...s, guideBuf: small }, { ...s.pins, guide: { ...s.pins.guide, sha256: sha256(small), bytes: small.length } }), /1024x1536/);
  const crlf = Buffer.from("line one\r\nline two", "utf8");
  assert.throws(() => buildPreview({ ...s, promptBuf: crlf }, { ...s.pins, prompt: { ...s.pins.prompt, sha256: sha256(crlf), bytes: crlf.length } }), /LF/);
  assert.throws(() => buildPreview(s), /REFUSED/, "synthetic files never match the production pins");
});

// ── output checks: binding technical rejections ─────────────────────────────────────────────────────────────
const verdictOf = (buf) => { const r = checkFaceNeutralOutput(buf); return [r.verdict, r.firstFailure]; };
test("binding rejections: decode, canvas, format, empty", () => {
  assert.deepEqual(verdictOf(png(W, H, bar())), ["PASS_TO_VISUAL_REVIEW", null]);
  const good = png(W, H, bar()), bad = Buffer.from(good); for (let k = 0; k < 40; k++) bad[60 + k] ^= 0xa5;
  assert.deepEqual(verdictOf(bad), ["REJECT", "AUTO-1"]);
  assert.deepEqual(verdictOf(Buffer.from("not a png at all, just text")), ["REJECT", "AUTO-1"]);
  assert.deepEqual(verdictOf(png(512, 768, Buffer.alloc(512 * 768 * 4))), ["REJECT", "AUTO-2"]);
  assert.deepEqual(verdictOf(png(W, H, bar(), 2)), ["REJECT", "AUTO-3"], "RGB without an alpha channel");
  assert.deepEqual(verdictOf(png(W, H, canvas())), ["REJECT", "AUTO-4"], "an all-transparent output is empty");
});

test("binding rejection: alpha outside the inclusive broad envelope, tested at every edge", () => {
  const [x0, y0, x1, y1] = BROAD_ENVELOPE;
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1], [x0, 300], [x1, 300], [500, y0], [500, y1]]) {
    const o = bar(); put(o, x, y, [40, 30, 25, 255]);
    assert.deepEqual(verdictOf(png(W, H, o)), ["PASS_TO_VISUAL_REVIEW", null], `(${x},${y}) lies on the inclusive edge`);
  }
  for (const [x, y] of [[x0 - 1, 300], [x1 + 1, 300], [500, y0 - 1], [500, y1 + 1], [x0 - 1, y0 - 1], [x1 + 1, y1 + 1], [0, 0], [1023, 1535]]) {
    const o = bar(); put(o, x, y, [40, 30, 25, 1]);
    assert.deepEqual(verdictOf(png(W, H, o)), ["REJECT", "AUTO-5"], `(${x},${y}) is outside, even at alpha 1`);
  }
});

test("diagnostics flag but never reject; the check never modifies its input", () => {
  const o = bar(); put(o, 440, 320, [30, 20, 15, 255]); put(o, 445, 274, [30, 20, 15, 255]); put(o, 510, 400, [0, 255, 255, 255]);
  const buf = png(W, H, o), before = sha256(buf);
  const r = checkFaceNeutralOutput(buf, readPng(readFileSync(rel(PINS.northstar.path))).rgba);
  assert.equal(r.verdict, "PASS_TO_VISUAL_REVIEW");
  const d = Object.fromEntries(r.diag.map((x) => [x.id, x]));
  assert.equal(d["DIAG-4"].flagged, true); assert.ok(d["DIAG-4"].value.eyeZonePx >= 1 && d["DIAG-4"].value.foldZonePx >= 1);
  assert.equal(d["DIAG-8"].flagged, true, "a guide marker colour is flagged");
  assert.equal(d["DIAG-5"].flagged, true, "the synthetic bar lies outside the target areas");
  assert.equal(d["DIAG-9"].flagged, true, "a sparse layer is flagged, not rejected");
  assert.equal(sha256(buf), before);
});

// ── storage ─────────────────────────────────────────────────────────────────────────────────────────────────
test("nothing private or generated is tracked", () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: REPO, encoding: "utf8" }).split("\n");
  assert.deepEqual(tracked.filter((f) => f.startsWith("tools/avatar/build/") || /placement-guide|A-prime|\.claim\.json$|r3-head-det-u1\.prototype/i.test(f)), []);
  assert.ok(!existsSync(rel("tools/avatar/fixtures/r3-face-neutral/input-1-placement-guide-A-prime.png")), "the H1-derived guide is never placed in fixtures");
});
