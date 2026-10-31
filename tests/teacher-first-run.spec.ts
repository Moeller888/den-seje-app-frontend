// teacher.html — "ny lærer → første elev i gang" (tranche 1), plus the forced first-login reset.
// ---------------------------------------------------------------------------------------------
// SELF-SERVED, ZERO BACKEND. A local http.Server serves this branch's files; the CDN's Supabase
// client is replaced by tests/support/fake-supabase.ts and every *.supabase.co request is aborted.
// A guard FAILS a test if any request leaves localhost. Nothing here can reach or clean up the
// production project, so it runs under playwright.teacher-local.config.ts with no globalSetup.
//
// What the server enforces (teacher ownership, RLS, review-answer ownership, create-student's role
// check and its must_reset_password write) is NOT provable from a browser fake. The create-student
// contract is covered by tests/unit/create-student-handler.test.mjs; the RLS/RPC boundaries by the
// existing *-read-scope / ownership unit tests and the live teacher-dashboard spec.
import { test, expect, type Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { FAKE_SUPABASE_MODULE, TEACHER_ID, THREE_STUDENTS, student } from "./support/fake-supabase.js";

// Throwaway values for a fake backend, derived per run — never written into the source
// (tests/unit/credential-hygiene.test.mjs).
const TEMP_PW = "T" + randomUUID().slice(0, 11);
const OWN_PW = "E" + randomUUID().slice(0, 11);
const SHORT_PW = randomUUID().slice(0, 5);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
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

type Fake = Record<string, unknown>;

// Everything the fake recorded, across navigations, per page.
const reported = new WeakMap<Page, any[]>();

async function open(page: Page, file: string, fake: Fake) {
  const offHost: string[] = [];
  const errors: string[] = [];

  if (!reported.has(page)) {
    reported.set(page, []);
    await page.exposeBinding("__fakeReport", (_src, entry) => { reported.get(page)!.push(entry); });
  }

  await page.addInitScript((f) => { (window as any).__FAKE = { log: [], ...f }; }, fake);
  await page.route("**/cdn.jsdelivr.net/**", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/javascript; charset=utf-8" }, body: FAKE_SUPABASE_MODULE }));
  await page.route("**/*.supabase.co/**", (route) => route.abort());

  page.on("request", (r) => {
    const u = r.url();
    if (u.startsWith(baseUrl) || u.startsWith("data:") || u.startsWith("about:")) return;
    if (u.includes("cdn.jsdelivr.net")) return;
    offHost.push(u);
  });
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(baseUrl + file, { waitUntil: "load" });
  return { offHost, errors };
}

const TEACHER = { session: { user: { id: TEACHER_ID } }, profile: { role: "teacher" } };

async function openTeacher(page: Page, fake: Fake = {}) {
  const r = await open(page, "/teacher.html", { ...TEACHER, ...fake });
  await expect(page.locator("body")).toHaveAttribute("data-teacher-state", /^(empty|students|error)$/);
  return r;
}

async function fakeLog(page: Page): Promise<any[]> {
  return reported.get(page) ?? [];
}

// ── 1. first run ─────────────────────────────────────────────────────────────────────────────

test("1. a new teacher with 0 pupils sees the first-run guide, and nothing else competes", async ({ page }) => {
  const { offHost, errors } = await openTeacher(page, { students: [] });

  const fr = page.locator("#firstRun");
  await expect(fr).toBeVisible();
  await expect(fr.getByRole("heading", { level: 2 })).toHaveText("Kom i gang med din første elev");

  await expect(fr.locator("ol > li > strong")).toHaveText([
    "Opret din første elev",
    "Giv eleven login",
    "Eleven vælger klassetrin og finder sit niveau",
    "Følg elevens arbejde her",
  ]);

  await expect(page.getByRole("button", { name: "Opret første elev" })).toBeVisible();
  await expect(page.locator("#createBox")).toBeVisible();

  // The dashboard panels are not shown to a teacher who has nobody to follow yet.
  for (const sel of ["#reviewBox", "#studentsBox", "#classOverview", "#engagement-summary", "#domainStudentSelect", "#spotlightStudentSelect"]) {
    await expect(page.locator(sel), sel).toBeHidden();
  }
  await expect(page.locator("#pageLoading")).toBeHidden();

  expect(offHost).toEqual([]);
  expect(errors).toEqual([]);
});

test("1b. 'Opret første elev' leads straight to the existing create form (no modal)", async ({ page }) => {
  await openTeacher(page, { students: [] });
  await page.getByRole("button", { name: "Opret første elev" }).click();
  await expect(page.locator("#studentEmail")).toBeFocused();
  await expect(page.locator("[role=dialog], dialog")).toHaveCount(0);
});

// ── 2. teacher with pupils ───────────────────────────────────────────────────────────────────

test("2. a teacher with pupils does not see the first-run guide, and sees the dashboard in order", async ({ page }) => {
  const { errors } = await openTeacher(page, { students: THREE_STUDENTS });
  await expect(page.locator("#firstRun")).toBeHidden();

  // Attention first, then overview, then pupil administration.
  await expect(page.locator(".group-title")).toHaveText(["Kræver din opmærksomhed", "Overblik", "Elever"]);
  for (const sel of ["#reviewBox", "#engagement-summary", "#classOverview", "#studentsBox", "#createBox", "#domainStudentSelect", "#spotlightStudentSelect"]) {
    await expect(page.locator(sel), sel).toBeVisible();
  }
  // The existing class-overview contract the live spec relies on is unchanged.
  await expect(page.locator('#classOverview button.go-student-btn[data-id="s-anna"]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("2b. a roster LOAD ERROR is never shown as 'no pupils'", async ({ page }) => {
  await openTeacher(page, { rosterError: "boom" });
  await expect(page.locator("#firstRun")).toBeHidden();
  await expect(page.locator("#studentList")).toContainText("Dine elever kunne ikke indlæses");
});

// ── 3. "Dine elever" ─────────────────────────────────────────────────────────────────────────

test("3. 'Dine elever' lists EVERY pupil — also those with no pending answers", async ({ page }) => {
  // Only anna has a pending long answer; bo and cy have none at all.
  await openTeacher(page, {
    students: THREE_STUDENTS,
    instances: [{ student_id: "s-anna", created_at: "2026-10-01T08:00:00Z", user_answer: "Fordi …", teacher_score: null, question_id: "q-long" }],
    longQuestionIds: ["q-long"],
  });

  const rows = page.locator("#studentRows > li");
  await expect(rows).toHaveCount(3);
  await expect(rows.locator(".row-name")).toHaveText(["anna.h", "bo.k", "cy.l"]);

  await expect(rows.nth(0).locator(".row-grade")).toHaveText("7. klasse");
  await expect(rows.nth(0).locator(".row-level")).toHaveText("Niveau: band 3");
  await expect(rows.nth(1).locator(".row-grade")).toHaveText("8. klasse");
  await expect(rows.nth(1).locator(".row-level")).toHaveText("Niveau ikke fundet endnu");
  await expect(rows.nth(2).locator(".row-grade")).toHaveText("Klassetrin ikke valgt endnu");

  await expect(rows.getByRole("button", { name: /^Vis elev/ })).toHaveCount(3);

  // "Vis elev" opens that pupil's detail page.
  await page.route("**/student-detail.html*", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>detail</p>" }));
  await rows.nth(1).getByRole("button", { name: /^Vis elev/ }).click();
  await expect(page).toHaveURL(/student-detail\.html\?id=s-bo$/);
});

test("3b. pupil names are rendered as text, never as markup", async ({ page }) => {
  await openTeacher(page, { students: [student({ student_id: "s-evil", display_name: "<img src=x onerror=alert(1)>" })] });
  await expect(page.locator("#studentRows .row-name")).toHaveText("<img src=x onerror=alert(1)>");
  await expect(page.locator("#studentRows img")).toHaveCount(0);
});

// ── 4/5. "Svar til vurdering" ────────────────────────────────────────────────────────────────

test("4. 'Svar til vurdering' shows only pending LONG answers: who, how many, oldest, action", async ({ page }) => {
  await openTeacher(page, {
    students: THREE_STUDENTS,
    longQuestionIds: ["q-long-1", "q-long-2"],
    instances: [
      { student_id: "s-bo",   created_at: "2026-10-03T09:00:00Z", user_answer: "Svar 1", teacher_score: null, question_id: "q-long-1" },
      { student_id: "s-bo",   created_at: "2026-10-02T09:00:00Z", user_answer: "Svar 2", teacher_score: null, question_id: "q-long-2" },
      { student_id: "s-anna", created_at: "2026-10-04T09:00:00Z", user_answer: "Svar 3", teacher_score: null, question_id: "q-long-1" },
      // Not for the teacher: short (auto-graded), already scored, and an empty answer.
      { student_id: "s-cy",   created_at: "2026-09-01T09:00:00Z", user_answer: "kort", teacher_score: null, question_id: "q-short" },
      { student_id: "s-cy",   created_at: "2026-09-01T09:00:00Z", user_answer: "lang", teacher_score: 3, question_id: "q-long-1" },
      { student_id: "s-cy",   created_at: "2026-09-01T09:00:00Z", user_answer: "   ", teacher_score: null, question_id: "q-long-1" },
    ],
  });

  const rows = page.locator("#reviewRows > li");
  await expect(rows).toHaveCount(2);
  // Oldest waiting first: bo (2 Oct) before anna (4 Oct).
  await expect(rows.locator(".row-name")).toHaveText(["bo.k", "anna.h"]);
  await expect(rows.nth(0).locator(".count-chip")).toHaveText("2");
  await expect(rows.nth(0).locator(".review-count")).toHaveText("2 svar venter");
  await expect(rows.nth(0).locator(".review-oldest")).toContainText("Ældste:");
  await expect(rows.nth(0).locator(".review-oldest")).toContainText("2. okt");
  await expect(rows.nth(1).locator(".count-chip")).toHaveText("1");

  await page.route("**/student-detail.html*", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>detail</p>" }));
  await rows.nth(0).getByRole("button", { name: /Vurder svar/ }).click();
  await expect(page).toHaveURL(/student-detail\.html\?id=s-bo$/);
});

test("4b. the review queue only asks about THIS teacher's pupils", async ({ page }) => {
  await openTeacher(page, { students: THREE_STUDENTS, instances: [] });
  await expect(page.locator("#reviewQueue")).toContainText("Ingen svar venter på vurdering.");
  const log = await fakeLog(page);
  const own = log.find((e) => e.table === "profiles" && e.mode === "many");
  expect(own.ops).toContainEqual({ op: "eq", args: ["teacher_id", TEACHER_ID] });
  const q = log.find((e) => e.table === "question_instances" && e.ops.some((o: any) => o.op === "is"));
  const inOp = q.ops.find((o: any) => o.op === "in");
  expect(inOp.args).toEqual(["student_id", ["s-anna", "s-bo", "s-cy"]]);
});

test("5. with nothing waiting, the queue says so — and the pupil list is still complete", async ({ page }) => {
  await openTeacher(page, { students: THREE_STUDENTS, instances: [] });
  await expect(page.locator("#reviewQueue")).toHaveText("Ingen svar venter på vurdering.");
  await expect(page.locator("#reviewRows")).toHaveCount(0);
  await expect(page.locator("#studentRows > li")).toHaveCount(3);
});

// ── 6. creating a pupil ──────────────────────────────────────────────────────────────────────

test("6. creating the first pupil: concrete next steps, list updated, first run gone", async ({ page }) => {
  await openTeacher(page, { students: [] });

  await page.locator("#studentEmail").fill("maja@skole.dk");
  await page.locator("#studentPassword").fill(TEMP_PW);
  await page.getByRole("button", { name: "Opret elev" }).click();

  const ok = page.locator("#createSuccess");
  await expect(ok).toBeVisible();
  await expect(ok.locator("strong")).toHaveText("Eleven er oprettet.");
  await expect(ok).toContainText("Giv eleven emailen maja@skole.dk og den midlertidige adgangskode, du lige har valgt.");
  await expect(ok).toContainText("Ved første login vælger eleven sin egen adgangskode.");
  await expect(ok).toContainText("vælger eleven klassetrin");
  // The password is never echoed back.
  await expect(ok).not.toContainText(TEMP_PW);

  await expect(page.locator("#firstRun")).toBeHidden();
  await expect(page.locator("#studentRows > li .row-name")).toHaveText(["maja"]);
  await expect(page.locator("#studentEmail")).toHaveValue("");
  await expect(page.locator("#studentPassword")).toHaveValue("");

  const log = await fakeLog(page);
  const call = log.find((e) => e.invoke === "create-student");
  expect(call.body).toEqual({ email: "maja@skole.dk", password: TEMP_PW });
});

test("6b. creating a pupil when others exist adds them to the list", async ({ page }) => {
  await openTeacher(page, { students: THREE_STUDENTS.slice(0, 1) });
  await expect(page.locator("#studentRows > li")).toHaveCount(1);
  await page.locator("#studentEmail").fill("ny.elev@skole.dk");
  await page.locator("#studentPassword").fill(TEMP_PW);
  await page.getByRole("button", { name: "Opret elev" }).click();
  await expect(page.locator("#studentRows > li")).toHaveCount(2);
  await expect(page.locator("#studentRows .row-name")).toContainText(["anna.h", "ny.elev"]);
});

for (const [code, status, text] of [
  ["create_failed", 400, "Eleven kunne ikke oprettes. Tjek emailen – den kan allerede være i brug."],
  ["profile_failed", 500, "Eleven blev ikke oprettet. Prøv igen om lidt."],
  ["profile_failed_rollback_failed", 500, "Skriv til kontakt@lærlig.dk"],
] as const) {
  test(`6c. create-student '${code}' is shown in plain Danish, and nothing pretends to succeed`, async ({ page }) => {
    await openTeacher(page, { students: [], createResponse: { status, code } });
    await page.locator("#studentEmail").fill("maja@skole.dk");
    await page.locator("#studentPassword").fill(TEMP_PW);
    await page.getByRole("button", { name: "Opret elev" }).click();
    await expect(page.locator("#createMessage .create-error")).toContainText(text);
    await expect(page.locator("#createSuccess")).toHaveCount(0);
    await expect(page.locator("#firstRun")).toBeVisible();
    await expect(page.getByRole("button", { name: "Opret elev" })).toBeEnabled();
  });
}

test("6d. client-side validation stops before the server is called", async ({ page }) => {
  await openTeacher(page, { students: [] });
  await page.locator("#studentEmail").fill("maja@skole.dk");
  await page.locator("#studentPassword").fill(SHORT_PW);
  await page.getByRole("button", { name: "Opret elev" }).click();
  await expect(page.locator("#createMessage")).toContainText("mindst 6 tegn");
  expect((await fakeLog(page)).some((e) => e.invoke)).toBe(false);
});

// ── 7/8. first pupil login → existing forced reset flow ──────────────────────────────────────

// The flag itself is cleared by the trigger on auth.users when the password really changes
// (20261010102416, proven live and in profiles-self-update-columns-migration-run). The browser no
// longer writes profiles at all here (2-0A.1): it changes the password, signs a forced pupil out
// and goes to login.
const profilesWrites = (log: any[]) =>
  log.filter((e) => e.table === "profiles" && e.ops.some((o: any) => ["update", "upsert", "insert"].includes(o.op)));

test("7/8. a flagged pupil is sent from login to the forced reset; the page changes the password, signs out and goes to login — no profiles write", async ({ page }) => {
  await page.route("**/login.html", async (r) => {
    // Only the redirect AFTER the reset is stubbed; the first visit serves the real login page.
    if (new URL(page.url()).pathname.endsWith("/reset-password.html")) {
      return r.fulfill({ status: 200, contentType: "text/html", body: "<p>login</p>" });
    }
    return r.continue();
  });
  await open(page, "/login.html", {
    session: null,
    profile: { role: "student", must_reset_password: true },
  });
  await page.locator("#email").fill("maja@skole.dk");
  await page.locator("#password").fill(TEMP_PW);
  await page.locator("#loginBtn").click();
  await expect(page).toHaveURL(/\/reset-password\.html\?forced=1$/);

  // reset-password.html is a fresh document, so the fake is re-installed with a signed-in pupil.
  await expect(page.locator("#form-section")).toBeVisible();
  await page.locator("#new-password").fill(OWN_PW);
  await page.locator("#confirm-password").fill(OWN_PW);
  await page.locator("#resetSubmitBtn").click();
  await expect(page.locator("#reset-message")).toContainText("Adgangskode opdateret");
  await expect(page).toHaveURL(/\/login\.html$/);

  const log = await fakeLog(page);
  const update = log.findIndex((e) => e.auth === "updateUser" && e.hasPassword);
  const signOut = log.findIndex((e) => e.auth === "signOut");
  expect(update).toBeGreaterThanOrEqual(0);
  expect(signOut).toBeGreaterThan(update);
  expect(profilesWrites(log)).toEqual([]);
  // login.js still READS the flag (select); every profiles call in the whole flow is a read.
  const profilesCalls = log.filter((e) => e.table === "profiles");
  expect(profilesCalls.length).toBeGreaterThan(0);
  for (const e of profilesCalls) expect(e.ops.map((o: any) => o.op)).not.toContain("update");
});

test("7b. a failed password change stops the forced flow: error shown, no sign-out, no profiles write, no redirect", async ({ page }) => {
  await open(page, "/reset-password.html?forced=1", {
    session: { user: { id: "student-1" } },
    updateUserError: "Password should be different from the old password.",
  });
  await expect(page.locator("#form-section")).toBeVisible();
  await page.locator("#new-password").fill(OWN_PW);
  await page.locator("#confirm-password").fill(OWN_PW);
  await page.locator("#resetSubmitBtn").click();
  await expect(page.locator("#reset-message")).toHaveText("Fejl: Password should be different from the old password.");
  await expect(page.locator("#resetSubmitBtn")).toBeEnabled();

  // The success path redirects after 2 s; give it longer than that to prove nothing happens.
  await page.waitForTimeout(2500);
  await expect(page).toHaveURL(/\/reset-password\.html\?forced=1$/);
  const log = await fakeLog(page);
  expect(log.some((e) => e.auth === "updateUser")).toBe(true);
  expect(log.some((e) => e.auth === "signOut")).toBe(false);
  expect(profilesWrites(log)).toEqual([]);
});

test("7c. the e-mail recovery reset (not forced) still changes the password and goes to login, without signing out or writing profiles", async ({ page }) => {
  await page.route("**/login.html", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>login</p>" }));
  await open(page, "/reset-password.html#type=recovery&access_token=fake-access&refresh_token=fake-refresh", {
    session: null,
    recoverySession: { user: { id: "student-1" } },
  });
  await expect(page.locator("#form-section")).toBeVisible();
  await page.locator("#new-password").fill(OWN_PW);
  await page.locator("#confirm-password").fill(OWN_PW);
  await page.locator("#resetSubmitBtn").click();
  await expect(page.locator("#reset-message")).toContainText("Adgangskode opdateret");
  await expect(page).toHaveURL(/\/login\.html$/);

  const log = await fakeLog(page);
  expect(log.some((e) => e.auth === "setSession")).toBe(true);
  expect(log.some((e) => e.auth === "updateUser" && e.hasPassword)).toBe(true);
  expect(log.some((e) => e.auth === "signOut")).toBe(false);
  expect(profilesWrites(log)).toEqual([]);
});

test("8b. an unflagged pupil goes straight to the Hub, not to the reset", async ({ page }) => {
  await page.route("**/hub.html", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>hub</p>" }));
  await open(page, "/login.html", { session: null, profile: { role: "student", must_reset_password: false } });
  await page.locator("#email").fill("maja@skole.dk");
  await page.locator("#password").fill(TEMP_PW);
  await page.locator("#loginBtn").click();
  await expect(page).toHaveURL(/\/hub\.html$/);
});

test("8c. a pupil's very first login (no grade, no identity, no placement) also lands on the Hub, never in the quiz", async ({ page }) => {
  const quizRequests: string[] = [];
  page.on("request", (r) => { if (/\/(index\.html|app\.js)(\?|$)/.test(new URL(r.url()).pathname)) quizRequests.push(r.url()); });
  await page.route("**/hub.html", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>hub</p>" }));
  await open(page, "/login.html", {
    session: null,
    profile: {
      role: "student", must_reset_password: false,
      selected_grade: null, placement_band: null, current_band: null, avatar_identity: null,
    },
  });
  await page.locator("#email").fill("maja@skole.dk");
  await page.locator("#password").fill(TEMP_PW);
  await page.locator("#loginBtn").click();
  await expect(page).toHaveURL(/\/hub\.html$/);
  expect(quizRequests, "login never loads the quiz (and so never starts the placement test)").toEqual([]);
});

for (const [role, target] of [["teacher", "teacher"], ["super_admin", "admin"]]) {
  test(`8d. a ${role} still lands on ${target}.html — never on the Hub`, async ({ page }) => {
    const hubRequests: string[] = [];
    page.on("request", (r) => { if (new URL(r.url()).pathname.endsWith("/hub.html")) hubRequests.push(r.url()); });
    await page.route(`**/${target}.html`, (r) => r.fulfill({ status: 200, contentType: "text/html", body: `<p>${target}</p>` }));
    await open(page, "/login.html", { session: null, profile: { role, must_reset_password: false } });
    await page.locator("#email").fill("laerer@skole.dk");
    await page.locator("#password").fill(TEMP_PW);
    await page.locator("#loginBtn").click();
    await expect(page).toHaveURL(new RegExp(`/${target}\\.html$`));
    expect(hubRequests, `${role} is never sent to the Hub`).toEqual([]);
  });
}

// ── 9. auth on teacher.html is unchanged ─────────────────────────────────────────────────────

test("9. teacher.html still sends a non-teacher, and a signed-out visitor, back to login", async ({ page }) => {
  await page.route("**/login.html", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>login</p>" }));

  await open(page, "/teacher.html", { session: { user: { id: "s-anna" } }, profile: { role: "student" } });
  await expect(page).toHaveURL(/\/login\.html$/);
  expect((await fakeLog(page)).some((e) => e.auth === "signOut")).toBe(true);

  const page2 = await page.context().newPage();
  await page2.route("**/login.html", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>login</p>" }));
  await open(page2, "/teacher.html", { session: null, profile: null });
  await expect(page2).toHaveURL(/\/login\.html$/);
  await page2.close();
});

test("9b. the browser bundle for this flow carries no service-role secret", async () => {
  for (const f of ["teacher.html", "js/teacher.js", "js/supabase.js", "js/login.js", "js/reset-password.js"]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    expect(src, f).not.toMatch(/service_role|SERVICE_ROLE|sb_secret_/);
  }
});

// ── 10. no horizontal overflow ───────────────────────────────────────────────────────────────

for (const vp of [{ name: "mobil", width: 375, height: 812 }, { name: "tablet", width: 768, height: 1024 }]) {
  for (const state of ["empty", "students"] as const) {
    test(`10. ${vp.name} (${vp.width}px), ${state === "empty" ? "0 elever" : "med elever"}: no horizontal page overflow`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openTeacher(page, {
        students: state === "empty" ? [] : THREE_STUDENTS,
        longQuestionIds: ["q"],
        instances: state === "empty" ? [] : [{ student_id: "s-anna", created_at: "2026-10-01T08:00:00Z", user_answer: "x", teacher_score: null, question_id: "q" }],
      });
      if (state === "empty") {
        await page.locator("#studentEmail").fill("en.meget.lang.elevadresse.til.test@eksempel-skole.dk");
        await page.locator("#studentPassword").fill(TEMP_PW);
        await page.getByRole("button", { name: "Opret elev" }).click();
        await expect(page.locator("#createSuccess")).toBeVisible();
      }
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
}

// ── 11. "Klasseaktivitet": a load error or cut-off rows are never shown as inactivity ─────────

const ENG = "#engagement-summary";

function activityNow(studentId: string, n: number) {
  const at = new Date().toISOString();
  return Array.from({ length: n }, () => ({ student_id: studentId, answered_at: at }));
}

async function expectNoInactivityClaim(page: Page) {
  await expect(page.locator("#engagement-table")).not.toContainText("Aldrig");
  await expect(page.locator("#engagement-insights")).not.toContainText("Inaktiv");
  await expect(page.locator("#engagement-insights")).not.toContainText("Alle elever har været aktive");
}

test("11. an activity DATABASE ERROR shows an error with 'Prøv igen' — not 'Aldrig' or 'Inaktiv'", async ({ page }) => {
  const { errors } = await openTeacher(page, { students: THREE_STUDENTS, activityError: "boom" });
  const summary = page.locator(ENG);
  await expect(summary.locator(".panel-state.is-error")).toHaveText(
    "Klasseaktiviteten kunne ikke indlæses. Det betyder ikke, at eleverne har været inaktive.");
  await expect(summary.getByRole("button", { name: "Prøv igen" })).toBeVisible();
  await expect(page.locator(".stat-card")).toHaveCount(0);
  await expect(page.locator("#engagement-table")).toBeEmpty();
  await expect(page.locator("#engagement-insights")).toBeEmpty();
  await expectNoInactivityClaim(page);
  expect(errors).toEqual([]);
});

test("11b. a pupil LOOKUP error in the panel is an error — not 'Ingen elever tilknyttet endnu'", async ({ page }) => {
  await openTeacher(page, { rosterError: "boom" });
  await expect(page.locator(ENG).locator(".panel-state.is-error")).toContainText("Klasseaktiviteten kunne ikke indlæses");
  await expect(page.locator(ENG)).not.toContainText("Ingen elever tilknyttet endnu");
});

test("11c. a valid query with zero activity still shows 0, 'Aldrig' and 'Inaktiv >7 dage'", async ({ page }) => {
  await openTeacher(page, { students: THREE_STUDENTS, activityRows: [] });
  await expect(page.locator("#eng-active-week")).toHaveText("0");
  await expect(page.locator("#eng-today-total")).toHaveText("0");
  await expect(page.locator("#engagement-incomplete")).toHaveCount(0);
  await expect(page.locator(ENG).locator(".is-error")).toHaveCount(0);
  const rows = page.locator("#engagement-table tbody tr");
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(rows.nth(i).locator("td").nth(2)).toHaveText("0");
    await expect(rows.nth(i).locator("td").nth(4)).toHaveText("Aldrig");
  }
  await expect(page.locator("#engagement-insights")).toContainText("Inaktiv >7 dage: anna.h, bo.k, cy.l");
});

test("11d. a complete result shows the activity — and the query asks for an exact count, newest first", async ({ page }) => {
  await openTeacher(page, { students: THREE_STUDENTS, activityRows: activityNow("s-anna", 2) });
  await expect(page.locator("#eng-active-today")).toHaveText("1");
  await expect(page.locator("#eng-today-total")).toHaveText("2");
  await expect(page.locator("#engagement-incomplete")).toHaveCount(0);
  const anna = page.locator("#engagement-table tbody tr").filter({ hasText: "anna.h" });
  await expect(anna.locator("td").nth(2)).toHaveText("2");
  await expect(page.locator("#engagement-insights")).toContainText("Inaktiv >7 dage: bo.k, cy.l");

  const q = (await fakeLog(page)).find((e) =>
    e.table === "question_instances" && e.ops.some((o: any) => o.op === "eq" && o.args[0] === "answered"));
  expect(q.ops).toContainEqual({ op: "select", args: ["student_id, answered_at", { count: "exact" }] });
  expect(q.ops).toContainEqual({ op: "order", args: ["answered_at", { ascending: false }] });
});

test("11e. CUT-OFF rows (count > rows) are flagged, and pupils without rows are 'Ukendt' — not inactive", async ({ page }) => {
  await openTeacher(page, { students: THREE_STUDENTS, activityRows: activityNow("s-anna", 2), activityCount: 7000 });
  await expect(page.locator("#engagement-incomplete")).toContainText("Aktiviteten kunne kun hentes delvist (2 af 7000 besvarelser");
  const rows = page.locator("#engagement-table tbody tr");
  for (const name of ["bo.k", "cy.l"]) {
    const r = rows.filter({ hasText: name });
    await expect(r.locator("td").nth(2)).toHaveText("—");
    await expect(r.locator("td").nth(3)).toHaveText("—");
    await expect(r.locator("td").nth(4)).toHaveText("Ukendt");
    await expect(r.locator(".activity-dot")).toHaveClass(/gray/);
  }
  // What did come back is still shown.
  await expect(rows.filter({ hasText: "anna.h" }).locator("td").nth(2)).toHaveText("2");
  await expectNoInactivityClaim(page);
  await expect(page.locator("#engagement-insights")).not.toContainText("Mest aktiv i dag");
});

test("11f. a MISSING count is treated as possibly incomplete, never as complete", async ({ page }) => {
  await openTeacher(page, { students: THREE_STUDENTS, activityRows: [], activityCount: null });
  await expect(page.locator("#engagement-incomplete")).toContainText("0 af et ukendt antal besvarelser");
  await expectNoInactivityClaim(page);
});

test("11g. 'Prøv igen' after an error loads the panel again and shows the real activity", async ({ page }) => {
  await openTeacher(page, { students: THREE_STUDENTS, activityError: "boom", activityRows: activityNow("s-bo", 3) });
  const retry = page.locator(ENG).getByRole("button", { name: "Prøv igen" });
  await expect(retry).toBeVisible();

  await page.evaluate(() => { (window as any).__FAKE.activityError = null; });
  await retry.click();

  await expect(page.locator(ENG).locator(".is-error")).toHaveCount(0);
  await expect(page.locator(".stat-card")).toHaveCount(4);
  await expect(page.locator("#eng-today-total")).toHaveText("3");
  await expect(page.locator("#engagement-table tbody tr").filter({ hasText: "bo.k" }).locator("td").nth(2)).toHaveText("3");

  const activityQueries = (await fakeLog(page)).filter((e) =>
    e.table === "question_instances" && e.ops.some((o: any) => o.op === "eq" && o.args[0] === "answered"));
  expect(activityQueries).toHaveLength(2);
});

// ── 12. untrusted text is shown as text on every teacher surface ─────────────────────────────
// Pupil names come from an e-mail the teacher typed, and an answer is whatever the pupil typed;
// neither may ever be parsed as HTML. Each payload both alerts and sets a flag, so an executed
// handler is caught either way.

const XSS_ALERT = "<img src=x onerror=alert(1)>";
const XSS_FLAG = `<img src=x onerror="window.__pwned=true">`;
const DK_NAME = "søren.ærø-o'brien";
const INTL_NAME = "zoë.müller-łukasz&co";

function watchForExecution(page: Page) {
  const dialogs: string[] = [];
  page.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}); });
  return {
    dialogs,
    async expectNothingRan() {
      expect(dialogs, "an HTML event handler raised a dialog").toEqual([]);
      expect(await page.evaluate(() => (window as any).__pwned === true), "an HTML event handler ran").toBe(false);
    },
  };
}

test("12. pupil names are text in the class overview, activity panel, insights, spotlights and 'Dine elever'", async ({ page }) => {
  const exec = watchForExecution(page);
  const today = new Date().toISOString();
  await openTeacher(page, {
    students: [
      // Active today (→ "Mest aktiv i dag"), band 5 (→ "Band 5"), spotlighted with a hostile message.
      student({ student_id: "s-x1", display_name: XSS_ALERT, selected_grade: 7, current_band: 5,
        spotlight_label: "Ugens indsats", spotlight_message: XSS_FLAG }),
      // No activity (→ "Inaktiv >7 dage").
      student({ student_id: "s-x2", display_name: XSS_FLAG, selected_grade: 8 }),
      student({ student_id: "s-dk", display_name: DK_NAME, selected_grade: 6 }),
      student({ student_id: "s-in", display_name: INTL_NAME, selected_grade: 9 }),
    ],
    activityRows: [{ student_id: "s-x1", answered_at: today }, { student_id: "s-dk", answered_at: today }, { student_id: "s-in", answered_at: today }],
  });

  const surfaces = ["#classOverview", "#engagement-table", "#engagement-insights", "#spotlightCurrentList", "#studentList"];
  for (const sel of surfaces) {
    await expect(page.locator(`${sel} img`), `${sel} has no injected element`).toHaveCount(0);
  }

  // Class overview: every name cell is the literal value; the rest of the row still renders.
  const ov = page.locator("#classOverview tbody tr");
  await expect(ov.locator("td:first-child")).toHaveText([XSS_ALERT, XSS_FLAG, DK_NAME, INTL_NAME]);
  await expect(ov.nth(0).locator(".grade-chip")).toHaveText("7");
  await expect(page.locator("#classOverview .go-student-btn")).toHaveCount(4);

  // Activity table and insights.
  const eng = page.locator("#engagement-table tbody tr");
  await expect(eng).toHaveCount(4);
  await expect(eng.filter({ hasText: XSS_ALERT }).locator("td").nth(2)).toHaveText("1");
  await expect(eng.filter({ hasText: DK_NAME })).toHaveCount(1);
  await expect(eng.filter({ hasText: INTL_NAME })).toHaveCount(1);
  await expect(page.locator(".stat-card")).toHaveCount(4);
  const ins = page.locator("#engagement-insights strong");
  await expect(ins).toHaveText([XSS_ALERT, XSS_FLAG, XSS_ALERT]); // mest aktiv · inaktiv · band 5

  // Spotlights: name, label and the teacher's message are all text.
  const spot = page.locator("#spotlightCurrentList");
  await expect(spot.locator("strong")).toHaveText(XSS_ALERT);
  await expect(spot).toContainText(`Ugens indsats — "${XSS_FLAG}"`);

  // "Dine elever" keeps its protection.
  await expect(page.locator("#studentRows .row-name")).toHaveText([XSS_ALERT, XSS_FLAG, DK_NAME, INTL_NAME]);

  await exec.expectNothingRan();
});

test("12b. student-detail: the pupil's e-mail and typed answers are text — the review still works", async ({ page }) => {
  const exec = watchForExecution(page);
  await open(page, "/student-detail.html?id=s-x1", {
    ...TEACHER,
    overview: { email: `${XSS_ALERT}@skole.dk`, xp: 40, level: 2, correct_ratio: 50, total_correct_answers: 3, total_attempts: 6 },
    questionContent: {
      "q-1": { question: "Hvad hedder Danmarks hovedstad?", answer: "København" },
      "q-2": { question: "Stav til: øl & æbler", answer: "øl & æbler" },
    },
    detailPending: [
      { id: "i-1", student_id: "s-x1", question_id: "q-1", user_answer: XSS_ALERT, teacher_score: null, teacher_feedback: null, created_at: "2026-10-15T08:00:00Z" },
      { id: "i-2", student_id: "s-x1", question_id: "q-2", user_answer: `${DK_NAME} & ${INTL_NAME}`, teacher_score: null, teacher_feedback: null, created_at: "2026-10-15T08:01:00Z" },
    ],
    detailReviewed: [
      { id: "i-3", student_id: "s-x1", question_id: "q-1", user_answer: XSS_FLAG, teacher_score: 3, teacher_feedback: XSS_ALERT, created_at: "2026-10-14T08:00:00Z" },
    ],
  });

  const info = page.locator("#studentInfo");
  await expect(info).toContainText(`Email: ${XSS_ALERT}@skole.dk`);
  await expect(info).toContainText("XP: 40");

  const review = page.locator("#reviewPanel");
  await expect(review.locator(".box")).toHaveCount(3);
  await expect(review.locator(".box").nth(0)).toContainText(`SVAR${XSS_ALERT}`);
  await expect(review.locator(".box").nth(0)).toContainText("FACITKøbenhavn");
  // Danish and international characters and '&' arrive unchanged — no double escaping.
  await expect(review.locator(".box").nth(1)).toContainText("SPØRGSMÅLStav til: øl & æbler");
  await expect(review.locator(".box").nth(1)).toContainText(`SVAR${DK_NAME} & ${INTL_NAME}`);
  await expect(review.locator(".box").nth(1)).not.toContainText("&amp;");
  await expect(review.locator(".box").nth(2)).toContainText(`SVAR${XSS_FLAG}`);
  await expect(review.locator(".box").nth(2)).toContainText(`Score: 3`);
  await expect(review.locator(".box").nth(2)).toContainText(`Feedback: ${XSS_ALERT}`);

  // The score buttons are still there for each pending answer.
  await expect(review.locator(".box").nth(0).getByRole("button")).toHaveText(["1 – Afvist", "2 – OK", "3 – Godt", "4 – Perfekt"]);

  for (const sel of ["#studentInfo", "#reviewPanel"]) {
    await expect(page.locator(`${sel} img`), `${sel} has no injected element`).toHaveCount(0);
  }
  await exec.expectNothingRan();
});
