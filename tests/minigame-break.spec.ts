// D-347 spillepauser — the pupil's journey in a real browser: quiz → offer → "Nej, ellers tak" / "Ja tak"
// → one round of the game → back to the quiz, and every way of getting a game without an offer.
// ---------------------------------------------------------------------------------------------------
// SELF-SERVED, ZERO BACKEND. A local http.Server serves this checkout. The Supabase client module
// (esm.sh) is replaced by FAKE_CLIENT below; every request that would leave localhost is aborted and
// recorded in offHost, which each test asserts empty. The fake client forwards the quiz's two Edge
// Function calls and the four minigame_break_* RPCs to SERVER, a model of the backend that lives in this
// Node process (page.exposeBinding), so its state survives navigation like a real database would.
//
// What SERVER models is the CONTRACT the browser relies on (reply shapes, one open offer, single-use
// pass, idempotent choices). The real SQL — time credit, caps, locking, RLS, randomness — is proven
// against PostgreSQL in tests/unit/minigame-breaks-migration-run.test.mjs. Time is not waited for:
// SERVER credits `creditPerAnswer` seconds per registered answer (400 → the third answer reaches 1,200).
import { test, expect, type Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".wav": "audio/wav", ".json": "application/json",
};

let server: http.Server;
let baseUrl: string;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent((req.url || "/").split("?")[0]);
    try {
      const fp = path.normalize(path.join(ROOT, p));
      if (!fp.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      const data = fs.readFileSync(fp);
      res.writeHead(200, { "content-type": MIME[path.extname(fp).toLowerCase()] || "application/octet-stream" });
      res.end(data);
    } catch {
      res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
      res.end("<h1>404</h1>");
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  baseUrl = `http://localhost:${(server.address() as any).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
});

// ── the backend model ─────────────────────────────────────────────────────────────────────────────

type Offer = { id: string; student: string; game: string; status: string; outcome: string | null };

class Server {
  student = "00000000-0000-4000-8000-0000000000a1";
  creditPerAnswer = 400;
  interval = 1200;
  pool = ["brud"];
  seconds = 0;
  offers: Offer[] = [];
  served = 0;
  answered = new Set<string>();
  credited = new Set<string>();
  calls: { fn: string; args: any }[] = [];
  failRpc = new Set<string>();
  private n = 0;

  uuid(prefix: string) {
    this.n += 1;
    return `${prefix}-0000-4000-8000-${String(this.n).padStart(12, "0")}`;
  }
  open() { return this.offers.find((o) => ["offered", "accepted", "started"].includes(o.status)) ?? null; }
  find(id: string) { return this.offers.find((o) => o.id === id && o.student === this.student) ?? null; }

  handle(fn: string, args: any): any {
    this.calls.push({ fn, args });
    if (this.failRpc.has(fn)) return { error: { message: "simulated failure" } };
    switch (fn) {
      case "get-next-question": {
        this.served += 1;
        const id = this.uuid("11111111");
        return { data: {
          question_instance_id: id, round_no: 1, answer_format: "mc", answer_type: "short", metadata: null,
          wave_phase: "challenge", content: { question: `Spørgsmål ${this.served}: Hvad er Danmarks hovedstad?`, options: ["København", "Aarhus"] },
        } };
      }
      case "process-event": {
        this.answered.add(args.question_instance_id);
        const ok = args.answer === "København";
        return { data: { status: ok ? "correct" : "incorrect", correct_answer: "København", review_text: null, misconception_type: null } };
      }
      case "minigame_break_after_answer": {
        const inst = args.p_question_instance_id;
        if (!this.answered.has(inst)) return { data: { status: "ok", reason: "not_answered", offer: null } };
        const open = this.open();
        if (open && open.status === "offered") return { data: { status: "ok", reason: "offer", offer: { id: open.id, game: open.game } } };
        if (open) { open.status = open.status === "started" ? "finished" : "expired"; }
        if (this.credited.has(inst)) return { data: { status: "ok", reason: "already_counted", offer: null } };
        this.credited.add(inst);
        this.seconds = Math.min(this.interval, this.seconds + this.creditPerAnswer);
        if (this.seconds < this.interval) return { data: { status: "ok", reason: "counted", offer: null } };
        if (this.pool.length === 0) return { data: { status: "ok", reason: "no_games", offer: null } };
        const offer = { id: this.uuid("22222222"), student: this.student, game: this.pool[0], status: "offered", outcome: null };
        this.offers.push(offer);
        this.seconds = 0;
        return { data: { status: "ok", reason: "offer", offer: { id: offer.id, game: offer.game } } };
      }
      case "minigame_break_respond": {
        const o = this.find(args.p_offer_id);
        const want = args.p_accept ? "accepted" : "declined";
        if (!o) return { data: { status: "not_found", offer_status: null, game: null } };
        if (o.status === "offered") { o.status = want; this.seconds = 0; return { data: { status: "ok", offer_status: want, game: o.game } }; }
        return { data: { status: o.status === want ? "ok" : "conflict", offer_status: o.status, game: o.game } };
      }
      case "minigame_break_start": {
        const o = args.p_offer_id ? this.find(args.p_offer_id) : null;
        if (o && o.status === "accepted" && o.game === args.p_game_key) { o.status = "started"; return { data: { status: "ok", reason: "started" } }; }
        const reason = !o ? "not_found" : o.game !== args.p_game_key ? "wrong_game"
          : ["started", "finished"].includes(o.status) ? "already_used" : o.status === "expired" ? "expired" : "not_accepted";
        return { data: { status: "denied", reason } };
      }
      case "minigame_break_finish": {
        const o = this.find(args.p_offer_id);
        if (!o) return { data: { status: "not_found", offer_status: null } };
        if (o.status === "started") { o.status = "finished"; o.outcome = args.p_outcome; }
        return { data: { status: "ok", offer_status: o.status } };
      }
      default:
        return { data: null };
    }
  }
}

// ── the fake Supabase client (replaces https://esm.sh/@supabase/supabase-js@2) ────────────────────

const FAKE_CLIENT = String.raw`
const srv = (fn, args) => window.__srv(fn, JSON.parse(JSON.stringify(args ?? {})));
const PROFILE = { role: "student", avatar_identity: { chosen_at: "2026-01-01" }, selected_grade: 7,
  placement_band: 2, current_band: 2, active_domains: null, equipped_slots: {} };
function builder(table) {
  const chain = {};
  for (const op of ["select", "eq", "neq", "in", "is", "not", "gte", "lte", "gt", "lt", "order", "limit", "update", "insert", "upsert", "range", "match", "or", "filter"]) {
    chain[op] = () => chain;
  }
  const one = () => table === "profiles" ? { ...PROFILE } : table === "student_progress" ? { xp: 0, coins: 0 } : null;
  chain.maybeSingle = async () => ({ data: one(), error: null });
  chain.single = chain.maybeSingle;
  chain.then = (res, rej) => Promise.resolve({ data: [], error: null, count: 0 }).then(res, rej);
  return chain;
}
export function createClient() {
  const session = { user: { id: window.__STUDENT }, access_token: "fake" };
  return {
    auth: {
      getSession: async () => ({ data: { session }, error: null }),
      getUser: async () => ({ data: { user: session.user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }),
    },
    from: (table) => builder(table),
    rpc: async (fn, args) => {
      // Every RPC reaches SERVER, so a spec can prove which ones a page made (e.g. no reward call).
      const r = await srv(fn, args);
      return r.error ? { data: null, error: r.error } : { data: r.data, error: null };
    },
    functions: {
      invoke: async (name, opts) => {
        if (name !== "get-next-question" && name !== "process-event") return { data: null, error: { message: "unknown function" } };
        const r = await srv(name, opts?.body);
        return r.error ? { data: null, error: r.error } : { data: r.data, error: null };
      },
    },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: "" } }) }) },
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
  };
}
`;

async function setup(page: Page, srv: Server) {
  const offHost: string[] = [];
  const errors: string[] = [];
  await page.exposeBinding("__srv", (_src, fn: string, args: any) => srv.handle(fn, args));
  await page.addInitScript((id) => { (window as any).__STUDENT = id; }, srv.student);
  await page.route("**/*", async (route) => {
    const u = route.request().url();
    if (u.startsWith(baseUrl) || u.startsWith("data:") || u.startsWith("blob:")) return route.continue();
    if (u.startsWith("https://esm.sh/@supabase/supabase-js")) {
      return route.fulfill({ status: 200, headers: { "content-type": "text/javascript; charset=utf-8" }, body: FAKE_CLIENT });
    }
    offHost.push(u);
    return route.abort();
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  return { offHost, errors };
}

// Answers the question on screen and waits until the quiz has moved on (or the dialog is up).
async function answer(page: Page, srv: Server, text = "København") {
  await expect(page.locator("#question")).toHaveAttribute("data-state", "ready", { timeout: 15000 });
  const before = srv.calls.filter((c) => c.fn === "process-event").length;
  await page.getByRole("button", { name: text, exact: true }).click();
  await expect.poll(() => srv.calls.filter((c) => c.fn === "process-event").length).toBe(before + 1);
  await expect.poll(() => srv.calls.filter((c) => c.fn === "minigame_break_after_answer").length).toBe(before + 1);
}

const dialog = (page: Page) => page.locator("dialog#minigame-break-dialog");
// External requests the offline run tolerates being refused: none.
const blocked = (offHost: string[]) => offHost.filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u));

// ── Forløb 1: eleven afslår ─────────────────────────────────────────────────────────────────────────

test("forløb 1: no offer before 20 minutes; at 20 the next answer offers one game; 'Nej, ellers tak' continues the quiz", async ({ page }) => {
  // A whole journey: several real quiz rounds with the app’s own feedback delays (0.6–2 s each) plus, as the
  // first test of a browser project, the cold start. Measured 2026-11-04: 19 s warm, > 30 s cold in Firefox
  // and WebKit. Not a wait for the app: every step still has its own assertion and timeout.
  test.setTimeout(60_000);
  const srv = new Server();
  const { offHost, errors } = await setup(page, srv);
  await page.goto(baseUrl + "/index.html");

  await answer(page, srv);                                   // 400 s
  await expect(page.locator("#question")).toContainText("Spørgsmål 2", { timeout: 10000 });
  await expect(dialog(page)).toHaveCount(0);
  await answer(page, srv, "Aarhus");                         // 800 s — a wrong answer counts the same
  await expect(page.locator("#question")).toContainText("Spørgsmål 3", { timeout: 10000 });
  await expect(dialog(page)).toHaveCount(0);

  await answer(page, srv);                                   // 1200 s → offer
  await expect(dialog(page)).toBeVisible();
  const servedBefore = srv.served;
  await expect(dialog(page).getByRole("heading")).toHaveText("Har du lyst til et spil Brud?");
  await expect(dialog(page)).toContainText("Du har arbejdet godt! Har du lyst til en lille spillepause?");
  // Exactly two answers. Any other control in the dialog belongs to the shared read-aloud player.
  await expect(dialog(page).locator(".minigame-break-actions button")).toHaveText(["Ja tak", "Nej, ellers tak"]);
  const others = dialog(page).locator("button:not(.minigame-break-actions button)");
  for (let i = 0; i < await others.count(); i++) {
    expect(await others.nth(i).evaluate((b) => !!b.closest(".read-aloud-player"))).toBe(true);
  }
  await expect(page.getByRole("button", { name: "Ja tak" })).toBeFocused();
  // No question is loaded behind the dialog, and Escape is not a third answer.
  await page.waitForTimeout(300);
  expect(srv.served).toBe(servedBefore);
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toBeVisible();

  // Keyboard: Tab to the second button, Enter.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Nej, ellers tak" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog(page)).toHaveCount(0);
  await expect(page.locator("#question")).toContainText("Spørgsmål 4", { timeout: 10000 });
  expect(srv.offers.map((o) => o.status)).toEqual(["declined"]);
  expect(srv.calls.filter((c) => c.fn === "minigame_break_respond").map((c) => c.args.p_accept)).toEqual([false]);
  expect(srv.seconds).toBe(0);

  // A new period: the next answers give no offer until 1,200 seconds again.
  await answer(page, srv);
  await expect(page.locator("#question")).toContainText("Spørgsmål 5", { timeout: 10000 });
  await expect(dialog(page)).toHaveCount(0);
  expect(srv.offers).toHaveLength(1);

  expect(blocked(offHost)).toEqual([]);
  expect(errors).toEqual([]);
});

// ── Forløb 2: eleven accepterer ─────────────────────────────────────────────────────────────────────

test("forløb 2: 'Ja tak' opens the offered game for exactly one round, then back to the quiz", async ({ page }) => {
  // A whole journey: several real quiz rounds with the app’s own feedback delays (0.6–2 s each) plus, as the
  // first test of a browser project, the cold start. Measured 2026-11-04: 19 s warm, > 30 s cold in Firefox
  // and WebKit. Not a wait for the app: every step still has its own assertion and timeout.
  test.setTimeout(60_000);
  const srv = new Server();
  srv.pool = ["kloeft"];
  srv.seconds = 800;
  const { offHost, errors } = await setup(page, srv);
  await page.goto(baseUrl + "/index.html?fag=dansk");

  await answer(page, srv);
  await expect(dialog(page).getByRole("heading")).toHaveText("Har du lyst til et spil Kløft?");
  // A double click sends one choice.
  await page.getByRole("button", { name: "Ja tak" }).dblclick();
  await page.waitForURL(/\/kloeft\.html$/);                  // the spent pass has left the address bar
  expect(srv.calls.filter((c) => c.fn === "minigame_break_respond")).toHaveLength(1);
  expect(srv.offers[0].status).toBe("started");

  await expect(page.locator("#kloeft-start")).toBeEnabled();
  await expect(page.locator("#kloeft-again")).toBeHidden();
  await expect(page.locator(".kloeft-back").first()).toHaveText("← Quizzen");
  await page.locator("#kloeft-start").click();
  // Nobody taps: the shard falls past the cleft and the round ends by the game's own rules.
  await expect(page.locator("#kloeft-over")).toBeVisible({ timeout: 20000 });
  const back = page.locator("#minigame-pass-return");
  await expect(back).toHaveText("Tilbage til quizzen");
  await expect(back).toBeFocused();
  await expect(page.locator("#kloeft-again")).toBeHidden();
  await back.click();

  await page.waitForURL(/\/index\.html\?fag=dansk$/);
  await expect(page.locator("#question")).toHaveAttribute("data-state", "ready", { timeout: 15000 });
  expect(srv.offers[0]).toMatchObject({ status: "finished", outcome: "completed" });
  // Learning goes on, in the same subject, with the next question.
  const gnq = srv.calls.filter((c) => c.fn === "get-next-question");
  expect(gnq[gnq.length - 1].args.subject).toBe("dansk");
  await answer(page, srv);
  await expect(dialog(page)).toHaveCount(0);

  expect(blocked(offHost)).toEqual([]);
  expect(errors).toEqual([]);
});

test("a Stabel break plays one full round and pays nothing: no reward RPC, no coin text (D-347)", async ({ page }) => {
  const srv = new Server();
  srv.pool = ["stabel"];
  srv.seconds = 800;
  const { offHost, errors } = await setup(page, srv);
  await page.goto(baseUrl + "/index.html");
  await answer(page, srv);
  await expect(dialog(page).getByRole("heading")).toHaveText("Har du lyst til et spil Stabel?");
  await page.getByRole("button", { name: "Ja tak" }).click();
  await page.waitForURL(/\/stabel\.html$/);
  await expect(page.locator("#stabel-start")).toBeEnabled();
  const onStabel = srv.calls.length;                         // every call from here on is the game page's
  await expect(page.locator("#stabel-lead")).toContainText("Stabel giver ingen mønter.");
  await page.locator("#stabel-start").click();
  // Drop plates as fast as the game allows until one misses and the round ends by its own rules.
  const over = page.locator("#stabel-over");
  for (let i = 0; i < 200 && !(await over.isVisible()); i++) {
    await page.locator("#stabel-drop").click({ force: true }).catch(() => {});
    await page.waitForTimeout(90);
  }
  await expect(over).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#stabel-coins")).toHaveCount(0);
  await expect(over).not.toContainText(/mønt/i);
  await expect(page.locator("#stabel-again")).toBeHidden();
  await page.waitForTimeout(500);                           // a late reward call would land here
  expect(srv.calls.slice(onStabel).map((c) => c.fn)).toEqual([]);   // the round itself calls nothing at all
  await page.locator("#minigame-pass-return").click();
  await page.waitForURL(/\/index\.html$/);
  expect(srv.calls[onStabel]?.fn).toBe("minigame_break_finish");    // leaving reports the break, nothing else
  expect(srv.calls.some((c) => c.fn === "claim_stabel_reward")).toBe(false);
  expect(srv.offers[0]).toMatchObject({ status: "finished", outcome: "completed" });
  expect(blocked(offHost)).toEqual([]);
  expect(errors).toEqual([]);
});

test("the back button from a game lands on a working quiz, and the pass cannot be used again", async ({ page }) => {
  const srv = new Server();
  srv.pool = ["husk"];
  srv.seconds = 800;
  const { errors } = await setup(page, srv);
  await page.goto(baseUrl + "/index.html");
  await answer(page, srv);
  await page.getByRole("button", { name: "Ja tak" }).click();
  await page.waitForURL(/\/husk\.html$/);
  const offerId = srv.offers[0].id;

  await page.goBack();
  await expect(page.locator("#question")).toHaveAttribute("data-state", "ready", { timeout: 15000 });
  await expect(dialog(page)).toHaveCount(0);

  // The same invitation again, typed or from history: refused by the server, page locked.
  await page.goto(baseUrl + "/husk.html?pause=" + offerId);
  await expect(page.locator("#minigame-locked")).toBeVisible();
  await expect(page.locator("#husk-start")).toHaveCount(0);
  await expect(page.locator("#minigame-locked-quiz")).toHaveAttribute("href", "index.html");
  expect(srv.calls.filter((c) => c.fn === "minigame_break_start").map((c) => c.args.p_offer_id)).toEqual([offerId, offerId]);
  expect(errors).toEqual([]);
});

// ── Forløb 3: eleven forsøger at omgå systemet ──────────────────────────────────────────────────────

for (const game of ["stabel", "husk", "naal", "kloeft", "hop", "brud", "slope"]) {
  test(`direct address ${game}.html without a pass shows the lock, never the game`, async ({ page }) => {
    const srv = new Server();
    const { offHost, errors } = await setup(page, srv);
    await page.goto(`${baseUrl}/${game}.html`);
    await expect(page.locator("#minigame-locked")).toBeVisible();
    await expect(page.locator("#minigame-locked")).toContainText("Minispil kan kun spilles som en spillepause i quizzen.");
    await expect(page.locator(`#${game}-start`)).toHaveCount(0);
    await expect(page.locator("canvas, button")).toHaveCount(0);
    expect(srv.calls.filter((c) => c.fn === "minigame_break_start")).toEqual([]);   // no pass: not even asked
    expect(blocked(offHost)).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test("a forged, foreign, unaccepted or wrong-game pass is refused by the server, and the page stays locked", async ({ page }) => {
  const srv = new Server();
  srv.offers.push({ id: "33333333-0000-4000-8000-000000000001", student: "someone-else", game: "brud", status: "accepted", outcome: null });
  srv.offers.push({ id: "33333333-0000-4000-8000-000000000002", student: srv.student, game: "brud", status: "offered", outcome: null });
  srv.offers.push({ id: "33333333-0000-4000-8000-000000000003", student: srv.student, game: "hop", status: "accepted", outcome: null });
  const { errors } = await setup(page, srv);
  for (const id of ["33333333-0000-4000-8000-000000000001", "33333333-0000-4000-8000-000000000002",
    "33333333-0000-4000-8000-000000000003", "33333333-0000-4000-8000-0000000000ff"]) {
    await page.goto(`${baseUrl}/brud.html?pause=${id}`);
    await expect(page.locator("#minigame-locked")).toBeVisible();
    await expect(page.locator("#brud-start")).toHaveCount(0);
  }
  // Manipulated local state changes nothing: the pass is checked on the server only.
  await page.evaluate(() => { localStorage.setItem("minigame_pass", "yes"); sessionStorage.setItem("pause", "1"); });
  await page.goto(`${baseUrl}/brud.html`);
  await expect(page.locator("#minigame-locked")).toBeVisible();
  expect(srv.offers.map((o) => o.status)).toEqual(["accepted", "offered", "accepted"]);
  expect(errors).toEqual([]);
});

test("reloading a game page after the round started gives no second round", async ({ page }) => {
  const srv = new Server();
  srv.offers.push({ id: "44444444-0000-4000-8000-000000000001", student: srv.student, game: "naal", status: "accepted", outcome: null });
  const { errors } = await setup(page, srv);
  await page.goto(`${baseUrl}/naal.html?pause=44444444-0000-4000-8000-000000000001`);
  await expect(page.locator("#naal-start")).toBeEnabled();
  // The reload (the address no longer carries the pass) …
  await page.reload();
  await expect(page.locator("#minigame-locked")).toBeVisible();
  // … and the old link with the pass.
  await page.goto(`${baseUrl}/naal.html?pause=44444444-0000-4000-8000-000000000001`);
  await expect(page.locator("#minigame-locked")).toBeVisible();
  expect(srv.offers[0].status).toBe("started");
  expect(errors).toEqual([]);
});

test("reloading the quiz while an offer waits shows the SAME offer after the next answer — never a second one", async ({ page }) => {
  const srv = new Server();
  srv.seconds = 800;
  const { errors } = await setup(page, srv);
  await page.goto(baseUrl + "/index.html");
  await answer(page, srv);
  await expect(dialog(page)).toBeVisible();
  await page.reload();
  await expect(page.locator("#question")).toHaveAttribute("data-state", "ready", { timeout: 15000 });
  await expect(dialog(page)).toHaveCount(0);       // only after an answer
  await answer(page, srv);
  await expect(dialog(page)).toBeVisible();
  expect(srv.offers).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("the menu has no game cards any more; the subjects are all still there", async ({ page }) => {
  const srv = new Server();
  await setup(page, srv);
  await page.goto(baseUrl + "/spil.html?fane=minigames");
  await expect(page.locator(".spil-card")).toHaveCount(3);
  await expect(page.locator(".spil-name")).toHaveText(["Historie", "Engelsk", "Dansk"]);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.locator("#spil-break-note")).toContainText("spillepause");
});

// ── fejl må aldrig stoppe quizzen ───────────────────────────────────────────────────────────────────

test("a failing break service never blocks the quiz; a failed 'Ja tak' says so and continues", async ({ page }) => {
  const srv = new Server();
  srv.failRpc.add("minigame_break_after_answer");
  srv.seconds = 800;
  const { errors } = await setup(page, srv);
  await page.goto(baseUrl + "/index.html");
  await answer(page, srv);
  await expect(page.locator("#question")).toContainText("Spørgsmål 2", { timeout: 10000 });
  await expect(dialog(page)).toHaveCount(0);

  srv.failRpc.delete("minigame_break_after_answer");
  srv.failRpc.add("minigame_break_respond");
  await answer(page, srv);
  await expect(dialog(page)).toBeVisible();
  await page.getByRole("button", { name: "Ja tak" }).click();
  await expect(page.getByText("Spillepausen kunne ikke startes lige nu. Vi fortsætter med quizzen.")).toBeVisible();
  await expect(page.locator("#question")).toContainText("Spørgsmål 3", { timeout: 10000 });
  expect(page.url()).toContain("/index.html");
  expect(errors).toEqual([]);
});

test("an empty game pool gives no dialog at all", async ({ page }) => {
  const srv = new Server();
  srv.pool = [];
  srv.seconds = 1100;
  const { errors } = await setup(page, srv);
  await page.goto(baseUrl + "/index.html");
  await answer(page, srv);
  await expect(page.locator("#question")).toContainText("Spørgsmål 2", { timeout: 10000 });
  await expect(dialog(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
