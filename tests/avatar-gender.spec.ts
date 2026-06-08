// Sections 143 + 144: Avatar gender selection and rendering tests.
// Verifies the gender panel on avatar.html — render, select, persist.
// Section 144 adds data-gender assertions on #avatarWrap (drives CSS background tint).

import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";
import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PROD                  = "https://den-seje-app-frontend.vercel.app";
const STUDENT_EMAIL         = "christnmoeller@hotmail.com";
const STUDENT_PASS          = "Cmiciquru5";
const SUPABASE_URL          = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

let adminClient: ReturnType<typeof createClient>;
let studentId: string;

test.beforeAll(async () => {
  adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: usersData } = await adminClient.auth.admin.listUsers();
  const student = (usersData?.users ?? []).find((u) => u.email === STUDENT_EMAIL);
  if (!student) throw new Error(`Test student not found: ${STUDENT_EMAIL}`);
  studentId = student.id;

  // Reset to neutral so tests start from a known state.
  await adminClient.from("profiles").update({ avatar_gender: "neutral" }).eq("id", studentId);
});

test.afterAll(async () => {
  // Restore neutral after tests.
  await adminClient.from("profiles").update({ avatar_gender: "neutral" }).eq("id", studentId);
});

async function loginAsStudent(page: any) {
  await page.goto(`${PROD}/login.html`, { waitUntil: "domcontentloaded" });
  await page.fill("#email", STUDENT_EMAIL);
  await page.fill("#password", STUDENT_PASS);
  await page.locator("#loginBtn").click();
  await page.waitForURL(`${PROD}/index.html`, { timeout: 20000 });
}

async function openAvatarPage(page: any) {
  await page.goto(`${PROD}/avatar.html`, { waitUntil: "domcontentloaded" });
  // Wait for gender panel to be visible — signals loadAll() completed.
  await page.waitForSelector("#genderButtons .gender-btn", { timeout: 15000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("1. Avatar menu shows all three gender options", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  await expect(page.locator(".gender-btn[data-gender='boy']")).toBeVisible();
  await expect(page.locator(".gender-btn[data-gender='girl']")).toBeVisible();
  await expect(page.locator(".gender-btn[data-gender='neutral']")).toBeVisible();

  await expect(page.locator(".gender-btn[data-gender='boy']")).toHaveText("Dreng");
  await expect(page.locator(".gender-btn[data-gender='girl']")).toHaveText("Pige");
  await expect(page.locator(".gender-btn[data-gender='neutral']")).toHaveText("Neutral");
});

test("2. Student can select Dreng", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  await page.locator(".gender-btn[data-gender='boy']").click();

  // Button must become active (aria-pressed = true).
  await expect(page.locator(".gender-btn[data-gender='boy']")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator(".gender-btn[data-gender='boy']")).toHaveClass(/active/);

  // Others must not be active.
  await expect(page.locator(".gender-btn[data-gender='girl']")).not.toHaveClass(/active/);
  await expect(page.locator(".gender-btn[data-gender='neutral']")).not.toHaveClass(/active/);

  // Rendering: avatarWrap must carry data-gender="boy" (drives blue CSS tint).
  await expect(page.locator("#avatarWrap")).toHaveAttribute("data-gender", "boy");
});

test("3. Student can select Pige", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  await page.locator(".gender-btn[data-gender='girl']").click();

  await expect(page.locator(".gender-btn[data-gender='girl']")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator(".gender-btn[data-gender='girl']")).toHaveClass(/active/);
  await expect(page.locator(".gender-btn[data-gender='boy']")).not.toHaveClass(/active/);
  await expect(page.locator(".gender-btn[data-gender='neutral']")).not.toHaveClass(/active/);

  // Rendering: avatarWrap must carry data-gender="girl" (drives rose CSS tint).
  await expect(page.locator("#avatarWrap")).toHaveAttribute("data-gender", "girl");
});

test("4. Student can select Neutral", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  // Start from 'girl' (set by previous test run via beforeAll reset → test 3 sets girl).
  // We reset in beforeAll so we start neutral; just click neutral explicitly.
  await loginAsStudent(page);
  await openAvatarPage(page);

  // First set something else so the switch is visible.
  await page.locator(".gender-btn[data-gender='boy']").click();
  await expect(page.locator(".gender-btn[data-gender='boy']")).toHaveClass(/active/);

  await page.locator(".gender-btn[data-gender='neutral']").click();

  await expect(page.locator(".gender-btn[data-gender='neutral']")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator(".gender-btn[data-gender='neutral']")).toHaveClass(/active/);
  await expect(page.locator(".gender-btn[data-gender='boy']")).not.toHaveClass(/active/);

  // Rendering: avatarWrap must carry data-gender="neutral" (no tint override).
  await expect(page.locator("#avatarWrap")).toHaveAttribute("data-gender", "neutral");
});

test("5. Selection persists after page refresh", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  // Select 'girl'.
  await page.locator(".gender-btn[data-gender='girl']").click();
  await expect(page.locator(".gender-btn[data-gender='girl']")).toHaveClass(/active/);

  // Reload the page.
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#genderButtons .gender-btn", { timeout: 15000 });

  // 'girl' must still be selected.
  await expect(page.locator(".gender-btn[data-gender='girl']")).toHaveClass(/active/);
  await expect(page.locator(".gender-btn[data-gender='girl']")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  // Rendering: data-gender persists on avatarWrap after reload.
  await expect(page.locator("#avatarWrap")).toHaveAttribute("data-gender", "girl");
});

test("6. Existing avatar menu still works after gender panel added", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  // Inventory panel, slot list, titles panel, and gender panel all present.
  await expect(page.locator("#inventoryGrid")).toBeAttached();
  await expect(page.locator("#slotList")).toBeAttached();
  await expect(page.locator("#titlesPanel")).toBeAttached();
  await expect(page.locator("#genderPanel")).toBeAttached();

  // Avatar preview renders at least the base layer.
  const imgCount = await page.locator("#avatar-preview img").count();
  expect(imgCount).toBeGreaterThanOrEqual(1);
});
