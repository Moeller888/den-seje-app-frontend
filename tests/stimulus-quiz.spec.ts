// Stimulus (F-07) in the REAL quiz — index.html + app.js + js/stimulus.js — offline.
// FULLY FIXTURE-INTERCEPTED like tests/number-answer-ui.spec.ts: a local static server serves this
// checkout, and every *.supabase.co call is answered from fixtures, so no request reaches a real backend
// and no test pupil is touched.
//
// get-next-question serves the example sequence in tools/stimulus/examples/grundloven-1849.json — each
// payload built by the REAL _shared/question-dto.ts toPublicQuestion from the stored row, exactly as the
// Edge Function would — followed by one plain question without a stimulus. process-event plays the server:
// it grades against the stored key and answers { status, correct_answer, review_text }.
//
// Proven here, on desktop, tablet and phone sizes:
//   introduction (image, then audio) → comprehension check (source + number) → independent application
//   (source + multiple choice) works end to end in the quiz's state machine; the image has its alt text,
//   the audio has controls and its transcript behind a keyboard-operable "Vis teksten"; the source text and
//   its credit are shown as text; the next question without a stimulus shows none (cleared); a stimulus
//   that breaks the contract shows the visible error with a way out instead of a question without its
//   material; and no payload the page receives carries a grading field.
import { test, expect, Route, Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { toPublicQuestion } from "../supabase/functions/_shared/question-dto.ts";
import { closeOfflineQuiz } from "./support/close-offline-quiz";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REF = "tjzbehwfagiwpwodsgwg";
const EXAMPLE = JSON.parse(fs.readFileSync(path.join(ROOT, "tools", "stimulus", "examples", "grundloven-1849.json"), "utf8"));
const STEPS: any[] = EXAMPLE.steps;

const MIME: Record<string, string> = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".svg": "image/svg+xml", ".css": "text/css", ".webp": "image/webp",
  ".png": "image/png", ".json": "application/json", ".wav": "audio/wav",
};

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    try {
      const p = decodeURIComponent((req.url || "/").split("?")[0]);
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

// The recording is not in the repository (see audio_note in the example): a 1-second test tone stands in.
function testToneWav(): Buffer {
  const rate = 8000, n = rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000), 44 + i * 2);
  return buf;
}

const UID = "00000000-0000-4000-8000-000000000001";
const IDENTITY = { v: 1, body_type: "neutral", skin_tone: "medium", hairstyle: "tousled", hair_color: "brown", chosen_at: "2026-06-01T00:00:00Z" };
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "n@e.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
function jwt() { const b = (o: any) => Buffer.from(JSON.stringify(o)).toString("base64url"); return b({ alg: "HS256", typ: "JWT" }) + "." + b({ sub: UID, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 2592000 }) + ".s"; }
const SESSION = { access_token: jwt(), token_type: "bearer", expires_in: 2592000, expires_at: Math.floor(Date.now() / 1000) + 2592000, refresh_token: "f", user: USER };
const PROFILE = { id: UID, role: "student", name: "N", email: "n@e.com", equipped_slots: {}, active_title: null, active_theme: null, avatar_gender: "neutral", avatar_identity: IDENTITY, grade: 7, selected_grade: 7, placement_band: 2, current_band: 2, xp: 420, coins: 120 };
const PROGRESS = { student_id: UID, xp: 420, coins: 120, current_streak: 3, longest_streak: 7, correct_answers: 42 };
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS" };
const today = new Date().toISOString().slice(0, 10);

const PLAIN_ROW = { answer_format: "mc", answer_type: "short", content: { question: "Hvilket år blev Grundloven underskrevet?", options: ["1849", "1864", "1660", "1915"], correct: "1849" } };
const GRADING_KEYS = ["correct", "accepted_answers", "review_text", "facit", "tolerance", "criteria"];

type Row = { answer_format: string; answer_type: string; content: any };
type Harness = { page: Page; answers: string[]; payloads: string[] };

function served(row: Row, i: number) {
  const pub = toPublicQuestion(row.content, row.answer_format, null);
  return { step: "question", question_instance_id: `st${i}`, answer_format: row.answer_format, answer_type: row.answer_type, subject: "Historie", ...pub };
}

// rows: what get-next-question serves, in order (the last repeats). raw: send rows[i] as given (to send a
// payload the server would never build — the broken-stimulus case).
async function openQuiz(browser: any, viewport: { width: number; height: number }, rows: Row[], { raw = false, hasTouch = false } = {}): Promise<Harness> {
  const ctx = await browser.newContext({ viewport, hasTouch });
  const answers: string[] = [];
  const payloads: string[] = [];
  let n = 0;
  let current: Row = rows[0];

  await ctx.route("**/assets/stimulus/*.wav", (route: Route) =>
    route.fulfill({ status: 200, headers: { "content-type": "audio/wav" }, body: testToneWav() }));
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
      const body = raw ? { step: "question", question_instance_id: `st${n}`, answer_format: current.answer_format, answer_type: current.answer_type, subject: "Historie", content: current.content, metadata: null } : served(current, n);
      n++;
      payloads.push(JSON.stringify(body));
      return j(body);
    }
    if (p.startsWith("/functions/v1/process-event")) {
      const body = req.postDataJSON() ?? {};
      answers.push(body.answer);
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
    if (p.startsWith("/rest/v1/shop_items")) return j([]);
    return j([]);
  });
  await ctx.addInitScript(([k, s]: [string, any]) => {
    localStorage.setItem(k, JSON.stringify(s));
  }, [`sb-${REF}-auth-token`, SESSION]);

  const page = await ctx.newPage();
  await page.goto(`${baseUrl}/index.html`);
  await expect(page.locator("#question")).not.toHaveText(/Indlæser/, { timeout: 15000 });
  return { page, answers, payloads };
}

const option = (page: Page, text: string) => page.locator("#options button", { hasText: text }).first();
const stimulus = (page: Page) => page.locator("#stimulus");

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "no horizontal scroll").toBeLessThanOrEqual(0);
}

const ROWS: Row[] = [...STEPS.map((s) => s.row), PLAIN_ROW];

const VIEWPORTS = [
  { name: "computer", viewport: { width: 1280, height: 800 }, hasTouch: false },
  { name: "tablet", viewport: { width: 768, height: 1024 }, hasTouch: true },
  { name: "mobil", viewport: { width: 375, height: 667 }, hasTouch: true },
];

for (const v of VIEWPORTS) {
  test(`${v.name}: introduktion → forståelsestjek → selvstændig anvendelse, end to end`, async ({ browser }) => {
    // Five questions in one test, each with the quiz's own transition delay (600 ms after a right answer,
    // the reflection after a wrong one): one flow needs a flow-sized budget. Assertions are unchanged.
    test.slow();
    const { page, answers, payloads } = await openQuiz(browser, v.viewport, ROWS, { hasTouch: v.hasTouch });
    const [s1, s2, s3, s4] = STEPS.map((s) => s.row.content);

    // 1. Introduction — image + multiple choice.
    const fig1 = stimulus(page).locator("figure.stimulus-kind-image");
    await expect(fig1).toBeVisible();
    await expect(fig1.locator(".stimulus-label")).toHaveText("Billede");
    const img = fig1.locator("img.stimulus-image");
    await expect(img).toHaveAttribute("alt", s1.stimulus.alt);
    await expect(page.getByRole("img", { name: s1.stimulus.alt })).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    const box = await img.boundingBox();
    expect(box!.x + box!.width, "the image fits the screen").toBeLessThanOrEqual(v.viewport.width);
    await expect(fig1.locator(".stimulus-caption")).toHaveText(s1.stimulus.caption);
    await expect(fig1.locator("figcaption")).toHaveText("Kilde: Lærlig, egen tegning · 2026");
    await expect(page.locator("#question")).toContainText(s1.question);
    await noOverflow(page);
    await option(page, "Enevælde").click();
    await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");

    // 2. Introduction — audio clip + multiple choice. The transcript opens with the keyboard.
    const fig2 = stimulus(page).locator("figure.stimulus-kind-audio");
    await expect(fig2).toBeVisible({ timeout: 10000 });
    await expect(fig2.locator(".stimulus-label")).toHaveText("Lyt");
    const audio = fig2.locator("audio");
    await expect(audio).toHaveAttribute("controls", "");
    await expect(audio).toHaveAttribute("aria-label", `Lydklip: ${s2.stimulus.title}`);
    await expect(fig2.locator(".stimulus-transcript-text")).toBeHidden();
    await fig2.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(fig2.locator(".stimulus-transcript-text")).toHaveText(s2.stimulus.transcript);
    await expect(fig2.locator(".stimulus-transcript-text")).toBeVisible();
    await noOverflow(page);
    await option(page, "En kvinde på 40 år med egen gård").click();
    await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");

    // 3. Comprehension check — the source + a number answer.
    const fig3 = stimulus(page).locator("figure.stimulus-kind-source");
    await expect(fig3).toBeVisible({ timeout: 10000 });
    await expect(fig3.locator(".stimulus-label")).toHaveText("Kilde");
    await expect(fig3.locator(".stimulus-title")).toHaveText(s3.stimulus.title);
    await expect(fig3.locator("blockquote")).toContainText("Valgret til Folkethinget har enhver uberygtet Mand");
    await expect(fig3.locator("blockquote")).toContainText("b) nyder eller har nydt Understøttelse af Fattigvæsenet");
    await expect(fig3.locator("figcaption")).toContainText("Offentligt domæne");
    // The source's read-aloud player names the source, the question's player the question.
    await expect(fig3.locator("button.read-aloud-toggle")).toHaveAttribute("aria-label", "Læs kilden højt");
    await expect(fig3.locator("button.read-aloud-restart")).toHaveAttribute("aria-label", "Læs kilden forfra");
    await expect(page.locator("#question button.read-aloud-toggle")).toHaveAttribute("aria-label", "Læs spørgsmålet højt");
    await noOverflow(page);
    const input = page.locator("#options input");
    await input.fill("30");
    await input.press("Enter");
    await expect(page.locator("#feedback")).toHaveText("Ja! 🎯");

    // 4. Independent application — the same source, a new case to judge. A wrong answer: the reflection
    //    explains which rule rules each person out.
    await expect(page.locator("#question")).toContainText(s4.question, { timeout: 10000 });
    await expect(stimulus(page).locator("figure.stimulus-kind-source blockquote")).toBeVisible();
    await option(page, "Peder, 40 år").click();
    await expect(page.locator("#review-feedback")).toHaveText(s4.review_text);
    // The source stays on screen while the pupil reads why.
    await expect(stimulus(page).locator("figure.stimulus-kind-source")).toBeVisible();
    await page.locator("#reflection-continue").click();

    // 5. A question without a stimulus: nothing extra is shown.
    await expect(page.locator("#question")).toContainText(PLAIN_ROW.content.question, { timeout: 10000 });
    await expect(stimulus(page)).toBeHidden();
    await expect(stimulus(page)).toBeEmpty();

    expect(answers).toEqual(["Enevælde", "En kvinde på 40 år med egen gård", "30", s4.options[1]]);
    for (const p of payloads) for (const k of GRADING_KEYS) expect(p.includes(`"${k}"`), `payload carries ${k}`).toBe(false);
    await closeOfflineQuiz(page);
  });
}

test("a stimulus that breaks the contract: visible error with a way out, never the question without it", async ({ browser }) => {
  const broken: Row = { answer_format: "mc", answer_type: "short", content: { question: "Se billedet. Hvad viser det?", options: ["A", "B"], stimulus: { kind: "image", file: "https://evil.example/x.svg", alt: "", credit: { source: "x" } } } };
  const { page, answers } = await openQuiz(browser, { width: 900, height: 700 }, [broken], { raw: true });
  await expect(page.locator("#unsupported-format")).toBeVisible();
  await expect(page.locator("#unsupported-format")).toHaveAttribute("role", "alert");
  await expect(page.locator("#go-hub-btn")).toBeVisible();
  await expect(page.locator("#question")).not.toContainText("Se billedet");
  await expect(page.locator("#options button", { hasText: "A" })).toHaveCount(0);
  await expect(stimulus(page)).toBeHidden();
  await expect(page.locator("img[src*='evil.example']")).toHaveCount(0);
  expect(answers).toEqual([]);
  await closeOfflineQuiz(page);
});

test("HTML in a source is shown as text, never run", async ({ browser }) => {
  const row: Row = { answer_format: "mc", answer_type: "short", content: { question: "Hvad står der?", options: ["A", "B"], correct: "A", stimulus: { kind: "source", text: "<img src=x onerror=\"window.__pwned=1\"> <b>fed</b>", credit: { source: "Test" } } } };
  const { page } = await openQuiz(browser, { width: 900, height: 700 }, [row]);
  await expect(stimulus(page).locator("blockquote")).toContainText('<img src=x onerror="window.__pwned=1"> <b>fed</b>');
  await expect(stimulus(page).locator("blockquote img, blockquote b")).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__pwned)).toBeUndefined();
  await closeOfflineQuiz(page);
});
