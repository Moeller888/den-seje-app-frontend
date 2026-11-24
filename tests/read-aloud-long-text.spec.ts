// Read-aloud of LONG texts (D-362 / F-07) in the REAL quiz — index.html + app.js + js/stimulus.js +
// js/read-aloud/ — offline, like tests/stimulus-quiz.spec.ts: a local static server serves this checkout and
// every *.supabase.co call is answered from fixtures. The read-aloud Worker is played here too:
// /tts/v1/<key>.json (cached clip metadata), /tts/v1/<key>.mp3 (a SYNTHETIC test tone, WAV) and POST /api/tts.
// No Azure, no production, no pupil.
//
// The source is the approved § 35 text of S3 (898 characters; tests/fixtures/d362-approved-pilot-rows.json, the
// owner-approved rows of 63bb8b97, byte-checked in tests/unit/read-aloud-long-text.test.mjs). Before the fix it
// had NO player (one request may carry 800 characters); now it is read as two ordinary requests.
//
// Deterministic: part 2's metadata is held by the test itself (a gate it opens), never by a timer, so the
// "between two parts" moments are reached in every engine regardless of speed.
//
// Proven here: (1) the 898-character source gets "Læs op"; (2) one tap plays part 1 and then part 2 by itself;
// (3) a pause between the parts holds part 2 until "Fortsæt"; (4) the next question stops the reading and
// (5) a late answer for the old part never starts audio; (6) a short source is one unchanged request and a second
// reading is served from memory. It does NOT prove how Azure pronounces the words.
import { test, expect, Route, Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { toPublicQuestion } from "../supabase/functions/_shared/question-dto.ts";
import { planTtsRequests } from "../js/read-aloud/tts-chunks.js";
import { canonicalTtsRequest, ttsKey } from "../js/read-aloud/tts-key.js";
import { closeOfflineQuiz } from "./support/close-offline-quiz";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "tjzbehwfagiwpwodsgwg";
const FIXTURE = JSON.parse(fs.readFileSync(path.join(ROOT, "tests", "fixtures", "d362-approved-pilot-rows.json"), "utf8"));
const S3 = FIXTURE.rows[2];
const S5 = FIXTURE.rows[4];
const LONG = S3.content.stimulus.text;
const SHORT = S5.content.stimulus.text;

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".svg": "image/svg+xml", ".css": "text/css", ".webp": "image/webp",
  ".png": "image/png", ".json": "application/json", ".wav": "audio/wav",
};

let server: http.Server;
let baseUrl: string;

// The read-aloud Worker stand-in, served by the same local server as the page: real HTTP with a length and byte
// ranges (WebKit's media stack does not play audio fulfilled through route interception). Reset per test; the
// tests of a file run one at a time (fullyParallel: false).
type Gate = { open: () => void; opened: Promise<void> };
let held = new Map<string, Gate>();
let metaGets: string[] = [];
test.beforeEach(() => { held = new Map(); metaGets = []; });

function serveClip(p: string, req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const m = /^\/tts\/v1\/([0-9a-f]{64})\.(json|mp3)$/.exec(p);
  if (!m) return false;
  const [, key, ext] = m;
  if (ext === "json") {
    metaGets.push(key);
    const hold = held.get(key);
    void (hold ? hold.opened : Promise.resolve()).then(() => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ key, audio: `/tts/v1/${key}.mp3`, words: [] }));
    });
    return true;
  }
  const range = /bytes=(\d+)-(\d*)/.exec(String(req.headers.range || ""));
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), TONE.length - 1) : TONE.length - 1;
    res.writeHead(206, { "content-type": "audio/wav", "accept-ranges": "bytes", "content-range": `bytes ${start}-${end}/${TONE.length}`, "content-length": String(end - start + 1) });
    res.end(TONE.subarray(start, end + 1));
  } else {
    res.writeHead(200, { "content-type": "audio/wav", "accept-ranges": "bytes", "content-length": String(TONE.length) });
    res.end(TONE);
  }
  return true;
}

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    try {
      const p = decodeURIComponent((req.url || "/").split("?")[0]);
      if (serveClip(p, req, res)) return;
      // Every clip here is "cached": a synthesis request would mean the player asked for something it should not.
      if (p === "/api/tts") { res.writeHead(500, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "unexpected_synthesis" })); return; }
      const fp = path.normalize(path.join(ROOT, p === "/" ? "/index.html" : p));
      if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      const data = fs.readFileSync(fp);
      res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    } catch { res.writeHead(404); res.end("nf"); }
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;
});

test.afterAll(async () => { await new Promise<void>((r) => server.close(() => r())); });

// A synthetic tone stands in for every clip (1.0 s, 8 kHz mono WAV).
function toneWav(seconds = 1): Buffer {
  const rate = 8000, n = Math.floor(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000), 44 + i * 2);
  return buf;
}
const TONE = toneWav();

const UID = "00000000-0000-4000-8000-000000000001";
const IDENTITY = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" };
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "n@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const PROFILE = { id: UID, role: "student", name: "N", email: "n@e.com", equipped_slots: {}, active_title: null, active_theme: null, avatar_gender: "neutral", avatar_identity: IDENTITY, grade: 7, selected_grade: 7, placement_band: 2, current_band: 2, xp: 420, coins: 120 };
const PROGRESS = { student_id: UID, xp: 420, coins: 120, current_streak: 3, longest_streak: 7, correct_answers: 42 };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
const today = new Date().toISOString().slice(0, 10);

async function partKeys(text: string): Promise<string[]> {
  const planned = planTtsRequests(text);
  if (!planned.ok) throw new Error("plan: " + planned.error);
  return Promise.all(planned.parts.map((part: any) => ttsKey(part)));
}

function gate(): Gate {
  let open = () => {};
  const opened = new Promise<void>((r) => { open = r; });
  return { open, opened };
}

type Harness = { page: Page; answered: string[] };
// rows: what get-next-question serves, in order (the last repeats). hold: clip keys whose metadata waits for its gate.
async function openQuiz(browser: any, rows: any[], hold: Map<string, Gate> = new Map()): Promise<Harness> {
  held = hold;
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const answered: string[] = [];
  let n = 0;
  let current = rows[0];
  await ctx.route("**://*.supabase.co/**", async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const p = new URL(req.url()).pathname;
    const wo = ((req.headers()["accept"]) || "").includes("vnd.pgrst.object");
    const one = (o: any) => (wo ? o : [o]);
    const j = (b: any) => route.fulfill({ status: 200, headers: { ...CORS, "content-type": "application/json" }, body: JSON.stringify(b) });
    if (p.startsWith("/auth/v1/user")) return j(USER);
    if (p.startsWith("/auth/v1/token")) return j(SESSION);
    if (p.startsWith("/auth/v1/logout")) return route.fulfill({ status: 204, headers: CORS });
    if (p.startsWith("/functions/v1/get-next-question")) {
      current = rows[Math.min(n, rows.length - 1)];
      const body = { step: "question", question_instance_id: `ra${n}`, answer_format: current.answer_format, answer_type: "short", subject: "Historie", ...toPublicQuestion(current.content, current.answer_format, null) };
      n++;
      return j(body);
    }
    if (p.startsWith("/functions/v1/process-event")) {
      const body = req.postDataJSON() ?? {};
      answered.push(String(body.answer));
      const key = String(current.content.correct);
      const ok = String(body.answer).trim() === key;
      return j({ status: ok ? "correct" : "incorrect", correct_answer: key, review_text: ok ? null : (current.content.review_text ?? null) });
    }
    if (p.startsWith("/functions/v1/")) return j({});
    if (p.startsWith("/rest/v1/rpc/evaluate_achievements")) return j([]);
    if (p.startsWith("/rest/v1/rpc/")) return j(null);
    if (p.startsWith("/rest/v1/profiles")) return j(one(PROFILE));
    if (p.startsWith("/rest/v1/student_progress")) return j([PROGRESS]);
    if (p.startsWith("/rest/v1/daily_login_rewards")) return j(one({ student_id: UID, last_claimed_date: today }));
    return j([]);
  });
  await ctx.addInitScript(([k, s]: [string, any]) => { localStorage.setItem(k, JSON.stringify(s)); }, [`sb-${REF}-auth-token`, SESSION]);
  // Records every play()/playing/ended of a READ-ALOUD element (src under /tts/) and how many play at once.
  // The quiz's own short UI sounds (js/audio.js) are not readings and are not counted.
  await ctx.addInitScript(() => {
    const w = window as any;
    w.__ra = { plays: [] as string[], ended: 0, playing: 0, maxPlaying: 0 };
    const live = new Set<HTMLMediaElement>();
    const reading = (el: any) => String(el.src || "").includes("/tts/");
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      const el = this as any;
      if (reading(el)) w.__ra.plays.push(new URL(el.src).pathname);
      if (!el.__raObserved) {
        el.__raObserved = true;
        el.addEventListener("playing", () => { if (reading(el)) live.add(el); w.__ra.playing = live.size; w.__ra.maxPlaying = Math.max(w.__ra.maxPlaying, live.size); });
        for (const ev of ["pause", "ended", "error", "emptied"]) {
          el.addEventListener(ev, () => { if (ev === "ended" && reading(el)) w.__ra.ended += 1; live.delete(el); w.__ra.playing = live.size; });
        }
      }
      return original.apply(this, arguments as any);
    };
  });
  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/index.html`);
  return { page, answered };
}

const player = (page: Page) => page.locator("#stimulus figure.stimulus-kind-source .read-aloud-player");
const toggle = (page: Page) => player(page).locator(".read-aloud-toggle");
const ra = (page: Page) => page.evaluate(() => (window as any).__ra);
const clip = (key: string) => `/tts/v1/${key}.mp3`;

async function done(h: Harness) {
  expect((await ra(h.page)).maxPlaying, "never two readings at the same time").toBeLessThanOrEqual(1);
  await closeOfflineQuiz(h.page);
}

test("the 898-character § 35 source gets 'Læs op', and one tap reads both parts in order", async ({ browser }) => {
  const keys = await partKeys(LONG);
  expect(keys.length, "two ordinary requests").toBe(2);
  expect(canonicalTtsRequest(LONG).ok, "too long for ONE request — the case that had no player").toBe(false);
  const h = await openQuiz(browser, [S3]);
  const { page } = h;
  await expect(page.locator("#question")).toContainText(S3.content.question, { timeout: 20000 });
  await expect(toggle(page)).toBeVisible();
  await expect(toggle(page)).toHaveText("▶ Læs op");
  await expect(page.locator("#stimulus blockquote")).toContainText("Raadigheden over sit Bo");
  await toggle(page).click();
  await expect(player(page)).toHaveAttribute("data-state", "speaking");
  await expect(player(page)).toHaveAttribute("data-state", "idle", { timeout: 20000 });
  expect((await ra(page)).plays, "part 1, then part 2 — no second tap").toEqual(keys.map(clip));
  expect((await ra(page)).ended).toBe(2);
  await done(h);
});

test("a pause between the two parts holds part 2 until 'Fortsæt'", async ({ browser }) => {
  const keys = await partKeys(LONG);
  const part2 = gate();
  const h = await openQuiz(browser, [S3], new Map([[keys[1], part2]]));
  const { page } = h;
  await expect(toggle(page)).toBeVisible({ timeout: 20000 });
  await toggle(page).click();
  await expect.poll(async () => (await ra(page)).ended, { timeout: 15000 }).toBe(1); // part 1 is over, part 2 is held
  await toggle(page).click(); // Ⅱ Pause — in the gap
  await expect(player(page)).toHaveAttribute("data-state", "paused");
  part2.open(); // part 2 arrives while paused
  await expect.poll(() => metaGets.filter((k) => k === keys[1]).length).toBe(1);
  await page.waitForTimeout(500);
  expect((await ra(page)).plays, "part 2 waits for the pupil").toEqual([clip(keys[0])]);
  await toggle(page).click(); // ▶ Fortsæt
  await expect(player(page)).toHaveAttribute("data-state", "idle", { timeout: 20000 });
  expect((await ra(page)).plays).toEqual(keys.map(clip));
  await done(h);
});

test("the next question stops the reading, and a late answer for the old part never starts audio", async ({ browser }) => {
  const keys = await partKeys(LONG);
  const part2 = gate();
  const h = await openQuiz(browser, [S3, S5], new Map([[keys[1], part2]]));
  const { page } = h;
  await expect(toggle(page)).toBeVisible({ timeout: 20000 });
  await toggle(page).click();
  await expect.poll(async () => (await ra(page)).plays.length, { timeout: 15000 }).toBe(1);
  // The pupil answers while the reading runs: S3 is a number task.
  const input = page.locator("#options input");
  await input.fill(String(S3.content.correct));
  await input.press("Enter");
  await expect(page.locator("#question")).toContainText(S5.content.question, { timeout: 20000 });
  part2.open(); // the old part's metadata arrives only now
  await expect.poll(() => metaGets.filter((k) => k === keys[1]).length).toBe(1);
  await page.waitForTimeout(800);
  const after = await ra(page);
  expect(after.playing, "nothing reads after the question changed").toBe(0);
  expect(after.plays, "the old part 2 never played").toEqual([clip(keys[0])]);
  await expect(toggle(page)).toHaveText("▶ Læs op"); // the new question's player is idle
  await done(h);
});

test("a short source is one unchanged request, and a second reading comes from memory", async ({ browser }) => {
  const keys = await partKeys(SHORT);
  const checked = canonicalTtsRequest(SHORT);
  expect(checked.ok).toBe(true);
  expect(keys, "the same clip as before the change").toEqual([await ttsKey((checked as any).value)]);
  const h = await openQuiz(browser, [S5]);
  const { page } = h;
  await expect(toggle(page)).toBeVisible({ timeout: 20000 });
  await toggle(page).click();
  await expect(player(page)).toHaveAttribute("data-state", "idle", { timeout: 20000 });
  await toggle(page).click();
  await expect(player(page)).toHaveAttribute("data-state", "idle", { timeout: 20000 });
  expect((await ra(page)).plays).toEqual([clip(keys[0]), clip(keys[0])]);
  expect(metaGets, "the clip's metadata was fetched once").toEqual([keys[0]]);
  await done(h);
});
