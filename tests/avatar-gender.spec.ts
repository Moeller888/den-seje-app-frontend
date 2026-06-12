// Sections 143-145 + 152C.
// Tests 1-6 (rewritten in Section 152C): the identity panel on avatar.html
// replaced the gender panel — body choice now writes avatar_identity via the
// set_avatar_identity RPC and re-renders the body immediately.
// Tests 7-11 (unchanged): the gender TINT system (avatar_gender → data-gender
// on the hub showcase) is explicitly untouched by 152C and still verified.

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

const BODY_FILE_FOR: Record<string, string> = {
  neutral: "/assets/avatar/base/body.svg",
  male:    "/assets/avatar/base/body-male.svg",
  female:  "/assets/avatar/base/body-female.svg",
};

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

  // Known starting state: neutral tint + neutral identity with chosen_at SET
  // (suppresses the 152C identity prompt on index.html during login).
  await adminClient
    .from("profiles")
    .update({
      avatar_gender: "neutral",
      avatar_identity: { v: 1, body_type: "neutral", chosen_at: new Date().toISOString() },
    })
    .eq("id", studentId);
});

test.afterAll(async () => {
  await adminClient
    .from("profiles")
    .update({
      avatar_gender: "neutral",
      avatar_identity: { v: 1, body_type: "neutral", chosen_at: new Date().toISOString() },
    })
    .eq("id", studentId);
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
  // Identity buttons render at the end of loadAll() — signals load complete.
  await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });
}

// ── Tests 1-6: identity panel (Section 152C) ──────────────────────────────────

test("1. Identity panel shows all three body options", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  await expect(page.locator(".identity-btn[data-body-type='male']")).toBeVisible();
  await expect(page.locator(".identity-btn[data-body-type='female']")).toBeVisible();
  await expect(page.locator(".identity-btn[data-body-type='neutral']")).toBeVisible();

  await expect(page.locator(".identity-btn[data-body-type='male']")).toHaveText("Dreng");
  await expect(page.locator(".identity-btn[data-body-type='female']")).toHaveText("Pige");
  await expect(page.locator(".identity-btn[data-body-type='neutral']")).toHaveText("Neutral");
});

test("2. Student can select Dreng — body re-renders immediately", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  await page.locator(".identity-btn[data-body-type='male']").click();

  await expect(page.locator(".identity-btn[data-body-type='male']")).toHaveClass(/active/);
  await expect(page.locator(".identity-btn[data-body-type='male']")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.locator(".identity-btn[data-body-type='female']")).not.toHaveClass(/active/);

  // Body re-rendered with the male base.
  await expect(
    page.locator(`#avatar-preview img.avatar-layer[src*="${BODY_FILE_FOR.male}"]`)
  ).toBeAttached();

  // Persisted via RPC.
  const { data: row } = await adminClient
    .from("profiles")
    .select("avatar_identity")
    .eq("id", studentId)
    .maybeSingle();
  expect((row as any)?.avatar_identity?.body_type).toBe("male");
  expect((row as any)?.avatar_identity?.chosen_at).toBeTruthy();
});

test("3. Student can select Pige — body re-renders immediately", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  await page.locator(".identity-btn[data-body-type='female']").click();

  await expect(page.locator(".identity-btn[data-body-type='female']")).toHaveClass(/active/);
  await expect(
    page.locator(`#avatar-preview img.avatar-layer[src*="${BODY_FILE_FOR.female}"]`)
  ).toBeAttached();
});

test("4. Student can select Neutral — body returns to the neutral base", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  // Switch away first so the change is observable.
  await page.locator(".identity-btn[data-body-type='male']").click();
  await expect(page.locator(".identity-btn[data-body-type='male']")).toHaveClass(/active/);

  await page.locator(".identity-btn[data-body-type='neutral']").click();

  await expect(page.locator(".identity-btn[data-body-type='neutral']")).toHaveClass(/active/);
  await expect(
    page.locator(`#avatar-preview img.avatar-layer[src*="${BODY_FILE_FOR.neutral}"]`)
  ).toBeAttached();
});

test("5. Identity selection persists after page refresh", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  await page.locator(".identity-btn[data-body-type='female']").click();
  await expect(page.locator(".identity-btn[data-body-type='female']")).toHaveClass(/active/);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#identityButtons .identity-btn", { timeout: 15000 });

  await expect(page.locator(".identity-btn[data-body-type='female']")).toHaveClass(/active/);
  await expect(
    page.locator(`#avatar-preview img.avatar-layer[src*="${BODY_FILE_FOR.female}"]`)
  ).toBeAttached();
});

test("6. Existing avatar menu still works with the identity panel", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openAvatarPage(page);

  await expect(page.locator("#inventoryGrid")).toBeAttached();
  await expect(page.locator("#slotList")).toBeAttached();
  await expect(page.locator("#titlesPanel")).toBeAttached();
  await expect(page.locator("#identityPanel")).toBeAttached();

  const imgCount = await page.locator("#avatar-preview img").count();
  expect(imgCount).toBeGreaterThanOrEqual(1);
});

// ── Tests 7-11: hub gender tint (Sections 144-145 — UNTOUCHED by 152C) ───────

async function openHubPage(page: any) {
  await page.goto(`${PROD}/hub.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#profileAvatar img", { timeout: 15000 });
}

test("7. hub.html loads avatar_gender and sets data-gender on avatarShowcase", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("profiles").update({ avatar_gender: "boy" }).eq("id", studentId);

  await loginAsStudent(page);
  await openHubPage(page);

  await expect(page.locator("#avatarShowcase")).toHaveAttribute("data-gender", "boy");
});

test("8. boy gender applies data-gender='boy' on hub avatarShowcase", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("profiles").update({ avatar_gender: "boy" }).eq("id", studentId);

  await loginAsStudent(page);
  await openHubPage(page);

  await expect(page.locator("#avatarShowcase")).toHaveAttribute("data-gender", "boy");
});

test("9. girl gender applies data-gender='girl' on hub avatarShowcase", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("profiles").update({ avatar_gender: "girl" }).eq("id", studentId);

  await loginAsStudent(page);
  await openHubPage(page);

  await expect(page.locator("#avatarShowcase")).toHaveAttribute("data-gender", "girl");
});

test("10. neutral gender applies data-gender='neutral' on hub avatarShowcase", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await adminClient.from("profiles").update({ avatar_gender: "neutral" }).eq("id", studentId);

  await loginAsStudent(page);
  await openHubPage(page);

  await expect(page.locator("#avatarShowcase")).toHaveAttribute("data-gender", "neutral");
});

test("11. hub page renders avatar and profile card normally", async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== "chromium", "UI dedup");

  await loginAsStudent(page);
  await openHubPage(page);

  await expect(page.locator("#avatarShowcase")).toBeAttached();
  const imgCount = await page.locator("#profileAvatar img").count();
  expect(imgCount).toBeGreaterThanOrEqual(1);

  const gender = await page.locator("#avatarShowcase").getAttribute("data-gender");
  expect(["boy", "girl", "neutral"]).toContain(gender);
});
