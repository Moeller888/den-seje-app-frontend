// Browserens del af anti-gætte-pausen (js/quiz-cooldown.js) og H5-klassifikationen af 429
// (js/answer-submission.js). Ren logik — DOM-delen i app.js dækkes af tests/quiz-cooldown.spec.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  COOLDOWN_TEXT, FALLBACK_COOLDOWN_MS, formatRemaining, serverRemainingMs, createCountdown, cooldownFromServer,
  cooldownFromInvokeError, fetchCooldownStatus, openCooldownChannel, announceCooldown, RPC_NAME,
} from "../../js/quiz-cooldown.js";
import { classifyResponse } from "../../js/answer-submission.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// supabase-js' FunctionsHttpError: name + context (the Response).
const httpError = (status, body) => ({
  name: "FunctionsHttpError",
  context: new Response(typeof body === "string" ? body : JSON.stringify(body), { status }),
});

test("den godkendte tekst, ordret", () => {
  assert.deepEqual({ ...COOLDOWN_TEXT }, {
    title: "🧠 Hov, lidt for hurtigt!",
    body: "Tag en lille tænkepause. Du kan snart fortsætte din læring!",
    button: "Fortsæt quizzen",
    note: "Du mister ikke XP eller mønter i pausen.",
  });
});

test("intet i browserens kode kender tærsklen, vinduet eller antallet af fejl", () => {
  // (MM:SS-formateringens "/ 60" og "% 60" er sekunder pr. minut, ikke vinduet.)
  const src = readFileSync(join(ROOT, "js", "quiz-cooldown.js"), "utf8").replace(/^\s*\/\/.*$/gm, "")
    .replace(/total \/ 60\b/, "").replace(/total % 60\b/, "");
  assert.doesNotMatch(src, /threshold|window_seconds|wrong_answer|recent_wrong|\b10\b|\b60\b|60_000|60000/);
  const app = readFileSync(join(ROOT, "app.js"), "utf8");
  assert.doesNotMatch(app, /quiz_cooldown_config|recent_wrong_at|wrong_answer_threshold/);
});

test("formatRemaining: MM:SS, rundet op, aldrig negativ", () => {
  const cases = [[120_000, "02:00"], [119_001, "02:00"], [119_000, "01:59"], [60_000, "01:00"], [59_999, "01:00"],
    [1, "00:01"], [0, "00:00"], [-5, "00:00"], [NaN, "00:00"], [undefined, "00:00"], [600_000, "10:00"]];
  for (const [ms, s] of cases) assert.equal(formatRemaining(ms), s, String(ms));
});

test("serverRemainingMs: kun fra serverens to tidspunkter; urimelige værdier afvises", () => {
  assert.equal(serverRemainingMs("2026-11-05T12:02:00Z", "2026-11-05T12:00:00Z"), 120_000);
  assert.equal(serverRemainingMs("2026-11-05T12:00:00Z", "2026-11-05T12:00:05Z"), 0, "udløbet → 0");
  assert.equal(serverRemainingMs(null, "2026-11-05T12:00:00Z"), null);
  assert.equal(serverRemainingMs("x", "2026-11-05T12:00:00Z"), null);
  assert.equal(serverRemainingMs("2026-11-07T12:00:00Z", "2026-11-05T12:00:00Z"), null, "mere end et døgn");
});

test("Q/J: nedtællingen bruger den monotone klokke — et ændret systemur ændrer intet", () => {
  let mono = 1_000;
  const realNow = Date.now;
  try {
    const c = createCountdown(120_000, () => mono);
    assert.equal(formatRemaining(c.remainingMs()), "02:00");
    Date.now = () => realNow() + 3_600_000;          // eleven stiller uret en time frem
    assert.equal(formatRemaining(c.remainingMs()), "02:00");
    Date.now = () => realNow() - 3_600_000;          // … eller tilbage
    mono += 30_000;
    assert.equal(formatRemaining(c.remainingMs()), "01:30");
    mono += 89_500;
    assert.equal(formatRemaining(c.remainingMs()), "00:01");
    mono += 500;
    assert.equal(c.remainingMs(), 0);
    mono -= 50_000;                                  // en klokke, der går baglæns, giver ikke tid tilbage
    assert.equal(c.remainingMs() <= 120_000, true);
  } finally {
    Date.now = realNow;
  }
});

test("J: efter genindlæsning fortsætter nedtællingen fra serverens resttid, ikke fra 02:00", () => {
  const info = cooldownFromServer("2026-11-05T12:02:00.000Z", "2026-11-05T12:01:15.400Z");
  assert.deepEqual(info, { remainingMs: 44_600, verified: true });
  assert.equal(formatRemaining(createCountdown(info.remainingMs, () => 0).remainingMs()), "00:45");
  assert.deepEqual(cooldownFromServer(null, null), { remainingMs: FALLBACK_COOLDOWN_MS, verified: false });
});

test("cooldownFromInvokeError: 429 fra den nye process-event og v34's 500 med databasens besked", async () => {
  assert.deepEqual(await cooldownFromInvokeError(httpError(429, {
    outcome: "quiz_cooldown", error: "Quiz cooldown", cooldown_until: "2026-11-05T12:02:00.000Z", server_now: "2026-11-05T12:00:00.000Z",
  })), { endsAt: "2026-11-05T12:02:00.000Z", serverNow: "2026-11-05T12:00:00.000Z" });
  assert.deepEqual(await cooldownFromInvokeError(httpError(500, { error: "quiz_cooldown_active" })), { endsAt: null, serverNow: null });
  for (const e of [null, { name: "FunctionsFetchError" }, httpError(500, { error: "Instance not found" }),
    httpError(429, { error: "Too many requests" }), httpError(429, "<html>"), httpError(426, { outcome: "client_outdated" })]) {
    assert.equal(await cooldownFromInvokeError(e), null);
  }
});

test("fetchCooldownStatus: kun egen status; manglende funktion eller fejl → null (fail-soft)", async () => {
  const client = (res) => ({ rpc: async (name) => { assert.equal(name, RPC_NAME); return res; } });
  assert.deepEqual(await fetchCooldownStatus(client({ data: { active: true, ends_at: "a", server_now: "b" }, error: null })),
    { active: true, endsAt: "a", serverNow: "b" });
  assert.deepEqual(await fetchCooldownStatus(client({ data: { active: false, ends_at: null, server_now: "b" }, error: null })),
    { active: false, endsAt: null, serverNow: null });
  assert.equal(await fetchCooldownStatus(client({ data: null, error: { code: "PGRST202" } })), null);
  assert.equal(await fetchCooldownStatus(client({ data: [1], error: null })), null);
  assert.equal(await fetchCooldownStatus({ rpc: async () => { throw new Error("net"); } }), null);
});

test("I: fanekanalen sender en tom besked og kalder modtageren; uden BroadcastChannel er den null", async () => {
  const got = [];
  const a = openCooldownChannel(() => got.push("a"));
  const b = openCooldownChannel(() => got.push("b"));
  if (typeof BroadcastChannel === "undefined") {
    assert.equal(a, null);
    return;
  }
  announceCooldown(a);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(got, ["b"], "kun den anden fane reagerer, og den spørger selv serveren");
  a.close(); b.close();
  announceCooldown(null);   // fail-soft
});

test("H5: classifyResponse genkender 429 quiz_cooldown som en bekræftet afvisning (ikke 'uncertain')", async () => {
  const r = await classifyResponse({ data: null, error: httpError(429, {
    outcome: "quiz_cooldown", error: "Quiz cooldown", cooldown_until: "2026-11-05T12:02:00.000Z", server_now: "2026-11-05T12:00:00.000Z",
  }) }, { round_no: 1 });
  assert.deepEqual(r, { kind: "quiz_cooldown", endsAt: "2026-11-05T12:02:00.000Z", serverNow: "2026-11-05T12:00:00.000Z" });
  const other = await classifyResponse({ data: null, error: httpError(429, { error: "rate limited" }) }, { round_no: 1 });
  assert.equal(other.kind, "uncertain", "en 429 uden vores outcome er stadig usikker");
});
