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
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PROD                  = "https://den-seje-app-frontend.vercel.app";
const STUDENT_EMAIL         = process.env.TEST_STUDENT_EMAIL!;
const STUDENT_PASS          = process.env.TEST_STUDENT_PASSWORD!;
const SUPABASE_URL          = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient>;
let studentId: string;

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: users } = await adminClient.auth.admin.listUsers();
  const student = (users?.users ?? []).find((u) => u.email === STUDENT_EMAIL);
  if (!student) throw new Error(`Student not found: ${STUDENT_EMAIL}`);
  studentId = student.id;
});

test.afterAll(async () => {
  // Restore no domain restriction
  await adminClient.from("profiles").update({ active_domains: null }).eq("id", studentId);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loginAndInterceptNoQuestions(page: any) {
  // Intercept get-next-question before navigation so it fires on first load
  await page.route("**/functions/v1/get-next-question", async (route: any) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ step: "no_questions" }),
    });
  });

  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });

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
