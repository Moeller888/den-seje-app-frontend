// student-detail.html — Lærligverse F10-B2 "Kursusforløb" section behind ENABLE_COURSE_PROGRESS_VIEW.
// ---------------------------------------------------------------------------------------------
// SELF-SERVED, ZERO BACKEND. A local http.Server serves this branch's files; the CDN's Supabase client is
// replaced by tests/support/fake-supabase.ts and every *.supabase.co request is aborted. Off-host requests
// are collected and asserted empty.
//
// FLAG OFF (as committed): the page's DOM is identical to the page with the flag's whole block removed,
// no course module or stylesheet is requested, and get_course_progress is never called.
// FLAG ON (the served student-detail.js has its constant flipped, nothing else): a separate section
// directly under "Fremskridt per domæne", with statuses in words, and an explicit message — never a
// crash — for a refused, failed or malformed result. The ordinary sections stay exactly as with it off.
import { test, expect, type Page } from "@playwright/test";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { FAKE_SUPABASE_MODULE, TEACHER_ID } from "./support/fake-supabase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};
const DETAIL_JS = fs.readFileSync(path.join(ROOT, "js", "student-detail.js"), "utf8");
const FLAG_OFF = "const ENABLE_COURSE_PROGRESS_VIEW = false;";

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

const STUDENT = "s-kursus";
const BASE_FAKE = {
  session: { user: { id: TEACHER_ID } },
  profile: { role: "teacher", selected_grade: 7, placement_band: 3, current_band: 3, active_domains: null },
  overview: { email: "elev@skole.dk", xp: 40, level: 2, correct_ratio: 50, total_correct_answers: 3, total_attempts: 6 },
};

type Variant = "as-committed" | "flag-on" | "block-removed";
function detailSource(variant: Variant): string {
  if (variant === "as-committed") return DETAIL_JS;
  if (variant === "flag-on") {
    expect(DETAIL_JS.split(FLAG_OFF).length, "the flag constant occurs exactly once").toBe(2);
    return DETAIL_JS.replace(FLAG_OFF, "const ENABLE_COURSE_PROGRESS_VIEW = true;");
  }
  const [head, rest] = DETAIL_JS.split("  // COURSE-PROGRESS-VIEW BEGIN\n");
  const tail = rest.split("  // COURSE-PROGRESS-VIEW END\n")[1];
  expect(typeof tail).toBe("string");
  return head + tail;
}

async function openDetail(page: Page, variant: Variant, fake: Record<string, unknown> = {}) {
  const offHost: string[] = [];
  const errors: string[] = [];
  const local: string[] = [];
  const rpcs: string[] = [];
  await page.exposeBinding("__fakeReport", (_src, entry: any) => { if (entry && entry.rpc) rpcs.push(entry.rpc); });
  await page.addInitScript((f) => { (window as any).__FAKE = { log: [], ...f }; }, { ...BASE_FAKE, ...fake });
  await page.route("**/cdn.jsdelivr.net/**", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/javascript; charset=utf-8" }, body: FAKE_SUPABASE_MODULE }));
  await page.route("**/*.supabase.co/**", (route) => route.abort());
  await page.route("**/js/student-detail.js", (route) =>
    route.fulfill({ status: 200, headers: { "content-type": "text/javascript; charset=utf-8" }, body: detailSource(variant) }));
  page.on("request", (r) => {
    const u = r.url();
    if (u.startsWith(baseUrl)) { local.push(u.slice(baseUrl.length)); return; }
    if (u.startsWith("data:") || u.startsWith("about:") || u.includes("cdn.jsdelivr.net")) return;
    offHost.push(u);
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${baseUrl}/student-detail.html?id=${STUDENT}`, { waitUntil: "load" });
  await expect(page.locator("#studentInfo")).toContainText("Email: elev@skole.dk");
  await expect(page.locator("#domainProgressPanel")).not.toHaveText("Indlæser...");
  await page.waitForLoadState("networkidle");
  return { offHost, errors, local, rpcs };
}

const pageHtml = (page: Page) => page.locator(".page").evaluate((n) => n.innerHTML);

const step = (o: Record<string, unknown>) => ({
  correct: null, attempt_no: null, hints_used: null, mode: null, grading: null, source: null,
  first_answer_at: o.status === "served" ? null : o.at, served_at: o.at,
  sequence: { answered: o.status !== "served", was_correct: o.correct ?? null, answered_at: o.status === "served" ? null : o.at },
  ...o,
});
const COURSE = {
  version: 1, rules: "evidence.ts@3d4a7c1c269c", sources: { attempt_log: true, mode: true, hints: true },
  objectives: [
    {
      objective_id: "kildekritik_legacy", started_at: "2026-11-05T08:00:00Z",
      steps: [
        step({ step: "guided_practice", status: "answered", correct: true, evidence: "practice", source: "instance", at: "2026-11-05T08:05:00Z" }),
        step({ step: "independent_application", status: "answered", correct: true, attempt_no: 1, evidence: "unknown", source: "instance", at: "2026-11-05T08:10:00Z" }),
      ],
    },
    {
      objective_id: "kildekritik_ophav", started_at: "2026-11-03T08:00:00Z",
      steps: [
        step({ step: "guided_practice", status: "answered", correct: false, hints_used: 2, mode: "practice", evidence: "practice", source: "attempt", grading: "auto", at: "2026-11-03T08:05:00Z" }),
        step({ step: "revision", status: "answered", correct: true, attempt_no: 1, hints_used: 0, mode: "practice", evidence: "practice", source: "attempt", grading: "auto", at: "2026-11-03T08:10:00Z" }),
        step({ step: "independent_application", status: "answered", correct: true, attempt_no: 1, hints_used: 0, mode: "check", evidence: "shown_independently", source: "attempt", grading: "auto", at: "2026-11-03T08:15:00Z" }),
        { ...step({ step: "transfer", status: "answered", correct: false, attempt_no: 2, hints_used: 0, mode: "application", evidence: "not_shown", source: "attempt", grading: "auto", at: "2026-11-03T08:20:00Z" }),
          sequence: { answered: true, was_correct: true, answered_at: "2026-11-03T08:21:00Z" } },
        step({ step: "revisit", status: "answered", correct: true, attempt_no: 1, hints_used: 1, mode: "review", evidence: "not_shown", source: "attempt", grading: "auto", at: "2026-11-11T09:00:00Z" }),
      ],
    },
  ],
};

test("flag off: identical DOM to the page without the flag's block, no extra request, no course RPC", async ({ browser }) => {
  const a = await browser.newPage();
  const off = await openDetail(a, "as-committed", { courseProgress: COURSE });
  const b = await browser.newPage();
  const without = await openDetail(b, "block-removed", { courseProgress: COURSE });

  expect(await pageHtml(a)).toBe(await pageHtml(b));
  await expect(a.locator("#courseProgressSection")).toHaveCount(0);
  await expect(a.locator(".page > .box")).toHaveCount(7);
  expect(off.local.filter((u) => /course-progress/.test(u))).toEqual([]);
  expect(off.rpcs).not.toContain("get_course_progress");
  expect(off.rpcs).toEqual(without.rpcs);
  expect([...off.local].sort()).toEqual([...without.local].sort());
  expect(off.offHost).toEqual([]);
  expect(off.errors).toEqual([]);
  await a.close();
  await b.close();
});

test("flag on: a separate 'Kursusforløb' section under the domain section, statuses in words", async ({ page, browser }) => {
  const on = await openDetail(page, "flag-on", { courseProgress: COURSE });
  const section = page.locator("#courseProgressSection");
  await expect(section.getByRole("heading", { level: 3 })).toHaveText("Kursusforløb");
  await expect(section.locator(".course-progress-card")).toHaveCount(2);

  // Placement: directly after "Fremskridt per domæne", before the review queue.
  const order = await page.locator(".page > .box").evaluateAll((boxes) => boxes.map((b) => b.querySelector("h3")?.textContent ?? ""));
  expect(order.indexOf("Kursusforløb")).toBe(order.indexOf("Fremskridt per domæne") + 1);
  expect(order.indexOf("Spørgsmål til godkendelse")).toBe(order.indexOf("Kursusforløb") + 1);

  const ophav = section.locator(".course-progress-card").nth(1);
  await expect(ophav.locator("h4")).toHaveText("kildekritik_ophav");
  await expect(ophav.locator(".course-progress-summary")).toHaveText("Løst selvstændigt i 1 af 3 bedømte trin.");
  await expect(ophav.locator("tbody .course-progress-status")).toHaveText(["Gennemført", "Gennemført", "Løst", "Løst ved 2. forsøg", "Løst"]);
  await expect(ophav.locator("tbody .course-progress-help")).toHaveText(["2 hints", "0 hints", "0 hints", "0 hints", "1 hint"]);
  await expect(ophav.locator("tbody .course-progress-evidence")).toHaveText([
    "Øvelse (tæller ikke)", "Øvelse (tæller ikke)", "Løst selvstændigt", "Ikke løst selvstændigt", "Ikke løst selvstændigt"]);
  await expect(ophav.locator(".course-progress-note")).toHaveText("Gentaget senere (8 dage efter anvendelsen)");
  await expect(ophav.getByRole("columnheader")).toHaveText(["Trin", "Status", "Hjælp", "Evidens"]);

  const legacy = section.locator(".course-progress-card").nth(0);
  await expect(legacy.locator("tbody .course-progress-help")).toHaveText(["Ikke registreret", "Ikke registreret"]);
  await expect(legacy.locator(".course-progress-summary")).toHaveText("Løst selvstændigt: ikke registreret (1 bedømt trin).");

  expect(await section.textContent()).not.toMatch(/%|lært|mestret|forstået/);
  expect(on.rpcs.filter((r) => r === "get_course_progress")).toHaveLength(1);
  expect(on.offHost).toEqual([]);
  expect(on.errors).toEqual([]);

  // The ordinary sections are exactly what they are with the flag off.
  const other = await browser.newPage();
  await openDetail(other, "as-committed", { courseProgress: COURSE });
  const ordinary = (p: Page) => p.locator(".page > .box:not(#courseProgressSection)").evaluateAll((b) => b.map((n) => n.outerHTML));
  expect(await ordinary(page)).toEqual(await ordinary(other));
  await other.close();
});

for (const [name, fake, message] of [
  ["refused or unknown pupil (NULL)", {}, "Kursusforløbet er ikke tilgængeligt for denne elev."],
  ["a failed call", { courseProgressError: "boom" }, "Kursusforløbet kunne ikke hentes. Prøv igen senere."],
  ["a malformed result", { courseProgress: { objectives: "nej" } }, "Kursusdata har et uventet format og kan ikke vises."],
  ["no course yet", { courseProgress: { version: 1, objectives: [] } }, "Eleven har ikke påbegyndt et kursusforløb."],
] as const) {
  test(`flag on, ${name}: an explicit message in the section, the rest of the page intact`, async ({ page }) => {
    const on = await openDetail(page, "flag-on", fake as Record<string, unknown>);
    const msg = page.locator("#courseProgressPanel .course-progress-message");
    await expect(msg).toHaveText(message);
    await expect(msg).toHaveAttribute("role", "status");
    await expect(page.locator("#courseProgressPanel table")).toHaveCount(0);
    await expect(page.locator("#reviewPanel")).toBeVisible();
    expect(on.errors).toEqual([]);
    expect(on.offHost).toEqual([]);
  });
}
