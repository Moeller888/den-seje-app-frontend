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

test("7/8. a flagged pupil is sent from login to the forced reset, which clears the flag", async ({ page }) => {
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

  const log = await fakeLog(page);
  expect(log.some((e) => e.auth === "updateUser" && e.hasPassword)).toBe(true);
  const clear = log.find((e) => e.table === "profiles" && e.ops.some((o: any) => o.op === "update"));
  expect(clear.ops.find((o: any) => o.op === "update").args[0]).toEqual({ must_reset_password: false });
  expect(log.some((e) => e.auth === "signOut")).toBe(true);
});

test("8b. an unflagged pupil goes straight to the app, not to the reset", async ({ page }) => {
  await page.route("**/index.html", (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>app</p>" }));
  await open(page, "/login.html", { session: null, profile: { role: "student", must_reset_password: false } });
  await page.locator("#email").fill("maja@skole.dk");
  await page.locator("#password").fill(TEMP_PW);
  await page.locator("#loginBtn").click();
  await expect(page).toHaveURL(/\/index\.html$/);
});

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
