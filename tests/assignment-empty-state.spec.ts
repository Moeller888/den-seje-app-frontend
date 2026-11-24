// Section 146: Assignment-aware empty-state UX tests.
//
// Verifies the two-variant no_questions UI:
//   1. Generic (active_domains=null)  → celebration message + hub + retry buttons
//   2. Assignment (active_domains set) → domain-specific message + teacher instruction
//
// The edge function is intercepted via page.route() to return {step:"no_questions"}
// without needing to exhaust the real question pool.

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createE2EAdminClient } from "./e2e-admin.mjs";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";
import { findAuthUserByEmail, PROD, serveCheckoutLogin } from "./helpers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const STUDENT_EMAIL         = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS          = process.env.TEST_STUDENT_PASSWORD!;
const SUPABASE_URL          = process.env.SUPABASE_URL!;

let adminClient: ReturnType<typeof createClient>;
let studentId: string;

test.beforeAll(async () => {
  adminClient = createE2EAdminClient();

  const student = await findAuthUserByEmail(adminClient, STUDENT_EMAIL);
  if (!student) throw new Error(`Test student not found: ${STUDENT_EMAIL}`);
  studentId = student.id;
});

test.afterAll(async () => {
  // Restore no domain restriction
  await adminClient.from("profiles").update({ active_domains: null }).eq("id", studentId);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAndInterceptNoQuestions(page: any, answer: Record<string, unknown> = { step: "no_questions" }) {
  // Intercept get-next-question before navigation so it fires on first load
  await page.route("**/functions/v1/get-next-question", async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(answer),
    });
  });

  await serveCheckoutLogin(page);
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/hub.html`, { timeout: 20000 });
  // A pupil always lands on the Hub; the quiz is one step further (Spil -> index.html).
  await page.goto(`${PROD}/index.html`, { waitUntil: "domcontentloaded" });

  // Wait for empty state
  await expect(page.locator("#question")).toHaveAttribute("data-state", "empty", {
    timeout: 20000,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("1. Generic no_questions (no domains) shows celebration message", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("profiles").update({ active_domains: null }).eq("id", studentId);

  await loginAndInterceptNoQuestions(page);

  // Generic message — no domain restriction
  await expect(page.locator("#question")).toContainText(/ingen flere spørgsmål/i);
  // Must NOT show teacher instruction (that's only for assignment case)
  await expect(page.locator("#no-questions-sub")).not.toBeAttached();
});

test("2. Assignment no_questions shows domain-specific message and teacher instruction", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  // Set a domain restriction so loadActiveDomains() picks it up
  await adminClient
    .from("profiles")
    .update({ active_domains: ["cold_war"] })
    .eq("id", studentId);

  await loginAndInterceptNoQuestions(page);

  // Assignment-specific message
  await expect(page.locator("#question")).toContainText(/ingen flere spørgsmål i det tildelte emne/i);

  // Teacher instruction with domain name
  const sub = page.locator("#no-questions-sub");
  await expect(sub).toBeAttached();
  await expect(sub).toContainText(/spørg din lærer/i);
  await expect(sub).toContainText(/Den Kolde Krig/i);
});

test("3. Retry button appears in generic no_questions state", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("profiles").update({ active_domains: null }).eq("id", studentId);

  await loginAndInterceptNoQuestions(page);

  await expect(page.locator("#retry-question-btn")).toBeVisible();
  await expect(page.locator("#retry-question-btn")).toHaveText("Prøv igen");
});

test("4. Hub button appears in generic no_questions state", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("profiles").update({ active_domains: null }).eq("id", studentId);

  await loginAndInterceptNoQuestions(page);

  await expect(page.locator("#go-hub-btn")).toBeVisible();
  await expect(page.locator("#go-hub-btn")).toHaveText("Gå til hub");
});

test("5. Both recovery buttons appear in assignment no_questions state", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient
    .from("profiles")
    .update({ active_domains: ["democracy_power"] })
    .eq("id", studentId);

  await loginAndInterceptNoQuestions(page);

  await expect(page.locator("#go-hub-btn")).toBeVisible();
  await expect(page.locator("#retry-question-btn")).toBeVisible();
});

test("6. Hub button navigates to hub.html", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("profiles").update({ active_domains: null }).eq("id", studentId);

  await loginAndInterceptNoQuestions(page);

  await page.locator("#go-hub-btn").click();
  await page.waitForURL(`${PROD}/hub.html`, { timeout: 10000 });
});

test("7. D-383: an open Lærligverse course task is explained (kept, finish it there) — not 'no more questions', not the teacher text", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  // With a teacher filter set, so the generic and the assignment texts would both be possible — neither may show.
  await adminClient.from("profiles").update({ active_domains: ["cold_war"] }).eq("id", studentId);

  await loginAndInterceptNoQuestions(page, { step: "no_questions", reason: "course_round_open" });

  await expect(page.locator("#question")).toHaveText("Du har en opgave i gang i Lærligvers");
  const sub = page.locator("#no-questions-sub");
  await expect(sub).toHaveText("Gør den færdig i Lærligvers. Den er gemt, så du fortsætter, hvor du slap. Bagefter kan du fortsætte her.");
  await expect(page.locator("#question")).not.toContainText(/ingen flere spørgsmål/i);
  await expect(sub).not.toContainText(/spørg din lærer/i);
  // The same way on as every empty state: back to the hub, or try again.
  await expect(page.locator("#go-hub-btn")).toBeVisible();
  await expect(page.locator("#retry-question-btn")).toBeVisible();
});
